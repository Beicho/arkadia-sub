import { describe, expect, it } from "vitest";
import { buildClashYaml, uriToClashProxy } from "@/lib/clash";

/** 合成节点(结构与真实批次一致,凭证为假值) */
const VLESS_REALITY =
  "vless://11111111-2222-3333-4444-555555555555@1.2.3.4:50159?encryption=none&flow=xtls-rprx-vision&security=reality&sni=example.com&fp=chrome&pbk=FakePublicKey123&sid=abcd1234&type=tcp&headerType=none#%E6%B5%8B%E8%AF%95";
const VLESS_WS =
  "vless://11111111-2222-3333-4444-555555555555@5.6.7.8:443?encryption=none&security=tls&sni=ws.example.com&type=ws&host=ws.example.com&path=%2Fpath#ws";
const HY2 =
  "hysteria2://fakepassword@9.9.9.9:50160?sni=hy.example.com&insecure=0&allowInsecure=0#HY2";
const TROJAN = "trojan://fakepass@2.3.4.5:443?sni=t.example.com#tj";

function makeVmess(): string {
  const json = JSON.stringify({
    v: "2",
    ps: "旧名",
    add: "3.4.5.6",
    port: "8443",
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    aid: "0",
    net: "ws",
    path: "/ws",
    host: "vm.example.com",
    tls: "tls",
  });
  return `vmess://${Buffer.from(json).toString("base64")}`;
}

describe("uriToClashProxy", () => {
  it("vless reality → reality-opts/public-key/flow", () => {
    const p = uriToClashProxy(VLESS_REALITY, "N1")!;
    const keys = p.map(([k]) => k);
    expect(keys).toContain("reality-opts");
    expect(p.find(([k]) => k === "flow")?.[1]).toBe("xtls-rprx-vision");
    const reality = p.find(([k]) => k === "reality-opts")![1] as [string, unknown][];
    expect(reality.find(([k]) => k === "public-key")![1]).toBe("FakePublicKey123");
    expect(reality.find(([k]) => k === "short-id")![1]).toBe("abcd1234");
  });

  it("vless ws → ws-opts 带 path/host", () => {
    const p = uriToClashProxy(VLESS_WS, "N2")!;
    const ws = p.find(([k]) => k === "ws-opts")![1] as [string, unknown][];
    expect(ws.find(([k]) => k === "path")![1]).toBe("/path");
    expect(p.find(([k]) => k === "servername")![1]).toBe("ws.example.com");
  });

  it("hysteria2 → password/sni,insecure=0 不开 skip-cert-verify", () => {
    const p = uriToClashProxy(HY2, "N3")!;
    expect(p.find(([k]) => k === "type")![1]).toBe("hysteria2");
    expect(p.find(([k]) => k === "password")![1]).toBe("fakepassword");
    expect(p.find(([k]) => k === "sni")![1]).toBe("hy.example.com");
    expect(p.find(([k]) => k === "skip-cert-verify")).toBeUndefined();
  });

  it("vmess ws+tls → 网络与 tls 字段", () => {
    const p = uriToClashProxy(makeVmess(), "N4")!;
    expect(p.find(([k]) => k === "server")![1]).toBe("3.4.5.6");
    expect(p.find(([k]) => k === "port")![1]).toBe(8443);
    expect(p.find(([k]) => k === "network")![1]).toBe("ws");
    expect(p.find(([k]) => k === "tls")![1]).toBe(true);
  });

  it("trojan → password/sni", () => {
    const p = uriToClashProxy(TROJAN, "N5")!;
    expect(p.find(([k]) => k === "type")![1]).toBe("trojan");
    expect(p.find(([k]) => k === "password")![1]).toBe("fakepass");
  });

  it("不认识的协议返回 null", () => {
    expect(uriToClashProxy("tuic://x@y:1", "N")).toBeNull();
  });
});

describe("buildClashYaml", () => {
  it("生成完整配置:节点命名 Arkadia-日期-序号 + 选择组 + MATCH 规则", () => {
    const yaml = buildClashYaml(
      [VLESS_REALITY, HY2, TROJAN],
      "2026-08-18",
    )!;
    expect(yaml).toContain("proxies:");
    expect(yaml).toContain('"Arkadia-20260818-01"');
    expect(yaml).toContain('"Arkadia-20260818-02"');
    expect(yaml).toContain('"Arkadia-20260818-03"');
    expect(yaml).toContain("proxy-groups:");
    expect(yaml).toContain("type: select");
    expect(yaml).toContain("- \"DIRECT\"");
    expect(yaml).toContain("rules:");
    expect(yaml).toContain('MATCH,"Arkadia"');
  });

  it("首个节点字段使用列表缩进(- name:)", () => {
    const yaml = buildClashYaml([VLESS_REALITY], "2026-08-18")!;
    expect(yaml).toMatch(/  - name: "Arkadia-20260818-01"\n    type: vless/);
  });

  it("空列表返回 null", () => {
    expect(buildClashYaml([], "2026-08-18")).toBeNull();
    expect(buildClashYaml(["tuic://x@y:1"], "2026-08-18")).toBeNull();
  });

  it("字符串值含特殊字符时安全转义", () => {
    const evil =
      "hysteria2://pass:word@9.9.9.9:443?sni=a#x";
    const yaml = buildClashYaml([evil], "2026-08-18");
    expect(yaml).toContain('"pass:word"');
  });
});
