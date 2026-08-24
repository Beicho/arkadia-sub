import { describe, expect, it } from "vitest";
import { parseSubscriptionNodes } from "@/lib/subscription-sync";

describe("parseSubscriptionNodes", () => {
  it("解析 Clash YAML 顶层 proxies 并保留关键连接参数", () => {
    const yaml = `
mixed-port: 7890
proxies:
  - name: HY2 pinned
    type: hysteria2
    server: hy.example.com
    port: 443
    password: secret
    sni: edge.example.com
    skip-cert-verify: true
    pinned-sha256: abc123
    obfs: salamander
    obfs-password: obfs-secret
  - name: VLESS Reality
    type: vless
    server: reality.example.com
    port: 8443
    uuid: 11111111-1111-1111-1111-111111111111
    encryption: none
    network: tcp
    tls: true
    servername: sni.example.com
    client-fingerprint: chrome
    skip-cert-verify: true
    reality-opts:
      public-key: public-key
      short-id: a1b2
  - name: VMess WS
    type: vmess
    server: vmess.example.com
    port: 443
    uuid: 22222222-2222-2222-2222-222222222222
    alterId: 0
    cipher: chacha20-poly1305
    tls: true
    network: ws
    ws-opts:
      path: /socket
      headers:
        Host: ws.example.com
  - { name: HTTP auth, type: http, server: 203.0.113.8, port: 8080, username: user, password: pass, tls: true }
proxy-groups:
  - name: select-group
    type: select
    proxies: [HY2 pinned, VLESS Reality, VMess WS, HTTP auth]
`;

    const nodes = parseSubscriptionNodes(yaml);
    expect(nodes).toHaveLength(4);

    const hy2 = nodes.find((node) => node.startsWith("hysteria2://"));
    expect(hy2).toContain("pinSHA256=abc123");
    expect(hy2).toContain("insecure=1");
    expect(hy2).toContain("obfs-password=obfs-secret");

    const vless = nodes.find((node) => node.startsWith("vless://"));
    expect(vless).toContain("security=reality");
    expect(vless).toContain("pbk=public-key");
    expect(vless).toContain("sid=a1b2");
    expect(vless).toContain("allowInsecure=1");

    const vmess = nodes.find((node) => node.startsWith("vmess://"));
    const vmessPayload = JSON.parse(
      Buffer.from(vmess!.slice("vmess://".length), "base64").toString("utf8"),
    ) as { scy: string; security: string; host: string; path: string };
    expect(vmessPayload.scy).toBe("chacha20-poly1305");
    expect(vmessPayload.security).toBe("chacha20-poly1305");
    expect(vmessPayload.host).toBe("ws.example.com");
    expect(vmessPayload.path).toBe("/socket");

    const http = nodes.find((node) => node.startsWith("https://"));
    expect(http).toContain("user:pass@203.0.113.8:8080");
  });

  it("兼容整段 Base64 与原始 URI，并去重", () => {
    const raw = [
      "vless://id@example.com:443?security=tls#one",
      "vless://id@example.com:443?security=tls#one",
      "socks5://127.0.0.1:1080#local",
    ].join("\n");
    const encoded = Buffer.from(raw).toString("base64");

    expect(parseSubscriptionNodes(encoded)).toEqual([
      "vless://id@example.com:443?security=tls#one",
      "socks5://127.0.0.1:1080#local",
    ]);
  });

  it("保留显式默认端口的 HTTP 代理且拒绝普通网页地址", () => {
    const raw = [
      "http://proxy.example.com:80#http-default",
      "https://proxy.example.com:443#https-default",
      "https://www.example.com/path",
    ].join("\n");

    expect(parseSubscriptionNodes(raw)).toEqual([
      "http://proxy.example.com:80#http-default",
      "https://proxy.example.com:443#https-default",
    ]);
  });
});
