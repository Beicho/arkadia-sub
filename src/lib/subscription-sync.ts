import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { asc, eq, sql } from "drizzle-orm";
import { parse as parseYaml } from "yaml";
import { db, type DbTx } from "@/db/client";
import { nodeBatches, settings, socksPool } from "@/db/schema";
import { activateBatch } from "@/lib/batches";
import { isNodeLine, normalizeNodeInput, tryDecodeBase64 } from "@/lib/nodes";
import {
  pickDailySocks,
  socksNodeName,
  type SocksEntry,
} from "@/lib/socks-parse";
import { shanghaiToday } from "@/lib/time";

export const DEFAULT_SUBSCRIPTION_SOURCE_URL =
  "https://subscription.example.com";

export const SUBSCRIPTION_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1_000;

const CONFIG_KEY = "subscription_sync_config";
const STATUS_KEY = "subscription_sync_status";
const ADVISORY_LOCK_ID = 0x41524b53;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

export type SubscriptionSyncConfig = {
  sourceUrl: string;
  enabled: boolean;
};

export type SubscriptionSyncStatus = {
  state: "never" | "success" | "unchanged" | "failed";
  lastAttemptAt: string | null;
  lastAutoAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastBatchId: number | null;
  upstreamNodeCount: number;
  extraNodeCount: number;
  totalNodeCount: number;
  error: string | null;
  contentHash?: string;
};

export type SubscriptionSyncResult =
  | {
      outcome: "created";
      batchId: number;
      upstreamNodeCount: number;
      extraNodeCount: number;
      totalNodeCount: number;
    }
  | {
      outcome: "unchanged";
      batchId: number | null;
      upstreamNodeCount: number;
      extraNodeCount: number;
      totalNodeCount: number;
    }
  | { outcome: "busy" | "disabled" | "not_due" };

export type RunSubscriptionSyncOptions = {
  trigger: "manual" | "automatic";
  actorUserId?: number | null;
  /**
   * 调用方可把当次选出的 SOCKS/HTTP 福利节点传进来。同步器会与上游节点
   * 一起去重、只创建一个批次并原子激活，避免两个任务互相覆盖。
   */
  extraNodes?: readonly string[];
  now?: Date;
};

const DEFAULT_STATUS: SubscriptionSyncStatus = {
  state: "never",
  lastAttemptAt: null,
  lastAutoAttemptAt: null,
  lastSuccessAt: null,
  lastBatchId: null,
  upstreamNodeCount: 0,
  extraNodeCount: 0,
  totalNodeCount: 0,
  error: null,
};

type JsonRunner = typeof db | DbTx;

async function readJsonSetting<T>(
  runner: JsonRunner,
  key: string,
): Promise<T | null> {
  const [row] = await runner
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return (row?.value as T | null | undefined) ?? null;
}

async function writeJsonSetting(
  runner: JsonRunner,
  key: string,
  value: unknown,
): Promise<void> {
  await runner
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never },
    });
}

function normalizeConfig(value: SubscriptionSyncConfig | null): SubscriptionSyncConfig {
  return {
    sourceUrl:
      typeof value?.sourceUrl === "string" && value.sourceUrl.trim()
        ? value.sourceUrl.trim()
        : process.env.UPSTREAM_SUBSCRIPTION_URL?.trim() ||
          DEFAULT_SUBSCRIPTION_SOURCE_URL,
    enabled: value?.enabled !== false,
  };
}

function normalizeStatus(value: SubscriptionSyncStatus | null): SubscriptionSyncStatus {
  return { ...DEFAULT_STATUS, ...(value ?? {}) };
}

export async function getSubscriptionSyncAdminState(): Promise<{
  config: SubscriptionSyncConfig;
  status: Omit<SubscriptionSyncStatus, "contentHash">;
}> {
  const [storedConfig, storedStatus] = await Promise.all([
    readJsonSetting<SubscriptionSyncConfig>(db, CONFIG_KEY),
    readJsonSetting<SubscriptionSyncStatus>(db, STATUS_KEY),
  ]);
  const { contentHash: _contentHash, ...status } = normalizeStatus(storedStatus);
  void _contentHash;
  return { config: normalizeConfig(storedConfig), status };
}

