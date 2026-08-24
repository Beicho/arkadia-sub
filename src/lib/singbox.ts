/**
 * sing-box 订阅生成(JSON 配置)。
 * 订阅端按 User-Agent 分发:sing-box / SFI / SFA / Hiddify 等客户端。
 * tag 沿用站长配置的原始节点备注。
 */

import { readNodeName, tryDecodeBase64 } from "./nodes";
import type { RoutingMode } from "./rules";
import {
  APPLE_DOMAINS,
  CN_DOMAINS,
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

type Outbound = Record<string, unknown>;

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

function userinfo(url: URL): string {
  return decodeURIComponent(
    url.password ? `${url.username}:${url.password}` : url.username,
  );
}

export function uriToSingboxOutbound(uri: string, tag: string): Outbound | null {
  const lower = uri.toLowerCase();
  if (lower.startsWith("vless://")) return vless(uri, tag);
  if (lower.startsWith("hysteria2://") || lower.startsWith("hy2://"))
    return hysteria2(uri, tag);
  if (lower.startsWith("vmess://")) return vmess(uri, tag);
  if (lower.startsWith("ss://")) return ss(uri, tag);
  if (lower.startsWith("trojan://")) return trojan(uri, tag);
  if (lower.startsWith("socks5://") || lower.startsWith("socks://"))
    return socks5(uri, tag);
  if (lower.startsWith("http://") || lower.startsWith("https://"))
    return httpOut(uri, tag);
  return null;
}

function httpOut(uri: string, tag: string): Outbound | null {
  const url = safeUrl(uri);
  if (!url || !url.hostname) return null;
  const ob: Outbound = {
    type: "http",
    tag,
    server: url.hostname,
    server_port: portOrDefault(url, url.protocol === "https:" ? 443 : 80),
  };
  if (url.username) {
    ob.username = decodeURIComponent(url.username);
    ob.password = decodeURIComponent(url.password ?? "");
  }
  if (url.protocol === "https:" || url.searchParams.get("tls") === "1") {
    ob.tls = { enabled: true };
  }
  return ob;
}

function vless(uri: string, tag: string): Outbound | null {
  const url = safeUrl(uri);
  if (!url) return null;
  const uuid = userinfo(url);
  if (!uuid || !url.hostname) return null;

  const security = (url.searchParams.get("security") ?? "none").toLowerCase();
  const network = (url.searchParams.get("type") ?? "tcp").toLowerCase();
  const flow = url.searchParams.get("flow") ?? "";
  const fp = url.searchParams.get("fp") ?? "";

  const ob: Outbound = {
    type: "vless",
    tag,
    server: url.hostname,
    server_port: portOrDefault(url, 443),
    uuid,
  };
  if (flow) ob.flow = flow;

  if (security === "reality" || security === "tls") {
    const insecure =
      url.searchParams.get("insecure") === "1" ||
      url.searchParams.get("allowInsecure") === "1";
    const tls: Outbound = { enabled: true, insecure };
    const sni = url.searchParams.get("sni") ?? "";
    if (sni) tls.server_name = sni;
    if (fp) tls.utls = { enabled: true, fingerprint: fp };
    if (security === "reality") {
      const reality: Outbound = { enabled: true };
      const pbk = url.searchParams.get("pbk") ?? "";
      const sid = url.searchParams.get("sid") ?? "";
      if (pbk) reality.public_key = pbk;
      if (sid) reality.short_id = sid;
      tls.reality = reality;
    }
    ob.tls = tls;
  }

  if (network === "ws") {
    const ws: Outbound = { type: "ws", path: url.searchParams.get("path") ?? "/" };
    const host = url.searchParams.get("host");
    if (host) ws.headers = { Host: host };
    ob.transport = ws;
  } else if (network === "grpc") {
    const svc = url.searchParams.get("serviceName");
    if (svc) ob.transport = { type: "grpc", service_name: svc };
  }
  return ob;
}

function hysteria2(uri: string, tag: string): Outbound | null {
  const url = safeUrl(uri);
  if (!url) return null;
  const password = userinfo(url);
  if (!password || !url.hostname) return null;
  const ob: Outbound = {
    type: "hysteria2",
    tag,
    server: url.hostname,
    server_port: portOrDefault(url, 443),
    password,
  };
  const sni = url.searchParams.get("sni") ?? url.searchParams.get("peer") ?? "";
  const insecure =
    url.searchParams.get("insecure") === "1" ||
    url.searchParams.get("allowInsecure") === "1";
  const pinnedSha256 =
    url.searchParams.get("pinSHA256") ??
    url.searchParams.get("pinned-sha256") ??
    "";
  ob.tls = {
    enabled: true,
    ...(sni ? { server_name: sni } : {}),
    insecure,
    ...(pinnedSha256
      ? { certificate_public_key_sha256: [pinnedSha256] }
      : {}),
  };
  return ob;
}

function vmess(uri: string, tag: string): Outbound | null {
  const b64 = uri.slice(uri.indexOf("://") + 3);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(tryDecodeBase64(b64) ?? "{}") as Record<string, unknown>;
  } catch {
    return null;
  }
  const server = String(json.add ?? "");
  const uuid = String(json.id ?? "");
  const port = Number(json.port);
  if (!server || !uuid || !Number.isFinite(port) || port <= 0) return null;

  const ob: Outbound = {
    type: "vmess",
    tag,
    server,
    server_port: port,
    uuid,
    security: String(json.scy ?? json.security ?? "auto"),
    alter_id: Number(json.aid ?? 0) || 0,
  };
  if (String(json.tls ?? "") === "tls") {
    const sni = String(json.sni ?? json.host ?? "");
    ob.tls = { enabled: true, ...(sni ? { server_name: sni } : {}) };
  }
  if (String(json.net ?? "tcp") === "ws") {
    ob.transport = {
      type: "ws",
      path: String(json.path ?? "/"),
      ...(json.host ? { headers: { Host: String(json.host) } } : {}),
    };
  }
  return ob;
}

