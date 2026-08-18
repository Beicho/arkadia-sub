import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { epaySign, moneyEquals, toCents, verifyEpaySign } from "@/lib/ldc";

const KEY = "test-secret";

function md5(s: string): string {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

describe("epaySign", () => {
  it("文档示例:字典序 + 密钥拼接", () => {
    const params = {
      money: "10.00",
      order_name: "Test",
      out_trade_no: "M1",
      type: "ldcpay",
      client_id: "1",
    };
    const base = "client_id=1&money=10.00&order_name=Test&out_trade_no=M1&type=ldcpay";
    expect(epaySign(params, KEY)).toBe(md5(base + KEY));
  });

  it("排除 sign / sign_type 与空值", () => {
    const withNoise = {
      money: "10",
      name: "Test",
      out_trade_no: "M2",
      pid: "001",
      type: "epay",
      sign: "should-be-ignored",
      sign_type: "MD5",
      device: "",
    };
    const clean = {
      money: "10",
      name: "Test",
      out_trade_no: "M2",
      pid: "001",
      type: "epay",
    };
    expect(epaySign(withNoise, KEY)).toBe(epaySign(clean, KEY));
  });

  it("参数名按字节序排序(非首字母字典序)", () => {
    const params = { b: "2", a: "1", A: "0" };
    // ASCII: 'A'(65) < 'a'(97) < 'b'(98)
    const base = "A=0&a=1&b=2";
    expect(epaySign(params, KEY)).toBe(md5(base + KEY));
  });

  it("verifyEpaySign 通过与拒绝", () => {
    const params = { money: "10", pid: "001", type: "epay", out_trade_no: "M3" };
    const sign = epaySign(params, KEY);
    expect(verifyEpaySign(params, sign, KEY)).toBe(true);
    // 篡改金额后旧签名失效
    expect(verifyEpaySign({ ...params, money: "1" }, sign, KEY)).toBe(false);
    expect(verifyEpaySign(params, "", KEY)).toBe(false);
  });
});

describe("moneyEquals(金额篡改防线)", () => {
  it("10 与 10.00 相等", () => {
    expect(moneyEquals("10", "10.00")).toBe(true);
    expect(moneyEquals("100.00", "100")).toBe(true);
  });

  it("不等金额拒绝", () => {
    expect(moneyEquals("10", "9.99")).toBe(false);
    expect(moneyEquals("10", "100")).toBe(false);
    expect(moneyEquals("10", "")).toBe(false);
  });

  it("非法输入返回 false / null", () => {
    expect(moneyEquals("abc", "10")).toBe(false);
    expect(toCents("-1")).toBeNull();
    expect(toCents("10.5")).toBe(1050);
  });
});