export async function saveSubscriptionSyncConfig(input: {
  sourceUrl?: string;
  enabled?: boolean;
}): Promise<SubscriptionSyncConfig> {
  const current = normalizeConfig(
    await readJsonSetting<SubscriptionSyncConfig>(db, CONFIG_KEY),
  );
  const config = {
    sourceUrl: input.sourceUrl?.trim() || DEFAULT_SUBSCRIPTION_SOURCE_URL,
    enabled: input.enabled ?? current.enabled,
  };
  validateSourceUrlSyntax(config.sourceUrl);
  await writeJsonSetting(db, CONFIG_KEY, config);
  return config;
}

/**
 * 获取、解析并发布一次上游订阅。跨实例用 PostgreSQL advisory xact lock 防重入；
 * 拉取、建批次、切换激活均处于同一事务，任何一步失败都会保留旧激活批次。
 */
export async function runSubscriptionSync(
  options: RunSubscriptionSyncOptions,
): Promise<SubscriptionSyncResult> {
  const now = options.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const lockRows = await tx.execute(
        sql<{ acquired: boolean }>`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
      );
      if (lockRows[0]?.acquired !== true) return { outcome: "busy" as const };

      const config = normalizeConfig(
        await readJsonSetting<SubscriptionSyncConfig>(tx, CONFIG_KEY),
      );
      if (options.trigger === "automatic" && !config.enabled) {
        return { outcome: "disabled" as const };
      }

      const previousStatus = normalizeStatus(
        await readJsonSetting<SubscriptionSyncStatus>(tx, STATUS_KEY),
      );
      if (
        options.trigger === "automatic" &&
        previousStatus.lastAutoAttemptAt &&
        now.getTime() - new Date(previousStatus.lastAutoAttemptAt).getTime() <
          SUBSCRIPTION_SYNC_INTERVAL_MS
      ) {
        return { outcome: "not_due" as const };
      }

      const raw = await fetchSubscriptionText(config.sourceUrl);
      const upstreamNodes = parseSubscriptionNodes(raw);
      if (upstreamNodes.length === 0) {
        throw new Error("上游内容中没有解析到可用节点");
      }

      const extraNodes = dedupeNodes(
        options.extraNodes ?? (await selectDailyPoolProxyUris(tx)),
      );
      const nodes = dedupeNodes([...upstreamNodes, ...extraNodes]);
      const hash = hashNodes(nodes);
      const [active] = await tx
        .select({ id: nodeBatches.id, nodes: nodeBatches.nodes })
        .from(nodeBatches)
        .where(eq(nodeBatches.isActive, true))
        .limit(1);
      const activeHash = active ? hashNodes(active.nodes as string[]) : null;
      const attemptedAt = now.toISOString();
      const statusBase = {
        ...previousStatus,
        lastAttemptAt: attemptedAt,
        lastAutoAttemptAt:
          options.trigger === "automatic"
            ? attemptedAt
            : previousStatus.lastAutoAttemptAt,
        lastSuccessAt: attemptedAt,
        upstreamNodeCount: upstreamNodes.length,
        extraNodeCount: extraNodes.length,
        totalNodeCount: nodes.length,
        error: null,
        contentHash: hash,
      };

      // 手动重复点击时避免制造完全相同的历史记录；自动任务仍严格按运营要求
      // 每 4 小时创建并切换一个新批次。同一 batchDate 内用户不会重复扣额度。
      if (options.trigger === "manual" && activeHash === hash) {
        await writeJsonSetting(tx, STATUS_KEY, {
          ...statusBase,
          state: "unchanged",
          lastBatchId: active?.id ?? previousStatus.lastBatchId,
        } satisfies SubscriptionSyncStatus);
        return {
          outcome: "unchanged" as const,
          batchId: active?.id ?? null,
          upstreamNodeCount: upstreamNodes.length,
          extraNodeCount: extraNodes.length,
          totalNodeCount: nodes.length,
        };
      }

      const batchDate = shanghaiToday();
      const [created] = await tx
        .insert(nodeBatches)
        .values({
          title: `订阅同步 ${formatShanghaiTimestamp(now)}`,
          nodes,
          batchDate,
          nodeCount: nodes.length,
          isActive: false,
          createdBy: options.actorUserId ?? null,
        })
        .returning({ id: nodeBatches.id });

      await activateBatch(tx, created.id);
      await writeJsonSetting(tx, STATUS_KEY, {
        ...statusBase,
        state: "success",
        lastBatchId: created.id,
      } satisfies SubscriptionSyncStatus);

      return {
        outcome: "created" as const,
        batchId: created.id,
        upstreamNodeCount: upstreamNodes.length,
        extraNodeCount: extraNodes.length,
        totalNodeCount: nodes.length,
      };
    });
  } catch (error) {
    await recordSyncFailure(options.trigger, now, error);
    throw new Error(safeErrorMessage(error));
  }
}

/** 从已测可用代理池生成当次 60 个福利 URI：30 个原生/家宽 + 30 个速度优选。 */
async function selectDailyPoolProxyUris(tx: DbTx): Promise<string[]> {
  const rows = await tx
    .select()
    .from(socksPool)
    .where(eq(socksPool.status, "ok"))
    .orderBy(asc(socksPool.latencyMs))
    .limit(2_000);
  const selected = pickDailySocks(
    rows.map((row) => ({
      entry: poolRowToEntry(row),
      latencyMs: row.latencyMs ?? 9_999,
    })),
    60,
    30,
  );
  return selected.map(({ entry }) => {
    const scheme = entry.protocol === "http" ? "http" : "socks5";
    return `${scheme}://${formatHost(entry.host)}:${entry.port}#${encodeURIComponent(socksNodeName(entry))}`;
  });
}