function ss(uri: string, tag: string): Outbound | null {
  const hashIdx = uri.indexOf("#");
  const body = hashIdx >= 0 ? uri.slice(0, hashIdx) : uri;
  const url = safeUrl(body);
  if (url && url.hostname && url.username) {
    const decoded = tryDecodeBase64(decodeURIComponent(url.username));
    if (!decoded || !decoded.includes(":")) return null;
    const idx = decoded.indexOf(":");
    return {
      type: "shadowsocks",
      tag,
      server: url.hostname,
      server_port: portOrDefault(url, 443),
      method: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
    };
  }
  const decoded = tryDecodeBase64(body.slice("ss://".length));
  if (!decoded || !decoded.includes("@")) return null;
  const at = decoded.lastIndexOf("@");
  const [userInfo, hostPort] = [decoded.slice(0, at), decoded.slice(at + 1)];
  const colon = userInfo.indexOf(":");
  const hostColon = hostPort.lastIndexOf(":");
  if (colon <= 0 || hostColon <= 0) return null;
  const port = Number(hostPort.slice(hostColon + 1));
  if (!Number.isFinite(port) || port <= 0) return null;
  return {
    type: "shadowsocks",
    tag,
    server: hostPort.slice(0, hostColon),
    server_port: port,
    method: userInfo.slice(0, colon),
    password: userInfo.slice(colon + 1),
  };
}

function trojan(uri: string, tag: string): Outbound | null {
  const url = safeUrl(uri);
  if (!url) return null;
  const password = userinfo(url);
  if (!password || !url.hostname) return null;
  const sni = url.searchParams.get("sni") ?? url.searchParams.get("peer") ?? "";
  const insecure =
    url.searchParams.get("allowInsecure") === "1" ||
    url.searchParams.get("insecure") === "1";
  return {
    type: "trojan",
    tag,
    server: url.hostname,
    server_port: portOrDefault(url, 443),
    password,
    tls: { enabled: true, ...(sni ? { server_name: sni } : {}), insecure },
  };
}

function socks5(uri: string, tag: string): Outbound | null {
  const url = safeUrl(uri);
  if (!url || !url.hostname) return null;
  const ob: Outbound = {
    type: "socks",
    tag,
    server: url.hostname,
    server_port: portOrDefault(url, 1080),
    version: "5",
  };
  if (url.username) {
    ob.username = decodeURIComponent(url.username);
    ob.password = decodeURIComponent(url.password ?? "");
  }
  return ob;
}

/**
 * 域名列表 → sing-box 匹配字段。
 *
 * sing-box 的 `domain_suffix` 是**纯字符串后缀匹配**,不像 Clash 的
 * DOMAIN-SUFFIX 那样按标签边界切分:直接写 `google.com` 会把
 * `notgoogle.com` 一并匹配进去。所以拆成两组——
 * `domain` 精确匹配裸域,`domain_suffix` 用带前导点的形式匹配子域。
 */
function domainMatch(suffixes: string[]): {
  domain: string[];
  domain_suffix: string[];
} {
  return {
    domain: [...suffixes],
    domain_suffix: suffixes.map((d) => `.${d}`),
  };
}

