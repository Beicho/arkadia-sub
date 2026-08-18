import { describe, expect, it } from "vitest";
import {
  buildRawContent,
  buildSubscriptionPayload,
  normalizeNodeInput,
  nodeDisplayName,
  readNodeName,
  rewriteNodeName,
} from "@/lib/nodes";

const VLESS =
  "vless://928e6cce-8ced-4243-9a48-a6642edd09b0@97.64.31.10:13779?encryption=none&security=reality&sni=tesla.com&fp=chrome&type=tcp#%E6%9C%BA%E6%88%BF-%E7%BE%8E%E5%9B%BD";
const HY2 =
  "hysteria2://b07baf8fca580933cc39e6e5a6671a5d@138-2-67-146.liao.kdns.fr:50160?sni=x#HY2-%E6%96%B0%E5%8A%A0%E5%9D%A1";
const TROJAN = "trojan://pass@1.2.3.4:443?sni=a.com#trojan-node";

function makeVmess(name: string): string {
  const json = JSON.stringify({ v: "2", ps: name, add: "1.2.3.4", port: "443" });
  return `vmess://${Buffer.from(json).toString("base64")}`;
}

describe("normalizeNodeInput", () => {
  it("一行一个,去空行与重复", () => {
    const input = `${VLESS}\n\n  ${HY2}  \n${VLESS}\n`;
    expect(normalizeNodeInput(input)).toEqual([VLESS, HY2]);
  });

  it("整段 base64 自动解码", () => {
    const blob = Buffer.from(`${VLESS}\n${HY2}`).toString("base64");
    expect(normalizeNodeInput(blob)).toEqual([VLESS, HY2]);
  });

  it("忽略非节点行", () => {
    expect(normalizeNodeInput("hello\nhttps://example.com\n")).toEqual([]);
  });
});

describe("rewriteNodeName", () => {
  it("vless/hysteria2/trojan 替换 fragment 并编码", () => {
    for (const uri of [VLESS, HY2, TROJAN]) {
      const out = rewriteNodeName(uri, "Arkadia-20260818-01");
      expect(out).toContain("#Arkadia-20260818-01");
      expect(out.startsWith(uri.split("#")[0])).toBe(true);
      expect(readNodeName(out)).toBe("Arkadia-20260818-01");
    }
  });

  it("无备注的补一个 fragment", () => {
    const bare = "vless://uuid@1.2.3.4:443?type=tcp";
    expect(rewriteNodeName(bare, "Arkadia-20260818-02")).toBe(
      `${bare}#Arkadia-20260818-02`,
    );
  });

  it("vmess 重写 ps 字段且可往返", () => {
    const out = rewriteNodeName(makeVmess("旧名字"), "Arkadia-20260818-03");
    expect(out.startsWith("vmess://")).toBe(true);
    expect(readNodeName(out)).toBe("Arkadia-20260818-03");
    // 除 ps 外字段不变
    const orig = JSON.parse(
      Buffer.from(makeVmess("旧名字").slice(8), "base64").toString(),
    );
    const now = JSON.parse(Buffer.from(out.slice(8), "base64").toString());
    expect(now.add).toBe(orig.add);
    expect(now.port).toBe(orig.port);
  });

  it("同批次命名稳定(日期+序号确定性)", () => {
    expect(nodeDisplayName("2026-08-18", 0)).toBe("Arkadia-20260818-01");
    expect(nodeDisplayName("2026-08-18", 29)).toBe("Arkadia-20260818-30");
  });
});

describe("buildSubscriptionPayload / buildRawContent", () => {
  const nodes = [VLESS, HY2, makeVmess("x")];

  it("payload 是 base64,解码后按序号命名", () => {
    const payload = buildSubscriptionPayload(nodes, "2026-08-18");
    const decoded = Buffer.from(payload, "base64").toString("utf8");
    const lines = decoded.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("#Arkadia-20260818-01");
    expect(lines[1]).toContain("#Arkadia-20260818-02");
    expect(readNodeName(lines[2])).toBe("Arkadia-20260818-03");
  });

  it("raw 内容与 payload 一致(除 base64)", () => {
    const raw = buildRawContent(nodes, "2026-08-18");
    expect(Buffer.from(buildSubscriptionPayload(nodes, "2026-08-18"), "base64").toString("utf8")).toBe(raw);
  });
});