function poolRowToEntry(row: typeof socksPool.$inferSelect): SocksEntry {
  const tags = row.tags ?? [];
  return {
    host: row.host,
    port: row.port,
    protocol: row.protocol === "http" ? "http" : "socks5",
    line: row.line,
    tags,
    nativeIp: tags.includes("原生IP"),
    residential: tags.includes("家宽"),
    country: row.country,
    region: row.region,
    provider: row.provider,
    riskScore: row.riskScore,
  };
}

async function recordSyncFailure(
  trigger: RunSubscriptionSyncOptions["trigger"],
  now: Date,
  error: unknown,
): Promise<void> {
  try {
    const previous = normalizeStatus(
      await readJsonSetting<SubscriptionSyncStatus>(db, STATUS_KEY),
    );
    const attemptedAt = now.toISOString();
    await writeJsonSetting(db, STATUS_KEY, {
      ...previous,
      state: "failed",
      lastAttemptAt: attemptedAt,
      lastAutoAttemptAt:
        trigger === "automatic" ? attemptedAt : previous.lastAutoAttemptAt,
      error: safeErrorMessage(error),
    } satisfies SubscriptionSyncStatus);
  } catch (statusError) {
    console.error("[subscription-sync] failed to save status", statusError);
  }
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "订阅同步失败";
  return message
    .replace(/https?:\/\/\S+/gi, "[上游地址]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240);
}

function formatShanghaiTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function hashNodes(nodes: readonly string[]): string {
  return createHash("sha256")
    .update([...new Set(nodes)].sort().join("\n"))
    .digest("hex");
}

function dedupeNodes(nodes: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of nodes) {
    const node = raw.trim();
    if (!node || !isProxyUri(node) || seen.has(node)) continue;
    seen.add(node);
    result.push(node);
  }
  return result;
}

function isProxyUri(value: string): boolean {
  if (isNodeLine(value) || /^socks5:\/\//i.test(value)) return true;
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    // 普通网页地址不是代理节点；HTTP 代理至少应有显式端口或认证信息。
    return Boolean(url.port || url.username || url.password);
  } catch {
    return false;
  }
}

