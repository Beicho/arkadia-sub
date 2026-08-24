/**
 * Clash / Mihomo(Clash.Meta) YAML 订阅生成。
 * 订阅端按 User-Agent 分发:Clash 系客户端(FlClash/Clash Verge/Stash 等)
 * 需要完整 YAML 配置,而不是 base64 节点列表。
 *
 * 支持:vless(reality/tls/ws)、hysteria2、vmess、ss、trojan。
 */

import { readNodeName, tryDecodeBase64 } from "./nodes";
import {
  AD_DOMAINS,
  APPLE_DOMAINS,
  CN_DOMAINS,
  GROUP_ADS,
  GROUP_APPLE,
  GROUP_AUTO,
  GROUP_FINAL,
  GROUP_MAIN,
  GROUP_MEDIA,
  GROUP_MICROSOFT,
  GROUP_TELEGRAM,
  MEDIA_DOMAINS,
  MICROSOFT_DOMAINS,
  PRIVATE_CIDRS,
  PRIVATE_DOMAINS,
  PROXY_DOMAINS,
  TELEGRAM_CIDRS,
  TELEGRAM_DOMAINS,
} from "./rules";
import type { RoutingMode } from "./rules";
export type { RoutingMode };

type YamlValue = string | number | boolean | YamlPairs;
type YamlPairs = Array<[string, YamlValue]>;

/** 标量输出:字符串用双引号(JSON 转义,同为合法 YAML 双引号风格) */
function scalar(v: string | number | boolean): string {
  return typeof v === "string" ? JSON.stringify(v) : String(v);
}

function emitPairs(pairs: YamlPairs, indent: number): string[] {
  const sp = " ".repeat(indent);
  const lines: string[] = [];
  for (const [k, v] of pairs) {
    if (Array.isArray(v)) {
      lines.push(`${sp}${k}:`);
      lines.push(...emitPairs(v, indent + 2));
    } else {
      lines.push(`${sp}${k}: ${scalar(v)}`);
    }
  }
  return lines;
}

function emitProxy(pairs: YamlPairs): string {
  const lines: string[] = [];
  pairs.forEach(([k, v], i) => {
    const prefix = i === 0 ? "  - " : "    ";
    if (Array.isArray(v)) {
      lines.push(`${prefix}${k}:`);
      lines.push(...emitPairs(v, 6));
    } else {
      lines.push(`${prefix}${k}: ${scalar(v)}`);
    }
  });
  return lines.join("\n");
}

/** 把单个节点 URI 转成 Clash 代理对象;不认识的格式返回 null */
export function uriToClashProxy(uri: string, name: string): YamlPairs | null {
  const lower = uri.toLowerCase();
  if (lower.startsWith("vless://")) return vlessToClash(uri, name);
  if (lower.startsWith("hysteria2://") || lower.startsWith("hy2://"))
    return hysteria2ToClash(uri, name);
  if (lower.startsWith("vmess://")) return vmessToClash(uri, name);
  if (lower.startsWith("ss://")) return ssToClash(uri, name);
  if (lower.startsWith("trojan://")) return trojanToClash(uri, name);
  if (lower.startsWith("socks5://") || lower.startsWith("socks://"))
    return socks5ToClash(uri, name);
  if (lower.startsWith("http://") || lower.startsWith("https://"))
    return httpToClash(uri, name);
  return null;
}

function httpToClash(uri: string, name: string): YamlPairs | null {
  const url = safeUrl(uri);
  if (!url || !url.hostname) return null;
  const proxy: YamlPairs = [
    ["name", name],
    ["type", "http"],
    ["server", url.hostname],
    ["port", portOrDefault(url, 8080)],
  ];
  if (url.username) {
    proxy.push(["username", decodeURIComponent(url.username)]);
    proxy.push(["password", decodeURIComponent(url.password ?? "")]);
  }
  if (url.protocol === "https:" || truthyParam(url, "tls")) {
    proxy.push(["tls", true]);
  }
  return proxy;
}

