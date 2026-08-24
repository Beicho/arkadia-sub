/**
 * SOCKS5 / HTTP 福利代理池文本解析。
 * 输入格式(每行一条,来源第三方代理池):
 *   socks5://host:port [原生IP][高风险84] 美国 [美国 得克萨斯州 休斯敦] 入库:2026-08-18 17:34:30
 *   socks5://user:pass@host:port [家宽][原生IP] 俄罗斯 [俄罗斯 莫斯科 莫斯科] 入库:…
 */

export type SocksEntry = {
  host: string;
  port: number;
  protocol: "socks5" | "http";
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
 * 宽松行匹配:可缺协议前缀、可缺尾部元数据;
 * authority = [user:pass@]host:port,后跟可选元数据。
 * 支持 SOCKS5 与 HTTP(S) 代理;其他 scheme 明确不认。
 */
// host:port + 可选元数据(空白/|/,分隔);userinfo 单独用 rfind('@') 剥离(密码可含 @)
const HOST_RE = /^[a-zA-Z0-9.-]+$/;
const PORT_RE = /^\d{1,5}$/;
// 接受的协议前缀:socks5(含 socks5h)/ http / https —— 池里 HTTP 代理占大头
const SCHEME_RE = /^(socks5h?|https?):\/\//i;
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
  let protocol: "socks5" | "http" = "socks5";
  const sm = SCHEME_RE.exec(line);
  if (sm) {
    protocol = /^h/i.test(sm[1]) ? "http" : "socks5";
    line = line.slice(sm[0].length);
  } else if (OTHER_SCHEME_RE.test(line)) {
    return null; // socks4:// 等不认识的 scheme
  }

  // userinfo:从右找最后一个 @ 剥离(密码可含 @);裸用户名(无冒号)不认识
  let body = line;
  const at = body.lastIndexOf("@");
  if (at >= 0) {
    const userinfo = body.slice(0, at);
    if (!userinfo.includes(":")) return null;
    body = body.slice(at + 1);
  }

  let metaStart = -1;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (/\s/.test(char) || char === "|" || char === ",") {
      metaStart = i;
      break;
    }
  }
  const authority = metaStart >= 0 ? body.slice(0, metaStart) : body;
  while (
    metaStart >= 0 &&
    metaStart < body.length &&
    (/\s/.test(body[metaStart]) || body[metaStart] === "|" || body[metaStart] === ",")
  ) {
    metaStart++;
  }
  const meta = metaStart >= 0 ? body.slice(metaStart) : "";
  const colon = authority.lastIndexOf(":");
  if (colon <= 0) return null;
  const host = authority.slice(0, colon);
  const portStr = authority.slice(colon + 1);
  if (!HOST_RE.test(host) || !PORT_RE.test(portStr)) return null;
  const port = Number(portStr);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;

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
    protocol,
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
 * 入池过滤:风险分 < 10(无风险标签视为 0)。
 * 原生/家宽作为每日优选维度,不再挡住实测速率更好的其他类型。
 */
export function isEligible(e: SocksEntry): boolean {
  if ((e.riskScore ?? 0) >= 10) return false;
  return true;
}

/** 节点展示名:家宽/原生明确标出,其他类型标为测速优选 */
export function socksNodeName(e: SocksEntry): string {
  const typeTag = e.residential
    ? e.nativeIp
      ? "家宽·原生"
      : "家宽"
    : e.nativeIp
      ? "原生"
      : "测速优选";
  const place = buildPlace(e);
  const provider = e.provider ? `·${e.provider}` : "";
  const proto = e.protocol === "http" ? "HTTP" : "SOCKS5";
  return `[${proto}·${typeTag}] ${place}${provider}`;
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
  const sorted = dedupeByAddress(ok);
  const state = createPickState();
  const out: CheckedSocks[] = [];
  fillWithDiversity(out, sorted, Math.max(0, n), state);
  return out;
}

export type CheckedSocks = { entry: SocksEntry; latencyMs: number };

