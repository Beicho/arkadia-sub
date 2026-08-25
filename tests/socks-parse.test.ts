import { describe, expect, it } from "vitest";
import {
  isEligible,
  parseSocksLine,
  pickBest,
  pickDailySocks,
  proxyIdentity,
  proxyUri,
  redactProxyCredentials,
  socksNodeName,
} from "@/lib/socks-parse";

const NATIVE_US =
  "socks5://38.252.8.57:1080 [原生IP] 美国 [美国 得克萨斯州 休斯敦] 入库:2026-08-18 17:34:30";
const HOME_RU_HIGH =
  "socks5://89.148.196.156:1080 [家宽][高风险84] 俄罗斯 [俄罗斯 彼尔姆边疆区 彼尔姆] 入库:2026-08-18 16:17:09";
const HOME_RU_OK =
  "socks5://212.46.208.183:1080 [家宽][原生IP] 俄罗斯 [俄罗斯 莫斯科 莫斯科] 入库:2026-08-18 15:31:07";
const BROADCAST =
  "socks5://66.163.127.204:10006 [广播IP][高风险95] 荷兰 [荷兰 北荷兰省 阿姆斯特丹] 入库:2026-08-18 16:08:17";
const CF_US =
  "socks5://216.22.13.244:1083 [原生IP] 美国 [美国 弗吉尼亚州 雷斯顿 — Cloudflare CDN 节点] 入库:2026-08-18 15:31:38";
const WITH_AUTH =
  "socks5://user:pass@1.2.3.4:1080 [家宽] 日本 [日本 东京 东京] 入库:2026-08-18 15:00:00";

describe("parseSocksLine", () => {
  it("解析标准行:标签/国家/地区/风险", () => {
    const e = parseSocksLine(HOME_RU_HIGH)!;
    expect(e.host).toBe("89.148.196.156");
    expect(e.port).toBe(1080);
    expect(e.tags).toEqual(["家宽", "高风险84"]);
    expect(e.residential).toBe(true);
    expect(e.nativeIp).toBe(false);
    expect(e.country).toBe("俄罗斯");
    expect(e.riskScore).toBe(84);
  });

  it("识别云服务商", () => {
    expect(parseSocksLine(CF_US)!.provider).toBe("Cloudflare");
  });

  it("带认证信息行可解析", () => {
    const e = parseSocksLine(WITH_AUTH)!;
    expect(e.host).toBe("1.2.3.4");
    expect(e.port).toBe(1080);
    expect(e.username).toBe("user");
    expect(e.password).toBe("pass");
    expect(e.line).not.toContain("user:pass");
    expect(e.residential).toBe(true);
  });

  it("宽松变体:缺前缀/缺入库/裸地址可解析", () => {
    // 缺 socks5:// 前缀
    const noScheme = parseSocksLine(
      "1.2.3.4:1080 [家宽] 日本 [日本 东京 东京] 入库:2026-08-18 15:00:00",
    )!;
    expect(noScheme.host).toBe("1.2.3.4");
    expect(noScheme.residential).toBe(true);
    expect(noScheme.country).toBe("日本");
    // 缺入库尾巴
    const noTime = parseSocksLine(
      "socks5://5.6.7.8:1080 [原生IP] 美国 [美国 洛杉矶]",
    )!;
    expect(noTime.nativeIp).toBe(true);
    expect(noTime.region).toBe("美国 洛杉矶");
    // 裸地址(无任何元数据)也能解析,可参与按速度选优
    const bare = parseSocksLine("socks5://9.9.9.9:1080")!;
    expect(bare.host).toBe("9.9.9.9");
    expect(isEligible(bare)).toBe(true);
    // 全角冒号入库
    const fw = parseSocksLine(
      "socks5://2.2.2.2:1080 [家宽] 韩国 [韩国 首尔] 入库:2026-08-18",
    )!;
    expect(fw.country).toBe("韩国");
  });

  it("元数据支持管道/逗号分隔与含@密码", () => {
    const pipe = parseSocksLine(
      "socks5://1.2.3.4:1080|[家宽]|美国|洛杉矶|入库:2026-08-18",
    )!;
    expect(pipe.host).toBe("1.2.3.4");
    expect(pipe.residential).toBe(true);
    expect(pipe.country).toBe("美国");
    const comma = parseSocksLine("socks5://2.3.4.5:1080,家宽,日本,东京")!;
    expect(comma.host).toBe("2.3.4.5");
    const atPwd = parseSocksLine(
      "socks5://user:pa@ss@3.4.5.6:1080 [家宽] 韩国 [韩国 首尔] 入库:t",
    )!;
    expect(atPwd.host).toBe("3.4.5.6");
    expect(atPwd.username).toBe("user");
    expect(atPwd.password).toBe("pa@ss");
    expect(atPwd.residential).toBe(true);
  });

  it("HTTP 代理:解析 + 命名 + 入池过滤", () => {
    const http = parseSocksLine(
      "http://54.211.9.58:3128 [原生IP] 美国 [美国 弗吉尼亚州 阿什本 — 亚马逊云 Aws] 入库:2026-08-19 06:42:01",
    )!;
    expect(http.host).toBe("54.211.9.58");
    expect(http.protocol).toBe("http");
    expect(http.nativeIp).toBe(true);
    expect(isEligible(http)).toBe(true);
    expect(socksNodeName(http)).toContain("[HTTP·原生]");
    expect(socksNodeName(http)).toContain("美国");
  });

  it("HTTPS 代理保留协议，URI 正确编码认证信息", () => {
    const entry = parseSocksLine(
      "https://user%20name:p%40ss%3Aword@proxy.example.com:8443 [家宽] 日本 [日本 东京]",
    )!;
    expect(entry.protocol).toBe("https");
    expect(entry.username).toBe("user name");
    expect(entry.password).toBe("p@ss:word");
    expect(socksNodeName(entry)).toContain("[HTTPS·家宽]");
    expect(proxyUri(entry, "HTTPS 节点")).toBe(
      "https://user%20name:p%40ss%3Aword@proxy.example.com:8443#HTTPS%20%E8%8A%82%E7%82%B9",
    );
  });

  it("完整代理身份包含协议和认证信息", () => {
    const plain = parseSocksLine("http://1.2.3.4:8080")!;
    const tls = parseSocksLine("https://1.2.3.4:8080")!;
    const authenticated = parseSocksLine("http://user:pass@1.2.3.4:8080")!;
    expect(new Set([plain, tls, authenticated].map(proxyIdentity)).size).toBe(3);
  });

  it("错误样本中的凭据会脱敏", () => {
    expect(redactProxyCredentials("https://user:pa@ss@host:443 bad")).toBe(
      "https://***:***@host:443 bad",
    );
    expect(redactProxyCredentials("user:secret@host:1080 bad")).toBe(
      "***:***@host:1080 bad",
    );
  });

  it("非白名单协议不认", () => {
    expect(parseSocksLine("socks4://1.2.3.4:1080 [家宽] X [X]")).toBeNull();
    expect(parseSocksLine("ftp://example.com:21 path")).toBeNull();
  });

  it("脏行/空行返回 null,不抛错", () => {
    expect(parseSocksLine("hello world")).toBeNull();
    expect(parseSocksLine("socks5://not-a-proxy")).toBeNull();
    expect(parseSocksLine("socks5://1.2.3.4:99999 [家宽] X [X] 入库:t")).toBeNull();
    expect(parseSocksLine("")).toBeNull();
  });
});