function socks5ToClash(uri: string, name: string): YamlPairs | null {
  const url = safeUrl(uri);
  if (!url) return null;
  if (!url.hostname) return null;
  const auth =
    url.username || url.password
      ? {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password ?? ""),
        }
      : null;
  const proxy: YamlPairs = [
    ["name", name],
    ["type", "socks5"],
    ["server", url.hostname],
    ["port", portOrDefault(url, 1080)],
    ["udp", true],
  ];
  if (auth?.username) proxy.push(["username", auth.username]);
  if (auth?.password) proxy.push(["password", auth.password]);
  if (truthyParam(url, "tls")) {
    proxy.push(["tls", true]);
    const sni = url.searchParams.get("sni") ?? "";
    if (sni) proxy.push(["servername", sni]);
  }
  return proxy;
}

function safeUrl(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

function portOrDefault(url: URL, dft: number): number {
  const p = Number(url.port);
  return Number.isFinite(p) && p > 0 ? p : dft;
}

function truthyParam(url: URL, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = url.searchParams.get(k);
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  }
  return false;
}

function vlessToClash(uri: string, name: string): YamlPairs | null {
  const url = safeUrl(uri);
  if (!url) return null;
  // 密码/uuid 含 ':' 时,WHATWG URL 会把它拆进 url.password —— 拼回来
  const uuid = decodeURIComponent(
    url.password ? `${url.username}:${url.password}` : url.username,
  );
  if (!uuid || !url.hostname) return null;

  const security = (url.searchParams.get("security") ?? "none").toLowerCase();
  const network = (url.searchParams.get("type") ?? "tcp").toLowerCase();
  const sni = url.searchParams.get("sni") ?? "";
  const flow = url.searchParams.get("flow") ?? "";
  const fp = url.searchParams.get("fp") ?? "";
  const pbk = url.searchParams.get("pbk") ?? "";
  const sid = url.searchParams.get("sid") ?? "";

  const proxy: YamlPairs = [["name", name], ["type", "vless"], ["server", url.hostname], ["port", portOrDefault(url, 443)], ["uuid", uuid], ["udp", true]];

  if (network === "tcp" || network === "raw") proxy.push(["network", "tcp"]);
  else if (network) proxy.push(["network", network]);

  if (security === "reality" || security === "tls") {
    proxy.push(["tls", true]);
    if (truthyParam(url, "insecure", "allowInsecure", "allow-insecure")) {
      proxy.push(["skip-cert-verify", true]);
    }
    if (sni) proxy.push(["servername", sni]);
    if (fp) proxy.push(["client-fingerprint", fp]);
    if (flow) proxy.push(["flow", flow]);
    if (security === "reality" && pbk) {
      const reality: YamlPairs = [["public-key", pbk]];
      if (sid) reality.push(["short-id", sid]);
      proxy.push(["reality-opts", reality]);
    }
  } else if (flow) {
    proxy.push(["flow", flow]);
  }

  // 传输层
  if (network === "ws") {
    const ws: YamlPairs = [["path", url.searchParams.get("path") ?? "/"]];
    const host = url.searchParams.get("host");
    if (host) ws.push(["headers", [["Host", host]]]);
    proxy.push(["ws-opts", ws]);
  } else if (network === "grpc") {
    const svc = url.searchParams.get("serviceName");
    if (svc) proxy.push(["grpc-opts", [["grpc-service-name", svc]]]);
  }

  return proxy;
}

