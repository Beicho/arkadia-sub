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

const LINE_RE =
  /^socks5:\/\/(?:([^@\s]+):([^@\s]+)@)?([a-zA-Z0-9.\-]+):(\d{1,5})\s+(.+)$/;

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
  const line = raw.trim();
  if (!line) return null;
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const [, , , host, portStr, rest] = m;
  const port = Number(portStr);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;

  // 标签 [xxx]
  const tags: string[] = [];
  let restNoTags = rest;
  restNoTags = restNoTags.replace(/\[([^\[\]]+)\]/g, (_, tag: string) => {
    tags.push(tag);
    return " ";
  });

  // 国家 + 地区 [...](去掉标签后第一个 [..] 组)
  let country: string | null = null;
  let region: string | null = null;
  const rm = /^\s*([^\[\]\s]+)\s+\[([^\[\]]+)\]/.exec(restNoTags);
  if (rm) {
    country = rm[1];
    region = rm[2].trim() || null;
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
  // 地区串首 token 通常是国家重复(如 "美国 得克萨斯州 休斯敦"),去重
  const parts = e.region.split(/\s+/).filter(Boolean);
  const uniq = parts.filter((p, i) => p !== e.country || i !== 0);
  const tail = uniq.slice(-3).join("·");
  return tail || (e.country ?? e.host);
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
