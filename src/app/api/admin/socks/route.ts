import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches, socksPool } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { activateBatch } from "@/lib/batches";
import {
  isEligible,
  parseSocksLine,
  pickDailySocks,
  proxyIdentity,
  proxyUri,
  redactProxyCredentials,
  socksNodeName,
  type SocksEntry,
} from "@/lib/socks-parse";
import {
  getSocksRunState,
  startSocksRun,
  type SocksTestScope,
} from "@/lib/socks-runner";
import { shanghaiToday } from "@/lib/time";

function isPoolProxyUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (
      parsed.protocol !== "socks5:" &&
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:"
    ) return false;
    const label = decodeURIComponent(parsed.hash.slice(1));
    return /^\[(?:SOCKS5|HTTPS?)·(?:家宽(?:·原生)?|原生|测速优选)\]/.test(label);
  } catch {
    return false;
  }
}

function poolUriIdentity(uri: string): string {
  const parsed = new URL(uri);
  const protocol = parsed.protocol.slice(0, -1);
  const normalizedProtocol =
    protocol === "http" || protocol === "https" ? protocol : "socks5";
  const defaultPort =
    normalizedProtocol === "https"
      ? 443
      : normalizedProtocol === "http"
        ? 80
        : 1080;
  return proxyIdentity({
    protocol: normalizedProtocol,
    host: parsed.hostname,
    port: Number(parsed.port || defaultPort),
    username: decodeURIComponent(parsed.username) || null,
    password: decodeURIComponent(parsed.password) || null,
  });
}

export const dynamic = "force-dynamic";

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // 5MB 上限,约 6 万行