/**
 * 每日福利代理选择器:
 * 1. 最多 30 个原生/家宽,按实测延迟优先;
 * 2. 再从所有剩余类型按实测延迟补到 60 个;
 * 3. 原生/家宽不足时由其他高速节点回填,全程按 host:port 去重。
 *
 * total/preferredCount 保留参数是为了让后台手动操作和定时订阅同步共用。
 */
export function pickDailySocks(
  ok: CheckedSocks[],
  total = 60,
  preferredCount = 30,
): CheckedSocks[] {
  const limit = Math.min(Math.max(0, total), 60);
  if (limit === 0) return [];

  const candidates = dedupeByAddress(ok);
  const state = createPickState();
  const out: CheckedSocks[] = [];
  const preferredLimit = Math.min(Math.max(0, preferredCount), 30, limit);
  const preferred = candidates.filter(
    ({ entry }) => entry.nativeIp || entry.residential,
  );

  fillWithDiversity(out, preferred, preferredLimit, state);
  // 运营目标优先：有足够原生/家宽时保证前半组凑到 30，最后才放宽网段。
  fillWithoutDiversity(out, preferred, preferredLimit, state);
  fillWithDiversity(out, candidates, limit, state);
  // 全池有足够可用项时应稳定给出 60 个；多样性不足只作为降级而非硬性减量。
  fillWithoutDiversity(out, candidates, limit, state);
  return out;
}

type PickState = {
  chosen: Set<string>;
  subnetCount: Map<string, number>;
  countryCount: Map<string, number>;
};

function createPickState(): PickState {
  return {
    chosen: new Set<string>(),
    subnetCount: new Map<string, number>(),
    countryCount: new Map<string, number>(),
  };
}

function dedupeByAddress(ok: CheckedSocks[]): CheckedSocks[] {
  const fastest = new Map<string, CheckedSocks>();
  for (const item of ok) {
    const key = proxyKey(item);
    const previous = fastest.get(key);
    if (!previous || item.latencyMs < previous.latencyMs) fastest.set(key, item);
  }
  return [...fastest.values()].sort((a, b) => a.latencyMs - b.latencyMs);
}

function fillWithDiversity(
  out: CheckedSocks[],
  candidates: CheckedSocks[],
  target: number,
  state: PickState,
): void {
  addCandidates(out, candidates, target, state, true);
  // 数量不足时只放宽国家上限;同一 /24 最多 2 条仍是质量红线。
  if (out.length < target) addCandidates(out, candidates, target, state, false);
}

function addCandidates(
  out: CheckedSocks[],
  candidates: CheckedSocks[],
  target: number,
  state: PickState,
  enforceCountryLimit: boolean,
): void {
  for (const item of candidates) {
    if (out.length >= target) return;
    const key = proxyKey(item);
    if (state.chosen.has(key)) continue;

    const subnet = item.entry.host.split(".").slice(0, 3).join(".");
    const country = item.entry.country ?? "?";
    if ((state.subnetCount.get(subnet) ?? 0) >= 2) continue;
    if (enforceCountryLimit && (state.countryCount.get(country) ?? 0) >= 8) continue;

    state.chosen.add(key);
    state.subnetCount.set(subnet, (state.subnetCount.get(subnet) ?? 0) + 1);
    state.countryCount.set(country, (state.countryCount.get(country) ?? 0) + 1);
    out.push(item);
  }
}

function fillWithoutDiversity(
  out: CheckedSocks[],
  candidates: CheckedSocks[],
  target: number,
  state: PickState,
): void {
  for (const item of candidates) {
    if (out.length >= target) return;
    const key = proxyKey(item);
    if (state.chosen.has(key)) continue;
    state.chosen.add(key);
    const subnet = item.entry.host.split(".").slice(0, 3).join(".");
    const country = item.entry.country ?? "?";
    state.subnetCount.set(subnet, (state.subnetCount.get(subnet) ?? 0) + 1);
    state.countryCount.set(country, (state.countryCount.get(country) ?? 0) + 1);
    out.push(item);
  }
}

function proxyKey(item: CheckedSocks): string {
  return `${item.entry.host}:${item.entry.port}`;
}
