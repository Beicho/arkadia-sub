/**
 * 节点解析。
 * 节点备注(名称)由站长在后台配置,下发时原样保留,不做任何改写;
 * 批次日期信息放在订阅标题(profile-title 头)与下载文件名上。
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
  "socks5",
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

/** 生成下发内容:原始节点原样拼接后 base64(v2rayN 订阅格式) */
export function buildSubscriptionPayload(nodes: string[]): string {
  return Buffer.from(nodes.join("\n"), "utf8").toString("base64");
}

/** 原始明文内容(?raw=1 下载用) */
export function buildRawContent(nodes: string[]): string {
  return nodes.join("\n");
}

/** 按 | 分隔的普通关键词筛选节点，避免把用户输入解释为正则表达式。 */
export function filterNodesByKeywords(
  nodes: string[],
  query: string | null,
  exclude = false,
): string[] {
  const keywords = (query ?? "")
    .split("|")
    .map((keyword) => keyword.trim().toLowerCase().slice(0, 64))
    .filter(Boolean)
    .slice(0, 20);
  if (keywords.length === 0) return nodes;

  return nodes.filter((node) => {
    const matches = keywords.some((keyword) => node.toLowerCase().includes(keyword));
    return exclude ? !matches : matches;
  });
}

/** 解析节点备注(下发/转换时保留的节点名) */
export function readNodeName(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.startsWith("vmess://")) {
    try {
      const json = JSON.parse(
        tryDecodeBase64(uri.slice("vmess://".length)) ?? "{}",
      ) as { ps?: string };
      return json.ps?.trim() || "(vmess 无备注)";
    } catch {
      return "(vmess 解析失败)";
    }
  }
  const hashIdx = uri.indexOf("#");
  if (hashIdx >= 0 && hashIdx < uri.length - 1) {
    try {
      const name = decodeURIComponent(uri.slice(hashIdx + 1)).trim();
      if (name) return name;
    } catch {
      const name = uri.slice(hashIdx + 1).trim();
      if (name) return name;
    }
  }
  return "(无备注)";
}