/** 选择组:成员为节点 + 兜底直连 */
function selector(tag: string, members: string[]): Outbound {
  return { type: "selector", tag, outbounds: members };
}

/**
 * 生成完整 sing-box JSON;无可转换节点返回 null。
 *
 * mode="rules"(默认)输出分流配置;mode="global" 保持旧的全量代理行为。
 *
 * ## 为什么这里没有广告拦截
 *
 * sing-box 的拦截写法在版本间是**断裂**的:`block` 出站在 1.11 弃用、
 * 1.12 移除,取而代之的 `action: "reject"` 又不被 1.10 及更早版本识别。
 * 任何一种写法都会在某个版本段让配置直接加载失败。
 * 而路由用的 `outbound:` 字段全版本稳定,所以这里只做分流,
 * 广告拦截留在 Clash 侧(REJECT 无此问题)。
 */
export function buildSingboxConfig(
  nodes: string[],
  selectorTag = GROUP_MAIN,
  mode: RoutingMode = "rules",
): string | null {
  const outbounds: Outbound[] = [];
  const seenTags = new Set<string>();
  let fallback = 0;
  for (const uri of nodes) {
    let tag = readNodeName(uri);
    if (tag.startsWith("(")) tag = `节点 ${++fallback}`;
    if (seenTags.has(tag)) {
      let n = 2;
      while (seenTags.has(`${tag} ${n}`)) n++;
      tag = `${tag} ${n}`;
    }
    seenTags.add(tag);
    const ob = uriToSingboxOutbound(uri, tag);
    if (ob) outbounds.push(ob);
  }
  if (outbounds.length === 0) return null;

  const tags = outbounds.map((o) => o.tag as string);
  // direct 必须显式定义:sing-box 不存在隐式的 direct 出站,
  // 只在 selector 里引用而不定义会让配置报 outbound not found。
  const direct: Outbound = { type: "direct", tag: "direct" };

  if (mode === "global") {
    return JSON.stringify(
      {
        log: { level: "warn" },
        outbounds: [
          selector(selectorTag, [...tags, "direct"]),
          ...outbounds,
          direct,
        ],
        route: { final: selectorTag },
      },
      null,
      2,
    );
  }

  const auto: Outbound = {
    type: "urltest",
    tag: GROUP_AUTO,
    outbounds: tags,
    url: "http://www.gstatic.com/generate_204",
    interval: "5m",
    tolerance: 50,
  };

  const groups: Outbound[] = [
    // 主组把"自动选择"排在最前:默认落到延迟最低的节点
    selector(selectorTag, [GROUP_AUTO, ...tags, "direct"]),
    auto,
    selector(GROUP_MEDIA, [selectorTag, GROUP_AUTO, ...tags, "direct"]),
    selector(GROUP_TELEGRAM, [selectorTag, GROUP_AUTO, ...tags, "direct"]),
    // 微软/苹果默认直连:国内有 CDN/专线,走代理更慢且易触发风控
    selector(GROUP_MICROSOFT, ["direct", selectorTag, GROUP_AUTO]),
    selector(GROUP_APPLE, ["direct", selectorTag, GROUP_AUTO]),
    selector(GROUP_FINAL, [selectorTag, GROUP_AUTO, "direct"]),
  ];

  // 顺序即优先级。国内域名排在国外之后:两边都命中时以国外规则为准。
  const rules: Outbound[] = [
    { ip_cidr: PRIVATE_CIDRS, outbound: "direct" },
    { ...domainMatch(PRIVATE_DOMAINS), outbound: "direct" },
    { ...domainMatch(TELEGRAM_DOMAINS), outbound: GROUP_TELEGRAM },
    { ip_cidr: TELEGRAM_CIDRS, outbound: GROUP_TELEGRAM },
    { ...domainMatch(MICROSOFT_DOMAINS), outbound: GROUP_MICROSOFT },
    { ...domainMatch(APPLE_DOMAINS), outbound: GROUP_APPLE },
    { ...domainMatch(MEDIA_DOMAINS), outbound: GROUP_MEDIA },
    { ...domainMatch(PROXY_DOMAINS), outbound: selectorTag },
    { ...domainMatch(CN_DOMAINS), outbound: "direct" },
  ];

  return JSON.stringify(
    {
      log: { level: "warn" },
      outbounds: [...groups, ...outbounds, direct],
      route: { rules, final: GROUP_FINAL },
    },
    null,
    2,
  );
}