function hysteria2ToClash(uri: string, name: string): YamlPairs | null {
  const url = safeUrl(uri);
  if (!url) return null;
  const password = decodeURIComponent(
    url.password ? `${url.username}:${url.password}` : url.username,
  );
  if (!password || !url.hostname) return null;
  const sni = url.searchParams.get("sni") ?? url.searchParams.get("peer") ?? "";

  const proxy: YamlPairs = [
    ["name", name],
    ["type", "hysteria2"],
    ["server", url.hostname],
    ["port", portOrDefault(url, 443)],
    ["password", password],
    ["udp", true],
  ];
  if (sni) proxy.push(["sni", sni]);
  if (truthyParam(url, "insecure", "allowInsecure", "allow-insecure")) {
    proxy.push(["skip-cert-verify", true]);
  }
  const pinnedSha256 =
    url.searchParams.get("pinSHA256") ??
    url.searchParams.get("pinned-sha256") ??
    "";
  if (pinnedSha256) proxy.push(["pinned-sha256", pinnedSha256]);
  const obfs = url.searchParams.get("obfs");
  if (obfs) {
    const obfsPwd = url.searchParams.get("obfs-password") ?? "";
    const obfsOpts: YamlPairs = [["type", obfs]];
    if (obfsPwd) obfsOpts.push(["password", obfsPwd]);
    proxy.push(["obfs", obfsOpts]); // hysteria2 的 obfs 字段是对象(mihomo 语法)
  }
  return proxy;
}

function vmessToClash(uri: string, name: string): YamlPairs | null {
  const b64 = uri.slice(uri.indexOf("://") + 3);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(tryDecodeBase64(b64) ?? "{}") as Record<string, unknown>;
  } catch {
    return null;
  }
  const server = String(json.add ?? "");
  const uuid = String(json.id ?? "");
  if (!server || !uuid) return null;
  const port = Number(json.port);
  if (!Number.isFinite(port) || port <= 0) return null;

  const network = String(json.net ?? "tcp").toLowerCase();
  const tls = String(json.tls ?? "").toLowerCase() === "tls";

  const proxy: YamlPairs = [
    ["name", name],
    ["type", "vmess"],
    ["server", server],
    ["port", port],
    ["uuid", uuid],
    ["alterId", Number(json.aid ?? 0) || 0],
    ["cipher", String(json.scy ?? json.security ?? "auto") || "auto"],
    ["udp", true],
  ];
  if (network !== "tcp") proxy.push(["network", network]);
  if (tls) {
    proxy.push(["tls", true]);
    const sni = String(json.sni ?? json.host ?? "");
    if (sni) proxy.push(["servername", sni]);
  }
  if (network === "ws") {
    const ws: YamlPairs = [["path", String(json.path ?? "/")]];
    if (json.host) ws.push(["headers", [["Host", String(json.host)]]]);
    proxy.push(["ws-opts", ws]);
  } else if (network === "grpc") {
    if (json.path) proxy.push(["grpc-opts", [["grpc-service-name", String(json.path)]]]);
  }
  return proxy;
}

function ssToClash(uri: string, name: string): YamlPairs | null {
  const hashIdx = uri.indexOf("#");
  const body = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;

  // SIP002:ss://base64(method:password)@host:port
  const url = safeUrl(body);
  if (url && url.hostname && url.username) {
    const decoded = tryDecodeBase64(decodeURIComponent(url.username));
    if (!decoded || !decoded.includes(":")) return null;
    const idx = decoded.indexOf(":");
    const method = decoded.slice(0, idx);
    const password = decoded.slice(idx + 1);
    if (!method) return null;
    return [
      ["name", name],
      ["type", "ss"],
      ["server", url.hostname],
      ["port", portOrDefault(url, 443)],
      ["cipher", method],
      ["password", password],
      ["udp", true],
    ];
  }

  // 旧式:ss://base64(method:password@host:port)
  const decoded = tryDecodeBase64(body.slice("ss://".length));
  if (!decoded || !decoded.includes("@")) return null;
  const at = decoded.lastIndexOf("@");
  const userInfo = decoded.slice(0, at);
  const hostPort = decoded.slice(at + 1);
  const colon = userInfo.indexOf(":");
  if (colon <= 0) return null;
  const hostColon = hostPort.lastIndexOf(":");
  if (hostColon <= 0) return null;
  const server = hostPort.slice(0, hostColon);
  const port = Number(hostPort.slice(hostColon + 1));
  if (!server || !Number.isFinite(port) || port <= 0) return null;
  return [
    ["name", name],
    ["type", "ss"],
    ["server", server],
    ["port", port],
    ["cipher", userInfo.slice(0, colon)],
    ["password", userInfo.slice(colon + 1)],
    ["udp", true],
  ];
}

