import crypto from "node:crypto";

/** 去掉易混淆字符(0/O/1/I)的字母表 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRedeemCode(): string {
  const pick = () =>
    ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  const group = () =>
    Array.from({ length: 4 }, pick).join("");
  return `ARK-${group()}-${group()}-${group()}`;
}

export const REDEEM_CODE_RE = /^ARK-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;

export function isValidCodeFormat(code: string): boolean {
  return REDEEM_CODE_RE.test(code.trim().toUpperCase());
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** 业务单号:ARK + 日期 + 随机 */
export function generateOutTradeNo(): string {
  const now = new Date();
  const ymd = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate(),
  ).padStart(2, "0")}`;
  const rand = Array.from({ length: 6 }, () =>
    ALPHABET[crypto.randomInt(0, ALPHABET.length)],
  ).join("");
  return `ARK${ymd}${rand}`;
}
