import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { epaySign, ldcPid, ldcKey, ldcConfigured, moneyEquals } from "@/lib/ldc";
import { markOrderPaid } from "@/lib/payment-core";

export const dynamic = "force-dynamic";

function reply(body: string): Response {
  // 协议要求:成功必须返回 HTTP 200 且响应体为 success(大小写不敏感)
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** LDC 异步通知(HTTP GET):验签 → 金额比对 → 幂等入账 */
export async function GET(req: Request) {
  if (!ldcConfigured()) return reply("not-configured");

  const url = new URL(req.url);
  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (v !== "") params[k] = v;
  }
  const sign = params.sign ?? "";
  const signType = params.sign_type ?? "";

  if (signType && signType !== "MD5") return reply("sign-type-error");
  if (!sign) return reply("missing-sign");

  const expected = epaySign(params, ldcKey());
  if (sign.toLowerCase() !== expected) {
    console.warn("[notify] sign mismatch", params.out_trade_no);
    return reply("sign-error");
  }
  if (params.pid !== ldcPid()) return reply("pid-error");
  if (params.trade_status !== "TRADE_SUCCESS") return reply("status-error");

  const outTradeNo = params.out_trade_no ?? "";
  if (!outTradeNo) return reply("missing-order");

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.outTradeNo, outTradeNo))
    .limit(1);
  if (!order) return reply("order-not-found");

  // 金额篡改防线:以服务端订单金额为准
  if (!moneyEquals(order.amount, params.money ?? "")) {
    console.error(
      "[notify] MONEY MISMATCH",
      outTradeNo,
      "order=",
      order.amount,
      "notify=",
      params.money,
    );
    return reply("amount-mismatch");
  }

  const result = await markOrderPaid(outTradeNo, params.trade_no ?? null, params);
  if (result === "not_found") return reply("order-not-found");

  // 重复通知也回 success,让对方停止重试
  return reply("success");
}
