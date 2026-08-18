/**
 * SOCKS5 福利池文本解析。
 * 输入格式(每行一条,来源第三方代理池):
 *   socks5://host:port [原生IP][高风险84] 美国 [美国 得克萨斯州 休斯敦] 入库:2026-08-18 17:34:30
 *   socks5://user:pass@host:port [家宽][原生IP] 俄罗斯 [俄罗斯 莫斯科 莫斯科] 入库:…
 */

export type SocksEntry = {
  host: string;
  port: number;
  line: string;
  tags: string[];
  nativeIp: boolean;
  residential: boolean;
  country: string | null;
  region: string | null;
  provider: string | null;
  riskScore: number | null;
};

/**
 * 宽松行匹配:可缺 socks5:// 前缀、可缺尾部元数据;
 * authority = [user:pass@]host:port,后跟可选元数据。
 * http:// / https:// / socks4:// 等其他 scheme 明确不认。
 */
// host:port + 可选元数据(空白/|/,分隔);userinfo 单独用 rfind('@') 剥离(密码可含 @)
const AUTH_RE =
  /^([a-zA-Z0-9.\-]+):(\d{1,5})(?:[\s|,]+(.*))?$/;
const SCHEME_RE = /^socks5h?:\/\//i;
const OTHER_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/** 已知云服务商关键词(从地区串里识别,命中则进节点名) */
const PROVIDER_KEYWORDS = [
  "Cloudflare",
  "Oracle",
  "甲骨文",
  "搬瓦工",
  "BandwagonHost",
  "RackNerd",
  "DMIT",
  "阿里云",
  "AWS",
  "Amazon",
  "Google",
  "Hetzner",
  "Vultr",
  "DigitalOcean",
  "Linode",
  "OVH",
  "Akamai",
  "Azure",
  "腾讯云",
];

/** 解析单行;格式不符返回 null(容错:跳过脏行,不抛错) */
export function parseSocksLine(raw: string): SocksEntry | null {
  let line = raw.trim();
  if (!line) return null;
  // 其他协议(http/socks4 等)明确不认,避免误测
  if (OTHER_SCHEME_RE.test(line) && !SCHEME_RE.test(line)) return null;
  if (SCHEME_RE.test(line)) line = line.replace(SCHEME_RE, "");

  // userinfo:从右找最后一个 @ 剥离(密码可含 @);裸用户名(无冒号)不认识
  let body = line;
  const at = body.lastIndexOf("@");
  if (at >= 0) {
    const userinfo = body.slice(0, at);
    if (!userinfo.includes(":")) return null;
    body = body.slice(at + 1);
  }

  const m = AUTH_RE.exec(body);
  if (!m) return null;
  const [, host, portStr, rest] = m;
  const port = Number(portStr);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const meta = rest ?? "";

  // 括号组分类:含空格 → 地区(取最后一个);无空格 → 标签
  const tags: string[] = [];
  let region: string | null = null;
  for (const bm of meta.matchAll(/\[([^\[\]]+)\]/g)) {
    const val = bm[1].trim();
    if (!val) continue;
    if (/\s/.test(val)) {
      region = val; // 地区组(如 [美国 得克萨斯州 休斯敦])
    } else {
      tags.push(val); // 标签组(如 [家宽][高风险84])
    }
  }

  // 国家 = 括号外第一个非「入库」开头的词(空白/|/, 均为分隔符)
  let country: string | null = null;
  const noBrackets = meta.replace(/\[[^\[\]]*\]/g, " ");
  for (const tok of noBrackets.split(/[\s|,]+/).filter(Boolean)) {
    if (tok.startsWith("入库")) continue;
    country = tok;
    break;
  }

  // 风险分
  let riskScore: number | null = null;
  for (const tag of tags) {
    const r = /^高风险(\d{1,3})$/.exec(tag);
    if (r) {
      riskScore = Number(r[1]);
      break;
    }
  }

  const nativeIp = tags.includes("原生IP");
  const residential = tags.includes("家宽");
  const provider = findProvider(region ?? "");

  return {
    host,
    port,
    line,
    tags,
    nativeIp,
    residential,
    country,
    region,
    provider,
    riskScore,
  };
}

