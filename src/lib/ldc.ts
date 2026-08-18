import crypto from "node:crypto";

/** LDC 易支付兼容接口基址 */
export const EPAY_BASE =
  process.env.LDC_EPAY_BASE ?? "https://credit.linux.do/epay";

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
): Promise<{ ok: boolean; msg: string }> {
  const body = new URLSearchParams({
    pid: ldcPid(),
    key: ldcKey(),
    trade_no: tradeNo,
    money: money.toFixed(2),
  });
  try {
    const res = await fetch(`${EPAY_BASE}/api.php`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as {
      code?: number;
      msg?: string;
    } | null;
    if (data?.code === 1) return { ok: true, msg: data.msg ?? "退款成功" };
    return { ok: false, msg: data?.msg ?? `HTTP ${res.status}` };
  } catch (err) {
    return {
      ok: false,
      msg: err instanceof Error ? err.message : "网络错误",
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
  const res = await fetch(url, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    trade_no?: string;
    money?: string;
    status?: number;
  } | null;
  if (!body) {
    return { found: false, paid: false, tradeNo: null, money: null, raw: null };
  }
  if (body.code === 1) {
    return {
      found: true,
      paid: body.status === 1,
      tradeNo: body.trade_no ?? null,
      money: body.money ?? null,
      raw: body,
    };
  }
  // code === -1: 服务不存在或已完成
  return { found: false, paid: false, tradeNo: null, money: null, raw: body };
}
