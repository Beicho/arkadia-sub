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
  it("selector + outbounds + route.final,tag 用原始备注", () => {
    const json = buildSingboxConfig([VLESS_REALITY, HY2, SOCKS])!;
    const cfg = JSON.parse(json);
    expect(cfg.outbounds[0].type).toBe("selector");
    expect(cfg.outbounds[0].tag).toBe("Arkadia");
    expect(cfg.outbounds[0].outbounds).toContain("测试");
    expect(cfg.outbounds[0].outbounds).toContain("direct");
    expect(cfg.outbounds).toHaveLength(4); // selector + 3 节点
    expect(cfg.route.final).toBe("Arkadia");
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