describe("isEligible 过滤", () => {
  it("原生/家宽 且无高风险 → 入池", () => {
    expect(isEligible(parseSocksLine(NATIVE_US)!)).toBe(true);
    expect(isEligible(parseSocksLine(HOME_RU_OK)!)).toBe(true);
  });
  it("风险 ≥10 → 排除", () => {
    expect(isEligible(parseSocksLine(HOME_RU_HIGH)!)).toBe(false);
    expect(isEligible(parseSocksLine(BROADCAST)!)).toBe(false);
  });
  it("无原生/家宽标签但低风险 → 入池参与速度选优", () => {
    const e = parseSocksLine(
      "socks5://1.2.3.4:1080 [广播IP] 荷兰 [荷兰 阿姆斯特丹] 入库:t",
    )!;
    expect(isEligible(e)).toBe(true);
  });
});

describe("socksNodeName 命名", () => {
  it("家宽必须标出", () => {
    expect(socksNodeName(parseSocksLine(HOME_RU_OK)!)).toContain("家宽");
    expect(socksNodeName(parseSocksLine(HOME_RU_OK)!)).toContain("[SOCKS5·家宽·原生]");
    expect(socksNodeName(parseSocksLine(HOME_RU_HIGH)!)).toContain("家宽");
  });
  it("原生标出 + 地区 + 服务商", () => {
    const name = socksNodeName(parseSocksLine(CF_US)!);
    expect(name).toContain("[SOCKS5·原生]");
    expect(name).toContain("美国");
    expect(name).toContain("Cloudflare");
    expect(name).not.toContain("家宽");
  });
  it("国家重复 token 去重", () => {
    const name = socksNodeName(parseSocksLine(NATIVE_US)!);
    expect(name).toBe("[SOCKS5·原生] 美国·得克萨斯州·休斯敦");
  });
});

