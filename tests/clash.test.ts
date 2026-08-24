import { describe, expect, it } from "vitest";
import { buildClashYaml, uriToClashProxy } from "@/lib/clash";

/** 合成节点(结构与真实批次一致,凭证为假值) */
const VLESS_REALITY =
  "vless://11111111-2222-3333-4444-555555555555@1.2.3.4:50159?encryption=none&flow=xtls-rprx-vision&security=reality&sni=example.com&fp=chrome&pbk=FakePublicKey123&sid=abcd1234&type=tcp&headerType=none#%E6%B5%8B%E8%AF%95";
const VLESS_WS =
  "vless://11111111-2222-3333-4444-555555555555@5.6.7.8:443?encryption=none&security=tls&sni=ws.example.com&type=ws&host=ws.example.com&path=%2Fpath#ws";
const HY2 =
  "hysteria2://fakepassword@9.9.9.9:50160?sni=hy.example.com&insecure=0&allowInsecure=0#HY2-%E6%96%B0%E5%8A%A0%E5%9D%A1";
const TROJAN = "trojan://fakepass@2.3.4.5:443?sni=t.example.com#trojan-node";

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

  it("socks5 → type/server/port,无认证不输出 username", () => {
    const p = uriToClashProxy("socks5://1.2.3.4:1080#s5", "N6")!;
    expect(p.find(([k]) => k === "type")![1]).toBe("socks5");
    expect(p.find(([k]) => k === "server")![1]).toBe("1.2.3.4");
    expect(p.find(([k]) => k === "port")![1]).toBe(1080);
    expect(p.find(([k]) => k === "udp")![1]).toBe(true);
    expect(p.find(([k]) => k === "username")).toBeUndefined();
  });

  it("socks5 带认证 → username/password", () => {
    const p = uriToClashProxy("socks5://u:p%40ss@5.6.7.8:1080#s5", "N7")!;
    expect(p.find(([k]) => k === "username")![1]).toBe("u");
    expect(p.find(([k]) => k === "password")![1]).toBe("p@ss");
  });

  it("http 代理 → type: http", () => {
    const p = uriToClashProxy("http://1.2.3.4:3128#hp", "N8")!;
    expect(p.find(([k]) => k === "type")![1]).toBe("http");
    expect(p.find(([k]) => k === "port")![1]).toBe(3128);
  });

  it("http/https 代理使用标准默认端口并保留认证", () => {
    const http = uriToClashProxy("http://proxy.example.com", "HTTP")!;
    expect(http.find(([k]) => k === "port")![1]).toBe(80);

    const https = uriToClashProxy(
      "https://user:p%40ss@proxy.example.com",
      "HTTPS",
    )!;
    expect(https.find(([k]) => k === "port")![1]).toBe(443);
    expect(https.find(([k]) => k === "username")![1]).toBe("user");
    expect(https.find(([k]) => k === "password")![1]).toBe("p@ss");
    expect(https.find(([k]) => k === "tls")![1]).toBe(true);
  });

  it("不认识的协议返回 null", () => {
    expect(uriToClashProxy("tuic://x@y:1", "N")).toBeNull();
  });
});

describe("buildClashYaml", () => {
  it("节点名 = 站长配置的原始备注(解码后),不改写", () => {
    const yaml = buildClashYaml([VLESS_REALITY, HY2, makeVmess()])!;
    expect(yaml).toContain('name: "测试"');
    expect(yaml).toContain('name: "HY2-新加坡"');
    expect(yaml).toContain('name: "旧名"');
    expect(yaml).not.toContain("Arkadia-20");
  });

  it("重名节点自动加序号保证唯一", () => {
    const T1 = "trojan://fakepass@2.3.4.5:443?sni=a.com#dup-name";
    const T2 = "trojan://fakepass@3.3.3.3:443?sni=a.com#dup-name";
    const yaml = buildClashYaml([T1, T2])!;
    expect(yaml).toContain('name: "dup-name"');
    expect(yaml).toContain('name: "dup-name 2"');
  });

  it("完整配置:DNS 段 + 选择组 + MATCH 规则(组名不带引号)", () => {
    const yaml = buildClashYaml([VLESS_REALITY, HY2, TROJAN])!;
    expect(yaml).toContain("dns:");
    expect(yaml).toContain("default-nameserver:");
    expect(yaml).toContain("- 223.5.5.5");
    expect(yaml).toContain("proxies:");
    expect(yaml).toContain("proxy-groups:");
    expect(yaml).toContain("type: select");
    expect(yaml).toContain('- "DIRECT"');
    expect(yaml).toContain("rules:");
    // 默认分流模式下兜底组是"漏网之鱼",不再是主组
    expect(yaml).toContain("  - MATCH,漏网之鱼");
    expect(yaml).not.toContain('MATCH,"漏网之鱼"');
  });

  it("首个节点字段使用列表缩进(- name:)", () => {
    const yaml = buildClashYaml([VLESS_REALITY])!;
    expect(yaml).toMatch(/  - name: "测试"\n    type: "vless"/);
  });

  it("空列表返回 null", () => {
    expect(buildClashYaml([])).toBeNull();
    expect(buildClashYaml(["tuic://x@y:1"])).toBeNull();
  });

  it("字符串值含特殊字符时安全转义", () => {
    const evil = "hysteria2://pass:word@9.9.9.9:443?sni=a#x";
    const yaml = buildClashYaml([evil]);
    expect(yaml).toContain('"pass:word"');
  });
});

