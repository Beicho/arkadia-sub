import { describe, expect, it } from "vitest";
import {
  isEligible,
  parseSocksLine,
  pickBest,
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
    expect(e.residential).toBe(true);
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
  it("无原生/家宽标签 → 排除", () => {
    const e = parseSocksLine(
      "socks5://1.2.3.4:1080 [广播IP] 荷兰 [荷兰 阿姆斯特丹] 入库:t",
    )!;
    expect(isEligible(e)).toBe(false);
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