describe("pickBest 选优", () => {
  const mk = (host: string, ms: number, country: string) => ({
    entry: parseSocksLine(
      `socks5://${host}:1080 [原生IP] ${country} [${country} 城] 入库:t`,
    )!,
    latencyMs: ms,
  });

  it("延迟升序取 N", () => {
    const best = pickBest([mk("1.1.1.1", 300, "美"), mk("2.2.2.2", 100, "日")], 1);
    expect(best).toHaveLength(1);
    expect(best[0].entry.host).toBe("2.2.2.2");
  });

  it("同 /24 子网最多 2 条", () => {
    const items = [
      mk("1.1.1.1", 10, "美"),
      mk("1.1.1.2", 20, "美"),
      mk("1.1.1.3", 30, "美"),
      mk("1.1.1.4", 40, "美"),
    ];
    const best = pickBest(items, 4);
    expect(best).toHaveLength(2);
  });

  it("同国家超限时跳过,兜底放宽国家上限但子网不放宽", () => {
    const same = Array.from({ length: 12 }, (_, i) =>
      mk(`9.9.${i}.1`, 100 + i, "美"),
    );
    const best = pickBest(same, 12);
    expect(best).toHaveLength(12); // 全同国家但子网不同 → 兜底补满
    const mixed = pickBest(
      [
        ...Array.from({ length: 10 }, (_, i) => mk(`8.8.${i}.1`, 100 + i, "美")),
        mk("7.7.7.7", 500, "日"),
      ],
      11,
    );
    expect(mixed).toHaveLength(11);
    expect(mixed.some((x) => x.entry.country === "日")).toBe(true);
  });
});

describe("pickDailySocks 每日 60 个", () => {
  const mk = (host: string, ms: number, preferred: boolean) => ({
    entry: parseSocksLine(
      `socks5://${host}:1080 ${preferred ? "[原生IP]" : "[广播IP]"} X [X 城] 入库:t`,
    )!,
    latencyMs: ms,
  });

  it("先保留 30 个原生/家宽,再从全部类型按速度补到 60", () => {
    const preferred = Array.from({ length: 35 }, (_, i) =>
      mk(`10.${Math.floor(i / 250)}.${i % 250}.1`, 1000 + i, true),
    );
    const other = Array.from({ length: 40 }, (_, i) =>
      mk(`20.${Math.floor(i / 250)}.${i % 250}.1`, i + 1, false),
    );
    const selected = pickDailySocks([...other, ...preferred]);

    expect(selected).toHaveLength(60);
    expect(
      selected.slice(0, 30).every(({ entry }) => entry.nativeIp || entry.residential),
    ).toBe(true);
    expect(new Set(selected.map(({ entry }) => `${entry.host}:${entry.port}`)).size).toBe(60);
  });

  it("原生/家宽不足时由其他高速类型回填", () => {
    const preferred = Array.from({ length: 10 }, (_, i) =>
      mk(`30.0.${i}.1`, 100 + i, true),
    );
    const other = Array.from({ length: 55 }, (_, i) =>
      mk(`40.0.${i}.1`, 200 + i, false),
    );
    const selected = pickDailySocks([...preferred, ...other]);

    expect(selected).toHaveLength(60);
    expect(selected.filter(({ entry }) => entry.nativeIp || entry.residential)).toHaveLength(10);
  });

  it("候选集中在少量网段时仍按运营目标补满 30 + 30", () => {
    const preferred = Array.from({ length: 35 }, (_, i) =>
      mk(`50.0.0.${i + 1}`, 100 + i, true),
    );
    const other = Array.from({ length: 35 }, (_, i) =>
      mk(`60.0.0.${i + 1}`, 200 + i, false),
    );
    const selected = pickDailySocks([...preferred, ...other]);

    expect(selected).toHaveLength(60);
    expect(
      selected.slice(0, 30).every(({ entry }) => entry.nativeIp || entry.residential),
    ).toBe(true);
  });

  it("同一槽位种子结果稳定，不同槽位在优质候选窗内轮换", () => {
    const preferred = Array.from({ length: 120 }, (_, i) =>
      mk(`70.${Math.floor(i / 250)}.${i % 250}.1`, 100 + i, true),
    );
    const other = Array.from({ length: 240 }, (_, i) =>
      mk(`80.${Math.floor(i / 250)}.${i % 250}.1`, 300 + i, false),
    );
    const candidates = [...preferred, ...other];

    const first = pickDailySocks(candidates, 60, 30, "2026-08-25:0");
    const repeated = pickDailySocks(candidates, 60, 30, "2026-08-25:0");
    const second = pickDailySocks(candidates, 60, 30, "2026-08-25:1");
    const identities = (items: typeof first) =>
      items.map(({ entry }) => proxyIdentity(entry));

    expect(identities(repeated)).toEqual(identities(first));
    expect(identities(second)).not.toEqual(identities(first));
    expect(first).toHaveLength(60);
    expect(second).toHaveLength(60);
    expect(
      first.slice(0, 30).every(({ entry }) => entry.nativeIp || entry.residential),
    ).toBe(true);
  });
});