/** 解析 raw URI、整段 base64，或完整 Clash YAML 顶层 proxies。 */
export function parseSubscriptionNodes(raw: string): string[] {
  // 必须先识别整段 Base64：normalizeNodeInput 的协议白名单不含 HTTP/SOCKS5，
  // 若先调用它，会在混合订阅里拿到部分节点后提前返回，静默漏掉其余协议。
  const compact = raw.replace(/\s+/g, "");
  if (!raw.includes("://")) {
    const decoded = tryDecodeBase64(compact);
    if (decoded && decoded !== raw) {
      const decodedNodes = parseSubscriptionNodes(decoded);
      if (decodedNodes.length > 0) return decodedNodes;
    }
  }

  const direct = dedupeNodes(normalizeNodeInput(raw));
  const lineCandidates = dedupeNodes(
    raw
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.trim()),
  );
  const rawNodes = dedupeNodes([...direct, ...lineCandidates]);
  if (rawNodes.length > 0) return rawNodes;

  let document: unknown;
  try {
    document = parseYaml(raw, { maxAliasCount: 50 });
  } catch {
    return [];
  }
  const root = asRecord(document);
  if (!root || !Array.isArray(root.proxies)) return [];
  return dedupeNodes(
    root.proxies
      .map((proxy) => clashProxyToUri(proxy))
      .filter((uri): uri is string => Boolean(uri)),
  );
}

function clashProxyToUri(value: unknown): string | null {
  const proxy = asRecord(value);
  if (!proxy) return null;
  const type = text(proxy.type).toLowerCase();
  const server = text(proxy.server);
  const port = positivePort(proxy.port);
  if (!type || !server || !port) return null;

  const name = text(proxy.name) || `${type}-${server}`;
  const endpoint = `${formatHost(server)}:${port}`;
  const fragment = `#${encodeURIComponent(name)}`;

  if (type === "vless") {
    const uuid = text(proxy.uuid);
    if (!uuid) return null;
    const params = new URLSearchParams();
    params.set("encryption", text(proxy.encryption) || "none");
    const network = text(proxy.network) || "tcp";
    params.set("type", network);
    const reality = asRecord(proxy["reality-opts"]);
    const tls = bool(proxy.tls);
    params.set("security", reality ? "reality" : tls ? "tls" : "none");
    if (bool(proxy["skip-cert-verify"])) params.set("allowInsecure", "1");
    setParam(params, "sni", text(proxy.servername) || text(proxy.sni));
    setParam(params, "fp", text(proxy["client-fingerprint"]));
    setParam(params, "flow", text(proxy.flow));
    setParam(params, "pbk", text(reality?.["public-key"]));
    setParam(params, "sid", text(reality?.["short-id"]));
    if (network === "ws") {
      const ws = asRecord(proxy["ws-opts"]);
      setParam(params, "path", text(ws?.path) || "/");
      const headers = asRecord(ws?.headers);
      setParam(params, "host", text(headers?.Host) || text(headers?.host));
    } else if (network === "grpc") {
      const grpc = asRecord(proxy["grpc-opts"]);
      setParam(params, "serviceName", text(grpc?.["grpc-service-name"]));
    }
    return `vless://${encodeURIComponent(uuid)}@${endpoint}?${params}${fragment}`;
  }

  if (type === "vmess") {
    const uuid = text(proxy.uuid);
    if (!uuid) return null;
    const ws = asRecord(proxy["ws-opts"]);
    const headers = asRecord(ws?.headers);
    const payload = {
      v: "2",
      ps: name,
      add: server,
      port: String(port),
      id: uuid,
      aid: String(number(proxy.alterId ?? proxy["alter-id"]) ?? 0),
      scy: text(proxy.cipher) || "auto",
      security: text(proxy.cipher) || "auto",
      net: text(proxy.network) || "tcp",
      type: "none",
      host: text(headers?.Host) || text(headers?.host),
      path: text(ws?.path),
      tls: bool(proxy.tls) ? "tls" : "",
      sni: text(proxy.servername),
    };
    return `vmess://${Buffer.from(JSON.stringify(payload)).toString("base64")}`;
  }

  if (type === "ss") {
    const method = text(proxy.cipher);
    const password = text(proxy.password);
    if (!method || !password) return null;
    const auth = Buffer.from(`${method}:${password}`).toString("base64url");
    return `ss://${auth}@${endpoint}${fragment}`;
  }

  if (type === "trojan") {
    const password = text(proxy.password);
    if (!password) return null;
    const params = new URLSearchParams({ security: "tls" });
    setParam(params, "sni", text(proxy.sni) || text(proxy.servername));
    if (bool(proxy["skip-cert-verify"])) params.set("allowInsecure", "1");
    return `trojan://${encodeURIComponent(password)}@${endpoint}?${params}${fragment}`;
  }

  if (type === "hysteria2" || type === "hy2") {
    const password = text(proxy.password) || text(proxy.auth);
    if (!password) return null;
    const params = new URLSearchParams();
    setParam(params, "sni", text(proxy.sni) || text(proxy.servername));
    if (bool(proxy["skip-cert-verify"])) params.set("insecure", "1");
    setParam(params, "pinSHA256", text(proxy["pinned-sha256"]));
    const obfs = asRecord(proxy.obfs);
    setParam(params, "obfs", text(obfs?.type) || text(proxy.obfs));
    setParam(
      params,
      "obfs-password",
      text(obfs?.password) || text(proxy["obfs-password"]),
    );
    return `hysteria2://${encodeURIComponent(password)}@${endpoint}?${params}${fragment}`;
  }

  if (type === "socks5" || type === "socks") {
    return buildAuthenticatedUri("socks5", proxy, endpoint, fragment);
  }

  if (type === "http") {
    return buildAuthenticatedUri(
      bool(proxy.tls) ? "https" : "http",
      proxy,
      endpoint,
      fragment,
    );
  }

  if (type === "tuic") {
    const uuid = text(proxy.uuid) || text(proxy.token);
    const password = text(proxy.password);
    if (!uuid) return null;
    const auth = password
      ? `${encodeURIComponent(uuid)}:${encodeURIComponent(password)}`
      : encodeURIComponent(uuid);
    const params = new URLSearchParams();
    setParam(params, "sni", text(proxy.sni));
    setParam(params, "congestion_control", text(proxy["congestion-controller"]));
    return `tuic://${auth}@${endpoint}?${params}${fragment}`;
  }

  return null;
}

