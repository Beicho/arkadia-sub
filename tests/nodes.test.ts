import { describe, expect, it } from "vitest";
import {
  buildRawContent,
  buildSubscriptionPayload,
  filterNodesByKeywords,
  normalizeNodeInput,
  readNodeName,
} from "@/lib/nodes";

const VLESS =
  "vless://928e6cce-8ced-4243-9a48-a6642edd09b0@97.64.31.10:13779?encryption=none&security=reality&sni=tesla.com&fp=chrome&type=tcp#%E6%9C%BA%E6%88%BF-%E7%BE%8E%E5%9B%BD";
const HY2 =
  "hysteria2://b07baf8fca580933cc39e6e5a6671a5d@138-2-67-146.liao.kdns.fr:50160?sni=x#HY2-%E6%96%B0%E5%8A%A0%E5%9D%A1";
const TROJAN = "trojan://pass@1.2.3.4:443?sni=a.com#trojan-node";
const SOCKS5 = "socks5://user:pass@1.2.3.4:1080#socks-node";

describe("normalizeNodeInput", () => {
  it("一行一个,去空行与重复", () => {
    const input = `${VLESS}\n\n  ${HY2}  \n${VLESS}\n`;
    expect(normalizeNodeInput(input)).toEqual([VLESS, HY2]);
  });

  it("整段 base64 自动解码", () => {
    const blob = Buffer.from(`${VLESS}\n${HY2}`).toString("base64");
    expect(normalizeNodeInput(blob)).toEqual([VLESS, HY2]);
  });

  it("忽略非节点行(https/普通文本)", () => {
    expect(normalizeNodeInput("hello\nhttps://example.com\n")).toEqual([]);
  });

  it("接受 socks5 节点但不接受普通 web URL", () => {
    expect(normalizeNodeInput(`${SOCKS5}\nhttp://example.com\nhttps://example.com`)).toEqual([
      SOCKS5,
    ]);
  });
});

describe("filterNodesByKeywords", () => {
  const nodes = [VLESS, HY2, TROJAN];

  it("按 | 分隔关键词且大小写不敏感", () => {
    expect(filterNodesByKeywords(nodes, "97.64|HY2")).toEqual([VLESS, HY2]);
    expect(filterNodesByKeywords(nodes, "trojan")).toEqual([TROJAN]);
  });

  it("支持排除且空结果保持为空", () => {
    expect(filterNodesByKeywords(nodes, "HY2", true)).toEqual([VLESS, TROJAN]);
    expect(filterNodesByKeywords(nodes, "不存在")).toEqual([]);
    expect(filterNodesByKeywords(nodes, "vless|hysteria2|trojan", true)).toEqual([]);
  });
});

describe("readNodeName(原始备注)", () => {
  it("解码 fragment 备注(中文)", () => {
    expect(readNodeName(VLESS)).toBe("机房-美国");
    expect(readNodeName(HY2)).toBe("HY2-新加坡");
    expect(readNodeName(TROJAN)).toBe("trojan-node");
  });

  it("无备注返回占位", () => {
    expect(readNodeName("vless://uuid@1.2.3.4:443")).toBe("(无备注)");
  });
});

describe("下发内容(节点名原样保留,绝不改写)", () => {
  const nodes = [VLESS, HY2];

  it("base64 payload 解码后与原始行一致", () => {
    const decoded = Buffer.from(
      buildSubscriptionPayload(nodes),
      "base64",
    ).toString("utf8");
    expect(decoded).toBe(nodes.join("\n"));
    expect(decoded).toContain("#%E6%9C%BA%E6%88%BF-%E7%BE%8E%E5%9B%BD"); // 原始备注原样在
    expect(decoded).not.toContain("Arkadia-20"); // 不出现改名
  });

  it("raw 内容 = 原始行拼接", () => {
    expect(buildRawContent(nodes)).toBe(nodes.join("\n"));
  });
});
