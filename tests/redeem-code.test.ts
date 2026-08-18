import { describe, expect, it } from "vitest";
import {
  generateOutTradeNo,
  generateRedeemCode,
  isValidCodeFormat,
  normalizeCode,
} from "@/lib/redeem-code";

describe("redeem code", () => {
  it("格式:ARK-三组四位,不含易混淆字符", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRedeemCode();
      expect(code).toMatch(/^ARK-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
      expect(code).not.toMatch(/[0O1I]/);
      expect(isValidCodeFormat(code)).toBe(true);
    }
  });

  it("normalize:小写/空白/换行归一", () => {
    expect(normalizeCode(" ark-abcd-2345-6789 \n")).toBe("ARK-ABCD-2345-6789");
    expect(isValidCodeFormat("ark-abcd-2345-6789")).toBe(true);
    expect(isValidCodeFormat("ARK-ABCD-2345")).toBe(false);
    expect(isValidCodeFormat("ARK-O0O0-2345-6789")).toBe(false); // 含 0/O
  });
});

describe("outTradeNo", () => {
  it("ARK+日期+6位随机,批量不重复", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const no = generateOutTradeNo();
      expect(no).toMatch(/^ARK\d{14}[2-9A-HJ-NP-Z]{6}$/);
      expect(seen.has(no)).toBe(false);
      seen.add(no);
    }
  });
});