/** 状态:运行进度 + 池概况 + 可用榜 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  const okRows = await db
    .select()
    .from(socksPool)
    .where(eq(socksPool.status, "ok"))
    .orderBy(asc(socksPool.latencyMs))
    .limit(100);

  const [activeBatch] = await db
    .select({ nodes: nodeBatches.nodes })
    .from(nodeBatches)
    .where(eq(nodeBatches.isActive, true))
    .limit(1);
  const mergedToday = ((activeBatch?.nodes as string[]) ?? []).filter((n) =>
    isPoolProxyUri(n),
  ).length;

  const allRows = await db
    .select({ status: socksPool.status, tags: socksPool.tags })
    .from(socksPool);
  const preferred = allRows.filter(
    (r) => (r.tags ?? []).includes("原生IP") || (r.tags ?? []).includes("家宽"),
  ).length;
  const summary = {
    total: allRows.length,
    ok: allRows.filter((r) => r.status === "ok").length,
    fail: allRows.filter((r) => r.status === "fail").length,
    untested: allRows.filter((r) => r.status === "untested").length,
    preferred,
    other: allRows.length - preferred,
  };

  return Response.json({
    run: getSocksRunState(),
    mergedToday,
    summary,
    top: okRows.map((r) => ({
      host: r.host,
      port: r.port,
      protocol: r.protocol,
      authenticated: Boolean(r.username),
      tags: r.tags,
      country: r.country,
      provider: r.provider,
      riskScore: r.riskScore,
      latencyMs: r.latencyMs,
      name: socksNodeName(rowToEntry(r)),
    })),
  });
}

type SocksRow = typeof socksPool.$inferSelect;
function rowToEntry(r: SocksRow): SocksEntry {
  const protocol =
    r.protocol === "https"
      ? "https"
      : r.protocol === "http"
        ? "http"
        : "socks5";
  return {
    host: r.host,
    port: r.port,
    protocol,
    username: r.username || null,
    password: r.password || null,
    line: r.line,
    tags: r.tags ?? [],
    nativeIp: (r.tags ?? []).includes("原生IP"),
    residential: (r.tags ?? []).includes("家宽"),
    country: r.country,
    region: r.region,
    provider: r.provider,
    riskScore: r.riskScore,
  };
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: {
    action?: string;
    text?: string;
    count?: number;
    force?: boolean;
    scope?: SocksTestScope;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }

  const action = body.action ?? "";

  // ===== 导入解析 =====
  if (action === "import") {
    const text = body.text ?? "";
    if (!text.trim()) return Response.json({ error: "内容为空" }, { status: 400 });
    if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
      return Response.json(
        { error: "内容超过 5MB 上限,请分批导入" },
        { status: 413 },
      );
    }

    const parsed: ReturnType<typeof parseSocksLine>[] = [];
    let malformed = 0;
    let filteredOut = 0;
    let inPoolSkipped = 0;
    const seen = new Set<string>();
    const badSamples: string[] = [];
    const entries: NonNullable<ReturnType<typeof parseSocksLine>>[] = [];

    for (const line of text.split("\n")) {
      const e = parseSocksLine(line);
      if (!e) {
        if (line.trim()) {
          malformed++;
          if (badSamples.length < 5) {
            badSamples.push(redactProxyCredentials(line.trim()).slice(0, 80));
          }
        }
        continue;
      }
      parsed.push(e);
      if (!isEligible(e)) {
        filteredOut++;
        continue;
      }
      const key = proxyIdentity(e);
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(e);
      void inPoolSkipped;
    }

    // 分批插入(500/批),冲突跳过
    let inserted = 0;
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      const res = await db
        .insert(socksPool)
        .values(
          chunk.map((e) => ({
            host: e.host,
            port: e.port,
            protocol: e.protocol,
            username: e.username ?? "",
            password: e.password ?? "",
            line: e.line,
            tags: e.tags,
            country: e.country,
            region: e.region,
            provider: e.provider,
            riskScore: e.riskScore,
            status: "untested" as const,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: socksPool.id });
      inserted += res.length;
    }

    inPoolSkipped = Math.max(0, entries.length - inserted);
    await audit(admin.id, "socks_import", `inserted=${inserted}`, {
      totalLines: parsed.length + malformed,
      parsed: parsed.length,
      malformed,
      filteredOut,
      inserted,
      inPoolSkipped,
    });

    return Response.json({
      ok: true,
      parsed: parsed.length,
      malformed,
      filteredOut,
      inserted,
      inPoolSkipped,
      badSamples,
      message:
        `共 ${parsed.length + malformed} 行 → 识别 ${parsed.length} |` +
        ` 过滤 ${filteredOut}(风险≥10)|` +
        ` 文件内重复 ${parsed.length - filteredOut - entries.length} |` +
        ` 池内已存在 ${inPoolSkipped} | 新入库 ${inserted} |` +
        ` 未识别 ${malformed}`,
    });
  }

  // ===== 开始测活 =====
  if (action === "test") {
    const scope = body.scope ?? "untested";
    if (!(["untested", "failed", "all"] as const).includes(scope)) {
      return Response.json({ error: "无效的测速范围" }, { status: 400 });
    }
    const result = await startSocksRun(scope);
    if (!result.started) {
      return Response.json(
        {
          error:
            result.reason === "running"
              ? "已有测活在运行中"
              : scope === "untested"
                ? "没有未测代理"
                : scope === "failed"
                  ? "没有失败代理可重测"
                  : "代理池为空",
        },
        { status: result.reason === "running" ? 409 : 422 },
      );
    }
    await audit(admin.id, "socks_test_start", scope, { total: result.total });
    const scopeLabel =
      scope === "untested"
        ? "未测代理"
        : scope === "failed"
          ? "失败代理"
          : "全部代理";
    return Response.json({
      ok: true,
      message: `${scopeLabel}测速已启动(${result.total} 个,100 并发)`,
    });
  }

  // ===== 创建纯福利代理批次(不依赖已有节点批次,可独立当主代理) =====
  if (action === "create_batch") {
    const count = Math.min(Math.max(body.count ?? 60, 1), 60);
    const force = body.force === true;
    const okRows = await db
      .select()
      .from(socksPool)
      .where(eq(socksPool.status, "ok"))
      .orderBy(asc(socksPool.latencyMs))
      .limit(2000);
    if (okRows.length === 0) {
      return Response.json({ error: "没有可用代理,先执行测活" }, { status: 422 });
    }

    // 防手滑:当前批次含常规订阅节点时,确认后才允许用纯福利代理替换。
    if (!force) {
      const [activeBatch] = await db
        .select()
        .from(nodeBatches)
        .where(eq(nodeBatches.isActive, true))
        .orderBy(desc(nodeBatches.createdAt))
        .limit(1);
      const hasNonPoolProxy =
        activeBatch &&
        ((activeBatch.nodes as string[]) ?? []).some(
          (n) => !isPoolProxyUri(n),
        );
      if (hasNonPoolProxy) {
        return Response.json(
          {
            error:
              "当前激活批次包含非福利代理节点,创建纯代理批次将替换整个下发批次(原节点不再下发,批次日期为今天)。确认继续?",
            needForce: true,
          },
          { status: 422 },
        );
      }
    }

    const best = pickDailySocks(
      okRows.map((r) => ({ entry: rowToEntry(r), latencyMs: r.latencyMs ?? 9999 })),
      count,
    );
    if (best.length === 0) {
      return Response.json({ error: "选取失败" }, { status: 422 });
    }

    const socksUris = best.map(
      (b) => proxyUri(b.entry),
    );
    const batchDate = shanghaiToday();
    const [created] = await db
      .insert(nodeBatches)
      .values({
        title: `福利代理批次 ${batchDate} ×${best.length}`,
        nodes: socksUris,
        batchDate,
        nodeCount: socksUris.length,
        isActive: false,
        createdBy: admin.id,
      })
      .returning({ id: nodeBatches.id });
    await db.transaction(async (tx) => {
      await activateBatch(tx, created.id);
    });
    await audit(admin.id, "socks_create_batch", `batch:${created.id}`, {
      count: best.length,
      batchDate,
    });
    return Response.json({
      ok: true,
      message: `已创建纯代理批次(${best.length} 个,日期 ${batchDate})并激活`,
      added: best.map((b) => socksNodeName(b.entry)),
    });
  }

  // ===== 清空代理池 =====
  if (action === "clear_pool") {
    await db.delete(socksPool);
    await audit(admin.id, "socks_clear_pool");
    return Response.json({ ok: true, message: "代理池已清空(不影响已并入批次的节点)" });
  }

  // ===== 从今日批次移除全部 SOCKS5/HTTP 福利代理 =====
  if (action === "remove_socks") {
    const [current] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .orderBy(desc(nodeBatches.createdAt))
      .limit(1);
    if (!current) {
      return Response.json({ error: "没有激活批次" }, { status: 422 });
    }
    const nodes = (current.nodes as string[]) ?? [];
    const kept = nodes.filter((n) => !isPoolProxyUri(n));
    const removed = nodes.length - kept.length;
    if (removed === 0) {
      return Response.json({ error: "今日批次没有福利代理" }, { status: 422 });
    }
    const [created] = await db
      .insert(nodeBatches)
      .values({
        title: `${current.title}(移除福利代理 ×${removed})`,
        nodes: kept,
        batchDate: current.batchDate,
        nodeCount: kept.length,
        isActive: false,
        createdBy: admin.id,
      })
      .returning({ id: nodeBatches.id });
    await db.transaction(async (tx) => {
      await activateBatch(tx, created.id);
    });
    await audit(admin.id, "socks_remove_from_batch", `batch:${created.id}`, { removed });
    return Response.json({
      ok: true,
      message: `已移除 ${removed} 个福利代理,批次剩余 ${kept.length} 节点(同日期,用户刷新不扣额度)`,
    });
  }

  // ===== 替换今日福利代理:移除旧的,重新挑 60 个 =====
  if (action === "replace_merge") {
    const count = Math.min(Math.max(body.count ?? 60, 1), 60);
    const okRows = await db
      .select()
      .from(socksPool)
      .where(eq(socksPool.status, "ok"))
      .orderBy(asc(socksPool.latencyMs))
      .limit(2000);
    if (okRows.length === 0) {
      return Response.json({ error: "没有可用代理,先执行测活" }, { status: 422 });
    }
    const best = pickDailySocks(
      okRows.map((r) => ({ entry: rowToEntry(r), latencyMs: r.latencyMs ?? 9999 })),
      count,
    );
    if (best.length === 0) {
      return Response.json({ error: "选取失败" }, { status: 422 });
    }

    const [current] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .orderBy(desc(nodeBatches.createdAt))
      .limit(1);
    const baseNodes = ((current?.nodes as string[]) ?? []).filter(
      (n) => !isPoolProxyUri(n),
    );
    const socksUris = best.map(
      (b) => proxyUri(b.entry),
    );
    const mergedNodes = [...baseNodes, ...socksUris];
    const batchDate = current?.batchDate ?? shanghaiToday();

    const [created] = await db
      .insert(nodeBatches)
      .values({
        title: `批次 ${batchDate}(含福利代理 ×${best.length})`,
        nodes: mergedNodes,
        batchDate,
        nodeCount: mergedNodes.length,
        isActive: false,
        createdBy: admin.id,
      })
      .returning({ id: nodeBatches.id });
    await db.transaction(async (tx) => {
      await activateBatch(tx, created.id);
    });
    await audit(admin.id, "socks_replace_batch", `batch:${created.id}`, {
      added: best.length,
      base: baseNodes.length,
      batchDate,
    });
    return Response.json({
      ok: true,
      message: `已替换:原节点 ${baseNodes.length} + 新福利代理 ${best.length} = ${mergedNodes.length}(同日期不扣额度)`,
      added: best.map((b) => socksNodeName(b.entry)),
    });
  }

  // ===== 挑选最优并入今日批次 =====
  if (action === "merge") {
    const count = Math.min(Math.max(body.count ?? 60, 1), 60);
    const force = body.force === true;

    const okRows = await db
      .select()
      .from(socksPool)
      .where(and(eq(socksPool.status, "ok")))
      .orderBy(asc(socksPool.latencyMs))
      .limit(2000);

    if (okRows.length === 0) {
      return Response.json(
        { error: "没有可用代理,先执行测活" },
        { status: 422 },
      );
    }

    // 当前激活批次中已有的完整代理身份(协议、地址和认证均参与去重)
    const [activeBatch] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .orderBy(desc(nodeBatches.createdAt))
      .limit(1);
    const existingSet = new Set<string>(
      ((activeBatch?.nodes as string[]) ?? [])
        .filter((n) => isPoolProxyUri(n))
        .map((n) => {
          try {
            return poolUriIdentity(n);
          } catch {
            return n;
          }
        }),
    );
    if (existingSet.size > 0 && !force) {
      return Response.json(
        {
          error: `今日批次已包含 ${existingSet.size} 个福利代理。确认要再追加吗?(重复的会自动跳过)`,
          needForce: true,
        },
        { status: 422 },
      );
    }

    const candidates = okRows
      .map((r) => ({ entry: rowToEntry(r), latencyMs: r.latencyMs ?? 9999 }))
      .filter((b) => !existingSet.has(proxyIdentity(b.entry)));
    const best = pickDailySocks(candidates, count);
    if (best.length === 0) {
      return Response.json(
        { error: "候选已全部在今日批次中,无需重复并入" },
        { status: 422 },
      );
    }

    // 当前激活批次(没有则从空开始)
    const [current] = await db
      .select()
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .orderBy(desc(nodeBatches.createdAt))
      .limit(1);

    const socksUris = best.map(
      (b) => proxyUri(b.entry),
    );
    const mergedNodes = [
      ...((current?.nodes as string[]) ?? []),
      ...socksUris,
    ];

    const batchDate = current?.batchDate ?? shanghaiToday();
    const title = current
      ? `${current.title} + 福利代理 ×${best.length}`
      : `福利代理批次 ${batchDate}`;

    const [created] = await db
      .insert(nodeBatches)
      .values({
        title,
        nodes: mergedNodes,
        batchDate,
        nodeCount: mergedNodes.length,
        isActive: false,
        createdBy: admin.id,
      })
      .returning({ id: nodeBatches.id });

    // 事务切换激活;同 batchDate 保证用户同日刷新不重复扣额度
    await db.transaction(async (tx) => {
      await activateBatch(tx, created.id);
    });

    await audit(admin.id, "socks_merge_batch", `batch:${created.id}`, {
      added: best.length,
      totalNodes: mergedNodes.length,
      batchDate,
    });

    return Response.json({
      ok: true,
      batchId: created.id,
      batchDate,
      totalNodes: mergedNodes.length,
      added: best.map((b) => socksNodeName(b.entry)),
      message: `已并入 ${best.length} 个福利代理(批次共 ${mergedNodes.length} 节点,日期 ${batchDate};同日已拉过的用户刷新不扣额度)`,
    });
  }

  return Response.json({ error: "未知 action" }, { status: 400 });
}
