/**
 * Clash / Mihomo(Clash.Meta) YAML 订阅生成。
 * 订阅端按 User-Agent 分发:Clash 系客户端(FlClash/Clash Verge/Stash 等)
 * 需要完整 YAML 配置,而不是 base64 节点列表。
 *
 * 支持:vless(reality/tls/ws)、hysteria2、vmess、ss、trojan。
 */

import { nodeDisplayName, tryDecodeBase64 } from "./nodes";

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
  return null;
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
    ["cipher", String(json.security ?? "auto") || "auto"],
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

/** 生成完整 Clash YAML 配置;无可转换节点时返回 null */
export function buildClashYaml(
  nodes: string[],
  batchDate: string,
  groupName = "Arkadia",
): string | null {
  const proxies: YamlPairs[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const p = uriToClashProxy(nodes[i], nodeDisplayName(batchDate, i));
    if (p) proxies.push(p);
  }
  if (proxies.length === 0) return null;

  const names = proxies.map((p) => String(p[0]?.[1]));
  const lines: string[] = ["proxies:"];
  for (const p of proxies) lines.push(emitProxy(p));

  lines.push("proxy-groups:");
  lines.push(`  - name: ${JSON.stringify(groupName)}`);
  lines.push("    type: select");
  lines.push("    proxies:");
  for (const n of names) lines.push(`      - ${JSON.stringify(n)}`);
  lines.push(`      - "DIRECT"`);

  lines.push("rules:");
  lines.push(`  - MATCH,${JSON.stringify(groupName)}`);

  return lines.join("\n") + "\n";
}