function buildAuthenticatedUri(
  scheme: string,
  proxy: Record<string, unknown>,
  endpoint: string,
  fragment: string,
): string {
  const username = text(proxy.username);
  const password = text(proxy.password);
  const auth = username
    ? `${encodeURIComponent(username)}${password ? `:${encodeURIComponent(password)}` : ""}@`
    : "";
  return `${scheme}://${auth}${endpoint}${fragment}`;
}

function setParam(params: URLSearchParams, key: string, value: string): void {
  if (value) params.set(key, value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positivePort(value: unknown): number | null {
  const parsed = number(value);
  return parsed && parsed > 0 && parsed <= 65_535 ? Math.trunc(parsed) : null;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

function formatHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

async function fetchSubscriptionText(sourceUrl: string): Promise<string> {
  let current = validateSourceUrlSyntax(sourceUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await assertPublicRemote(current);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/plain, text/yaml, application/yaml, */*;q=0.5",
          "User-Agent": "Arkadia-Subscription-Sync/1.0",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new Error("上游重定向次数过多");
        current = validateSourceUrlSyntax(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`上游请求失败(${response.status})`);
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > MAX_RESPONSE_BYTES) {
        throw new Error("上游内容超过 16MB 安全上限");
      }
      return await readLimitedText(response, MAX_RESPONSE_BYTES);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("上游重定向次数过多");
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("上游内容超过 16MB 安全上限");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function validateSourceUrlSyntax(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("订阅地址格式不正确");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("订阅地址仅支持 http/https");
  }
  if (url.username || url.password) throw new Error("订阅地址不能包含 URL 认证信息");
  return url;
}

async function assertPublicRemote(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("订阅地址不能指向内网");
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error("订阅地址不能指向内网");
  }
}

function isPublicIp(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.includes(".") && normalized.startsWith("::ffff:")) {
    return isPublicIp(normalized.slice("::ffff:".length));
  }
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  if (isIP(normalized) === 6) {
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff")
    );
  }
  return false;
}
