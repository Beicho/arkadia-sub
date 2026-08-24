import crypto from "node:crypto";

/** LDC 易支付兼容接口基址 */
export const EPAY_BASE =
  process.env.LDC_EPAY_BASE ?? "https://credit.linux.do/epay";
const LDC_REQUEST_TIMEOUT_MS = 10_000;

export function ldcPid(): string {
  return process.env.LDC_PID ?? "";
}
export function ldcKey(): string {
  return process.env.LDC_KEY ?? "";
}
export function ldcConfigured(): boolean {
  return Boolean(ldcPid() && ldcKey());
}

/**
 * 易支付 MD5 签名:
 * 1. 取除 sign/sign_type 外的所有非空参数
 * 2. 参数名按 ASCII 升序(PHP ksort 为字节序,这里用 Buffer.compare 保持一致)
 * 3. 拼接 k1=v1&k2=v2 后直接追加商户密钥
 * 4. MD5 小写十六进制
 */
export function epaySign(
  params: Record<string, string>,
  key: string,
): string {
  const keys = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type")
    .filter((k) => {
      const v = params[k];
      return v !== undefined && v !== null && v !== "";
    })
    .sort((a, b) => Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")));
  const base = keys.map((k) => `${k}=${params[k]}`).join("&") + key;
  return crypto.createHash("md5").update(base, "utf8").digest("hex");
}

/** 验证异步通知签名 */
export function verifyEpaySign(
  params: Record<string, string>,
  sign: string,
  key: string,
): boolean {
  if (!sign) return false;
  const expected = epaySign(params, key);
  return timingSafeEqualStr(sign.toLowerCase(), expected);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

/** 金额(字符串,最多两位小数)比对,按"分"取整避免浮点误差 */
export function moneyEquals(a: string, b: string): boolean {
  const ca = toCents(a);
  const cb = toCents(b);
  return ca !== null && cb !== null && ca === cb;
}

export function toCents(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/** 提交到 LDC 的表单字段(签名后) */
export function buildSubmitFields(input: {
  outTradeNo: string;
  name: string;
  money: number;
  notifyUrl: string;
  returnUrl: string;
}): Record<string, string> {
  const params: Record<string, string> = {
    pid: ldcPid(),
    type: "epay",
    out_trade_no: input.outTradeNo,
    name: input.name,
    money: input.money.toFixed(2),
    notify_url: input.notifyUrl,
    return_url: input.returnUrl,
  };
  const sign = epaySign(params, ldcKey());
  return { ...params, sign, sign_type: "MD5" };
}

export type LdcOrderStatus = {
  found: boolean;
  paid: boolean;
  tradeNo: string | null;
  money: string | null;
  raw: unknown;
};

/**
 * 订单退款:POST /epay/api.php(pid/key 鉴权)。
 * 仅支持全额退回:money 必须等于原订单金额。
 */
export async function ldcRefund(
  tradeNo: string,
  money: number,
): Promise<
  | { ok: true; msg: string }
  | { ok: false; msg: string; uncertain: boolean }
> {
  const body = new URLSearchParams({
    pid: ldcPid(),
    key: ldcKey(),
    trade_no: tradeNo,
    money: money.toFixed(2),
  });
  try {
    const res = await fetchLdc(`${EPAY_BASE}/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      return { ok: false, msg: `HTTP ${res.status}`, uncertain: true };
    }
    const data = (await res.json().catch(() => null)) as {
      code?: number;
      msg?: string;
    } | null;
    if (data?.code === 1) return { ok: true, msg: data.msg ?? "退款成功" };
    if (!data || typeof data.code !== "number") {
      return { ok: false, msg: "LDC 返回无效响应", uncertain: true };
    }
    return { ok: false, msg: data.msg ?? "退款被拒绝", uncertain: false };
  } catch (err) {
    return {
      ok: false,
      msg: err instanceof Error ? err.message : "网络错误",
      uncertain: true,
    };
  }
}

/** 主动查询订单(对账兜底) */
export async function queryLdcOrder(outTradeNo: string): Promise<LdcOrderStatus> {
  const url = new URL(`${EPAY_BASE}/api.php`);
  url.searchParams.set("act", "order");
  url.searchParams.set("pid", ldcPid());
  url.searchParams.set("key", ldcKey());
  url.searchParams.set("out_trade_no", outTradeNo);
  const res = await fetchLdc(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`LDC order query HTTP ${res.status}`);
  }
  const body = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    trade_no?: string;
    money?: string;
    status?: number;
  } | null;
  if (!body || typeof body.code !== "number") {
    throw new Error("LDC order query returned an invalid response");
  }
  if (body.code === 1) {
    if (body.status !== 0 && body.status !== 1) {
      throw new Error("LDC order query returned an invalid status");
    }
    return {
      found: true,
      paid: body.status === 1,
      tradeNo: body.trade_no ?? null,
      money: body.money ?? null,
      raw: body,
    };
  }
  if (body.code === -1) {
    return { found: false, paid: false, tradeNo: null, money: null, raw: body };
  }
  throw new Error(`LDC order query returned unexpected code ${body.code}`);
}

async function fetchLdc(input: string | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LDC_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