function trojanToClash(uri: string, name: string): YamlPairs | null {
  const url = safeUrl(uri);
  if (!url) return null;
  const password = decodeURIComponent(
    url.password ? `${url.username}:${url.password}` : url.username,
  );
  if (!password || !url.hostname) return null;
  const proxy: YamlPairs = [
    ["name", name],
    ["type", "trojan"],
    ["server", url.hostname],
    ["port", portOrDefault(url, 443)],
    ["password", password],
    ["udp", true],
  ];
  const sni = url.searchParams.get("sni") ?? url.searchParams.get("peer") ?? "";
  if (sni) proxy.push(["sni", sni]);
  if (truthyParam(url, "allowInsecure", "insecure")) {
    proxy.push(["skip-cert-verify", true]);
  }
  return proxy;
}

/** 一条 Clash 规则行 */
function rule(...parts: string[]): string {
  return `  - ${parts.join(",")}`;
}

/**
 * 分流规则段。顺序即优先级,自上而下第一条命中即生效:
 *   局域网 → 广告 → 电报 → 微软/苹果 → 流媒体 → 国外站点 → 国内域名 → 国内 IP → 兜底
 *
 * 国内 IP 用 `GEOIP,CN`:Clash 内核自带 mmdb,不需要额外下载,
 * 这是内联方案里唯一"免费"拿到的 IP 级判断,能兜住没进域名表的长尾。
 * `no-resolve` 只加在 IP 规则上,避免为了判断而强制 DNS 解析(fake-ip 下会误判)。
 */
function buildRules(): string[] {
  const lines: string[] = [];

  // 局域网/本机:最优先,否则内网服务会被卷进代理
  for (const d of PRIVATE_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, "DIRECT"));
  for (const c of PRIVATE_CIDRS) lines.push(rule("IP-CIDR", c, "DIRECT", "no-resolve"));

  for (const d of AD_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, GROUP_ADS));

  for (const d of TELEGRAM_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, GROUP_TELEGRAM));
  for (const c of TELEGRAM_CIDRS) lines.push(rule("IP-CIDR", c, GROUP_TELEGRAM, "no-resolve"));

  for (const d of MICROSOFT_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, GROUP_MICROSOFT));
  for (const d of APPLE_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, GROUP_APPLE));
  for (const d of MEDIA_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, GROUP_MEDIA));
  for (const d of PROXY_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, GROUP_MAIN));

  // 国内域名要排在国外之后:两边都命中时(如 .cn 下的外企站点)以国外规则为准
  for (const d of CN_DOMAINS) lines.push(rule("DOMAIN-SUFFIX", d, "DIRECT"));

  lines.push(rule("GEOIP", "CN", "DIRECT", "no-resolve"));
  lines.push(rule("MATCH", GROUP_FINAL));
  return lines;
}

/** 一个 proxy-group 的 YAML 片段 */
function emitGroup(
  name: string,
  type: string,
  members: string[],
  extra: string[] = [],
): string[] {
  const lines = [`  - name: ${JSON.stringify(name)}`, `    type: ${type}`];
  lines.push(...extra.map((e) => `    ${e}`));
  lines.push("    proxies:");
  for (const m of members) lines.push(`      - ${JSON.stringify(m)}`);
  return lines;
}

/**
 * 生成完整 Clash YAML 配置;节点名保留站长配置的原始备注;无可转换节点时返回 null。
 *
 * mode="rules"(默认)输出分流配置;mode="global" 保持旧的全量代理行为,
 * 供站长在分流出问题时一键回退。
 */
