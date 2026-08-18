/**
 * sing-box 订阅生成(JSON 配置)。
 * 订阅端按 User-Agent 分发:sing-box / SFI / SFA / Hiddify 等客户端。
 * tag 沿用站长配置的原始节点备注。
 */

import { readNodeName, tryDecodeBase64 } from "./nodes";

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
    server_port: portOrDefault(url, 8080),
  };
  if (url.username) {
    ob.username = decodeURIComponent(url.username);
    ob.password = decodeURIComponent(url.password ?? "");
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
    const tls: Outbound = { enabled: true };
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
  ob.tls = { enabled: true, ...(sni ? { server_name: sni } : {}), insecure };
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
    security: String(json.security ?? "auto"),
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

/** 生成完整 sing-box JSON;无可转换节点返回 null */
export function buildSingboxConfig(
  nodes: string[],
  selectorTag = "Arkadia",
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

  const config = {
    log: { level: "warn" },
    outbounds: [
      {
        type: "selector",
        tag: selectorTag,
        outbounds: [...outbounds.map((o) => o.tag as string), "direct"],
      },
      ...outbounds,
    ],
    route: { final: selectorTag },
  };
  return JSON.stringify(config, null, 2);
}
