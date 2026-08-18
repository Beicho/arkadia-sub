/**
 * 节点解析与展示名重写。
 * 下发时把每个节点的备注统一改写为 `Arkadia-{YYYYMMDD}-{序号}`,
 * 由 batch_date + 序号确定性生成,同批次对所有人、多次拉取保持稳定。
 */

/** 常见代理协议白名单;https:// 等普通网址不算节点 */
const NODE_PROTOCOLS = new Set([
  "vless",
  "vmess",
  "ss",
  "ssr",
  "trojan",
  "hysteria",
  "hysteria2",
  "hy2",
  "tuic",
  "socks",
  "snell",
  "juicity",
  "wireguard",
  "ssh",
]);

/** 识别节点行(白名单协议 + :// 开头) */
export function isNodeLine(line: string): boolean {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//.exec(line);
  if (!m) return false;
  return NODE_PROTOCOLS.has(m[1].toLowerCase());
}

/** 清理粘贴的原始文本:一行一个节点;支持整段 base64 自动解码;去空行与重复 */
export function normalizeNodeInput(raw: string): string[] {
  let text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  // 整段 base64(无 ://)时先解码
  if (!text.includes("://")) {
    const decoded = tryDecodeBase64(text.replace(/\s+/g, ""));
    if (decoded && decoded.includes("://")) {
      text = decoded;
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const line0 of text.split("\n")) {
    const line = line0.trim();
    if (!line || !isNodeLine(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

export function tryDecodeBase64(s: string): string | null {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(s)) return null;
  try {
    const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

/** 批次展示名:Arkadia-20260818-01 */
export function nodeDisplayName(batchDate: string, index: number): string {
  return `Arkadia-${batchDate.replace(/-/g, "")}-${String(index + 1).padStart(2, "0")}`;
}

/** 把单个节点的备注重写为 name;不认识的格式尽量按 fragment 处理 */
export function rewriteNodeName(uri: string, name: string): string {
  const lower = uri.toLowerCase();
  if (lower.startsWith("vmess://")) {
    return rewriteVmess(uri, name);
  }
  const hashIdx = uri.indexOf("#");
  if (hashIdx >= 0) {
    return `${uri.slice(0, hashIdx)}#${encodeURIComponent(name)}`;
  }
  // 没有备注就补一个
  return `${uri}#${encodeURIComponent(name)}`;
}

function rewriteVmess(uri: string, name: string): string {
  const b64 = uri.slice("vmess://".length);
  try {
    const json = JSON.parse(tryDecodeBase64(b64) ?? "{}") as Record<
      string,
      unknown
    >;
    json.ps = name;
    return `vmess://${Buffer.from(JSON.stringify(json), "utf8").toString("base64")}`;
  } catch {
    // 解析失败:原样返回,后续管理端能看到原始内容
    return uri;
  }
}

/** 生成下发内容(base64,换行拼接) */
export function buildSubscriptionPayload(
  nodes: string[],
  batchDate: string,
): string {
  const content = nodes
    .map((n, i) => rewriteNodeName(n, nodeDisplayName(batchDate, i)))
    .join("\n");
  return Buffer.from(content, "utf8").toString("base64");
}

/** 原始明文内容(?raw=1 下载用) */
export function buildRawContent(
  nodes: string[],
  batchDate: string,
): string {
  return nodes
    .map((n, i) => rewriteNodeName(n, nodeDisplayName(batchDate, i)))
    .join("\n");
}

/** 解析节点备注(管理端展示用) */
export function readNodeName(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.startsWith("vmess://")) {
    try {
      const json = JSON.parse(
        tryDecodeBase64(uri.slice("vmess://".length)) ?? "{}",
      ) as { ps?: string };
      return json.ps ?? "(vmess 无备注)";
    } catch {
      return "(vmess 解析失败)";
    }
  }
  const hashIdx = uri.indexOf("#");
  if (hashIdx >= 0 && hashIdx < uri.length - 1) {
    try {
      return decodeURIComponent(uri.slice(hashIdx + 1));
    } catch {
      return uri.slice(hashIdx + 1);
    }
  }
  return "(无备注)";
}
