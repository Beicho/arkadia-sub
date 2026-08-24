import { describe, expect, it } from "vitest";
import { buildSingboxConfig, uriToSingboxOutbound } from "@/lib/singbox";

const VLESS_REALITY =
  "vless://11111111-2222-3333-4444-555555555555@1.2.3.4:50159?encryption=none&flow=xtls-rprx-vision&security=reality&sni=example.com&fp=chrome&pbk=FakePublicKey123&sid=abcd1234&type=tcp#%E6%B5%8B%E8%AF%95";
const HY2 =
  "hysteria2://fakepassword@9.9.9.9:50160?sni=hy.example.com&insecure=0#HY2";
const SOCKS = "socks5://u:p@5.6.7.8:1080#s5";

describe("uriToSingboxOutbound", () => {
  it("vless reality → tls.reality/utls/flow", () => {
    const ob = uriToSingboxOutbound(VLESS_REALITY, "N1")! as Record<string, never>;
    expect(ob.type).toBe("vless");
    expect(ob.flow).toBe("xtls-rprx-vision");
    const tls = ob.tls as Record<string, Record<string, unknown>>;
    expect(tls.enabled).toBe(true);
    expect(tls.server_name).toBe("example.com");
    expect((tls.utls as Record<string, unknown>).fingerprint).toBe("chrome");
    expect((tls.reality as Record<string, unknown>).public_key).toBe("FakePublicKey123");
  });

  it("hysteria2 → password + tls", () => {
    const ob = uriToSingboxOutbound(HY2, "N2")! as Record<string, never>;
    expect(ob.type).toBe("hysteria2");
    expect(ob.password).toBe("fakepassword");
    const tls = ob.tls as Record<string, unknown>;
    expect(tls.server_name).toBe("hy.example.com");
    expect(tls.insecure).not.toBe(true); // insecure=0
  });

  it("socks5 → version5 + 认证", () => {
    const ob = uriToSingboxOutbound(SOCKS, "N3")! as Record<string, never>;
    expect(ob.type).toBe("socks");
    expect(ob.version).toBe("5");
    expect(ob.username).toBe("u");
    expect(ob.password).toBe("p");
  });

  it("不认识协议返回 null", () => {
    expect(uriToSingboxOutbound("tuic://x@y:1", "N")).toBeNull();
  });
});

describe("buildSingboxConfig", () => {
  it("selector + outbounds,tag 用原始备注", () => {
    const json = buildSingboxConfig([VLESS_REALITY, HY2, SOCKS])!;
    const cfg = JSON.parse(json);
    expect(cfg.outbounds[0].type).toBe("selector");
    expect(cfg.outbounds[0].tag).toBe("Arkadia");
    expect(cfg.outbounds[0].outbounds).toContain("测试");
    expect(cfg.outbounds[0].outbounds).toContain("direct");
    // 分流模式:7 个分组 + 3 节点 + direct
    expect(cfg.outbounds).toHaveLength(11);
    expect(cfg.route.final).toBe("漏网之鱼");
  });

  it("重名 tag 自动加序号", () => {
    const a = "trojan://p@2.3.4.5:443#dup";
    const b = "trojan://p@3.3.3.3:443#dup";
    const cfg = JSON.parse(buildSingboxConfig([a, b])!);
    const tags = cfg.outbounds.slice(1).map((o: { tag: string }) => o.tag);
    expect(tags).toContain("dup");
    expect(tags).toContain("dup 2");
  });

  it("空列表返回 null", () => {
    expect(buildSingboxConfig([])).toBeNull();
  });
});

describe("buildSingboxConfig 分流规则", () => {
  const cfg = () => JSON.parse(buildSingboxConfig([VLESS_REALITY, HY2, SOCKS])!);
  type Ob = { type: string; tag: string; outbounds?: string[] };

  it("direct 出站必须显式存在(sing-box 没有隐式 direct)", () => {
    const c = cfg();
    const direct = (c.outbounds as Ob[]).find((o) => o.tag === "direct");
    expect(direct).toBeDefined();
    expect(direct!.type).toBe("direct");
    // 所有被引用的 tag 都必须能在 outbounds 里找到,否则 sing-box 起不来
    const defined = new Set((c.outbounds as Ob[]).map((o) => o.tag));
    for (const o of c.outbounds as Ob[]) {
      for (const ref of o.outbounds ?? []) expect(defined.has(ref)).toBe(true);
    }
    for (const r of c.route.rules as { outbound: string }[]) {
      expect(defined.has(r.outbound)).toBe(true);
    }
    expect(defined.has(c.route.final)).toBe(true);
  });

  it("生成 urltest 自动选择组", () => {
    const auto = (cfg().outbounds as Ob[]).find((o) => o.tag === "自动选择");
    expect(auto?.type).toBe("urltest");
    expect(auto?.outbounds).toEqual(["测试", "HY2", "s5"]);
  });

  it("domain_suffix 带前导点,避免 notgoogle.com 被误匹配", () => {
    const rules = cfg().route.rules as {
      domain?: string[];
      domain_suffix?: string[];
      outbound: string;
    }[];
    const proxyRule = rules.find((r) =>
      r.domain?.some((domain) => domain === "github.com"),
    )!;
    expect(proxyRule.domain).toContain("github.com");
    expect(proxyRule.domain_suffix).toContain(".github.com");
    expect(proxyRule.domain_suffix).not.toContain("github.com");
    expect(proxyRule.outbound).toBe("Arkadia");
  });

  it("规则顺序:私有网段最先,国内域名排在国外之后", () => {
    const rules = cfg().route.rules as Record<string, unknown>[];
    const idx = (pred: (r: Record<string, unknown>) => boolean) =>
      rules.findIndex(pred);
    const priv = idx((r) => Array.isArray(r.ip_cidr) && (r.ip_cidr as string[]).includes("10.0.0.0/8"));
    const foreign = idx(
      (r) =>
        Array.isArray(r.domain) &&
        (r.domain as string[]).some((domain) => domain === "github.com"),
    );
    const cn = idx((r) => Array.isArray(r.domain) && (r.domain as string[]).includes("cn"));
    expect(priv).toBe(0);
    expect(foreign).toBeGreaterThan(-1);
    expect(foreign).toBeLessThan(cn);
  });

  it("不包含 block 出站或 action:reject(版本间不兼容,故不做广告拦截)", () => {
    const json = buildSingboxConfig([VLESS_REALITY])!;
    expect(json).not.toContain('"block"');
    expect(json).not.toContain('"action"');
  });

  it("global 模式保持旧行为:单 selector + route.final", () => {
    const c = JSON.parse(buildSingboxConfig([VLESS_REALITY, HY2], "Arkadia", "global")!);
    expect(c.route.final).toBe("Arkadia");
    expect(c.route.rules).toBeUndefined();
    expect((c.outbounds as Ob[]).map((o) => o.tag)).toEqual([
      "Arkadia",
      "测试",
      "HY2",
      "direct",
    ]);
  });
});