function findProvider(region: string): string | null {
  for (const kw of PROVIDER_KEYWORDS) {
    if (region.includes(kw)) return kw;
  }
  return null;
}

/**
 * 入池过滤:仅保留 原生IP 或 家宽,且风险分 < 10(无风险标签视为 0)。
 * 广播IP 无原生/家宽标的不入池。
 */
export function isEligible(e: SocksEntry): boolean {
  if (!e.nativeIp && !e.residential) return false;
  if ((e.riskScore ?? 0) >= 10) return false;
  return true;
}

/** 节点展示名:家宽必须标出 */
export function socksNodeName(e: SocksEntry): string {
  const typeTag = e.residential
    ? e.nativeIp
      ? "家宽·原生"
      : "家宽"
    : "原生";
  const place = buildPlace(e);
  const provider = e.provider ? `·${e.provider}` : "";
  return `[SOCKS5·${typeTag}] ${place}${provider}`;
}

function buildPlace(e: SocksEntry): string {
  if (!e.region) return e.country ?? e.host;
  let tokens = e.region.split(/\s+/).filter(Boolean);

  // 在「—」分隔符或云商关键词处截断(云商信息由 provider 单独后缀,避免重复)
  const cut = tokens.findIndex(
    (t) => t === "—" || t === "-" || findProvider(t) !== null,
  );
  if (cut > 0) tokens = tokens.slice(0, cut);

  // 连续重复 token 去重(如 "俄罗斯 莫斯科 莫斯科")
  tokens = tokens.filter((t, i) => i === 0 || t !== tokens[i - 1]);

  const place = tokens.slice(0, 3).join("·");
  return place || (e.country ?? e.host);
}

/**
 * 从可用代理里挑质量最高的 N 个:
 * 1. 延迟升序
 * 2. 同一 /24 子网最多 2 条(避免同段扎堆)
 * 3. 同一国家最多 8 条(保证地区多样性)
 */
export function pickBest(
  ok: { entry: SocksEntry; latencyMs: number }[],
  n: number,
): { entry: SocksEntry; latencyMs: number }[] {
  const sorted = [...ok].sort((a, b) => a.latencyMs - b.latencyMs);
  const subnetCount = new Map<string, number>();
  const countryCount = new Map<string, number>();
  const out: { entry: SocksEntry; latencyMs: number }[] = [];
  for (const item of sorted) {
    if (out.length >= n) break;
    const subnet = item.entry.host.split(".").slice(0, 3).join(".");
    const cKey = item.entry.country ?? "?";
    if ((subnetCount.get(subnet) ?? 0) >= 2) continue;
    if ((countryCount.get(cKey) ?? 0) >= 8) continue;
    subnetCount.set(subnet, (subnetCount.get(subnet) ?? 0) + 1);
    countryCount.set(cKey, (countryCount.get(cKey) ?? 0) + 1);
    out.push(item);
  }
  // 不满额时兜底补齐:放宽国家上限,但子网上限永不放宽(同段扎堆是质量红线)
  if (out.length < n) {
    const chosen = new Set(out.map((x) => `${x.entry.host}:${x.entry.port}`));
    for (const item of sorted) {
      if (out.length >= n) break;
      const key = `${item.entry.host}:${item.entry.port}`;
      if (chosen.has(key)) continue;
      const subnet = item.entry.host.split(".").slice(0, 3).join(".");
      if ((subnetCount.get(subnet) ?? 0) >= 2) continue;
      chosen.add(key);
      subnetCount.set(subnet, (subnetCount.get(subnet) ?? 0) + 1);
      out.push(item);
    }
  }
  return out;
}