export function buildClashYaml(
  nodes: string[],
  groupName = GROUP_MAIN,
  mode: RoutingMode = "rules",
): string | null {
  const proxies: YamlPairs[] = [];
  const usedNames = new Set<string>();
  let fallback = 0;
  for (const uri of nodes) {
    // Clash 要求代理名唯一:重名自动加序号
    let name = readNodeName(uri);
    if (name.startsWith("(")) name = `节点 ${++fallback}`;
    if (usedNames.has(name)) {
      let n = 2;
      while (usedNames.has(`${name} ${n}`)) n++;
      name = `${name} ${n}`;
    }
    usedNames.add(name);
    const p = uriToClashProxy(uri, name);
    if (p) proxies.push(p);
  }
  if (proxies.length === 0) return null;

  const names = proxies.map((p) => String(p[0]?.[1]));
  const lines: string[] = [
    // 基础配置 + DNS:部分客户端(FlClash 关闭"覆写 DNS"时)要求
    // 配置自带完整 dns 段,否则报 default nameserver 为空
    "mixed-port: 7890",
    "allow-lan: false",
    "mode: rule",
    "log-level: info",
    "unified-delay: true",
    "tcp-concurrent: true",
    "dns:",
    "  enable: true",
    "  listen: 0.0.0.0:1053",
    "  ipv6: false",
    "  enhanced-mode: fake-ip",
    "  fake-ip-range: 198.18.0.1/16",
    "  fake-ip-filter:",
    '    - "*.lan"',
    '    - "*.local"',
    '    - "+.msftconnecttest.com"',
    '    - "+.msftncsi.com"',
    "  default-nameserver:",
    "    - 223.5.5.5",
    "    - 8.8.8.8",
    "  nameserver:",
    "    - https://223.5.5.5/dns-query",
    "    - https://1.1.1.1/dns-query",
    "proxies:",
  ];
  for (const p of proxies) lines.push(emitProxy(p));

  lines.push("proxy-groups:");

  if (mode === "global") {
    lines.push(...emitGroup(groupName, "select", [...names, "DIRECT"]));
    lines.push("rules:");
    // Clash 规则语法:MATCH,<组名>,组名不加引号
    lines.push(`  - MATCH,${groupName}`);
    return lines.join("\n") + "\n";
  }

  // 主组把"自动选择"排在最前:新用户默认落到延迟最低的节点,而不是列表第一个
  lines.push(...emitGroup(groupName, "select", [GROUP_AUTO, ...names, "DIRECT"]));
  lines.push(
    ...emitGroup(GROUP_AUTO, "url-test", names, [
      "url: http://www.gstatic.com/generate_204",
      "interval: 300",
      "tolerance: 50",
    ]),
  );
  // 媒体/电报单独成组:这两类最常需要单独指定落地
  lines.push(...emitGroup(GROUP_MEDIA, "select", [groupName, GROUP_AUTO, ...names, "DIRECT"]));
  lines.push(...emitGroup(GROUP_TELEGRAM, "select", [groupName, GROUP_AUTO, ...names, "DIRECT"]));
  // 微软/苹果默认直连:国内有 CDN/专线,走代理更慢且容易触发风控
  lines.push(...emitGroup(GROUP_MICROSOFT, "select", ["DIRECT", groupName, GROUP_AUTO]));
  lines.push(...emitGroup(GROUP_APPLE, "select", ["DIRECT", groupName, GROUP_AUTO]));
  lines.push(...emitGroup(GROUP_ADS, "select", ["REJECT", "DIRECT"]));
  lines.push(...emitGroup(GROUP_FINAL, "select", [groupName, GROUP_AUTO, "DIRECT"]));

  lines.push("rules:");
  lines.push(...buildRules());

  return lines.join("\n") + "\n";
}