describe("buildClashYaml 分流规则", () => {
  const yaml = () => buildClashYaml([VLESS_REALITY, HY2, TROJAN])!;

  it("生成全部分流分组", () => {
    const y = yaml();
    for (const g of [
      "Arkadia",
      "自动选择",
      "国外媒体",
      "电报消息",
      "微软服务",
      "苹果服务",
      "广告拦截",
      "漏网之鱼",
    ]) {
      expect(y).toContain(`- name: ${JSON.stringify(g)}`);
    }
    expect(y).toContain("type: url-test");
  });

  it("主组把自动选择排在最前(新用户默认落到延迟最低的节点)", () => {
    const y = yaml();
    const main = y.slice(y.indexOf('- name: "Arkadia"'));
    expect(main.slice(0, 200)).toContain('- "自动选择"');
  });

  it("广告拦截组第一项是 REJECT", () => {
    const y = yaml();
    const g = y.slice(y.indexOf('- name: "广告拦截"'));
    expect(g.slice(0, 160)).toContain('- "REJECT"');
  });

  it("规则顺序:局域网 → 广告 → 国外 → 国内 → GEOIP → 兜底", () => {
    const y = yaml();
    const at = (needle: string) => y.indexOf(needle);
    expect(at("IP-CIDR,10.0.0.0/8,DIRECT,no-resolve")).toBeGreaterThan(-1);
    expect(at("IP-CIDR,10.0.0.0/8,DIRECT,no-resolve")).toBeLessThan(
      at("DOMAIN-SUFFIX,doubleclick.net,广告拦截"),
    );
    // 国外域名必须排在国内之前:两边都命中时以国外为准
    expect(at("DOMAIN-SUFFIX,github.com,Arkadia")).toBeLessThan(
      at("DOMAIN-SUFFIX,cn,DIRECT"),
    );
    expect(at("DOMAIN-SUFFIX,cn,DIRECT")).toBeLessThan(at("GEOIP,CN,DIRECT,no-resolve"));
    expect(at("GEOIP,CN,DIRECT,no-resolve")).toBeLessThan(at("MATCH,漏网之鱼"));
  });

  it("MATCH 是最后一条规则", () => {
    const y = yaml().trimEnd();
    expect(y.slice(y.lastIndexOf("\n") + 1)).toBe("  - MATCH,漏网之鱼");
  });

  it("fake-ip 段不能被判直连(否则 fake-ip 连接绕过代理)", () => {
    const y = yaml();
    expect(y).toContain("fake-ip-range: 198.18.0.1/16");
    expect(y).not.toContain("IP-CIDR,198.18.0.0/15");
    expect(y).not.toContain("IP-CIDR,198.18.0.0/16");
  });

  it("IP 规则一律带 no-resolve,域名规则一律不带", () => {
    for (const line of yaml().split("\n")) {
      if (line.includes("IP-CIDR,") || line.startsWith("  - GEOIP,")) {
        expect(line.endsWith(",no-resolve")).toBe(true);
      }
      if (line.startsWith("  - DOMAIN-SUFFIX,")) {
        expect(line).not.toContain("no-resolve");
      }
    }
  });

  it("global 模式保持旧行为:单组 + MATCH 主组", () => {
    const y = buildClashYaml([VLESS_REALITY, HY2], "Arkadia", "global")!;
    expect(y).toContain("  - MATCH,Arkadia");
    expect(y).not.toContain("漏网之鱼");
    expect(y).not.toContain("DOMAIN-SUFFIX");
    expect(y).not.toContain("type: url-test");
  });
});
