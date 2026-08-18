import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes } from "@/db/schema";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";
import { reconcileOrder } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

/**
 * 查询订单状态(return 页轮询用)。
 * pending 时顺手触发一次对账。
 * 注意:响应含已付订单的注册码,必须限速防单号枚举。
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ outTradeNo: string }> },
) {
  const ip = clientIp(req);
  const rl = rateLimit(`order-status:${ip}`, 10, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const { outTradeNo } = await ctx.params;

  let [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.outTradeNo, outTradeNo))
    .limit(1);
  if (!order) {
    return Response.json({ error: "订单不存在" }, { status: 404 });
  }

  if (order.status === "pending") {
    await reconcileOrder(outTradeNo);
    [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.outTradeNo, outTradeNo))
      .limit(1);
  }

  let code: string | null = null;
  if (order.status === "paid" && order.codeId) {
    const [c] = await db
      .select()
      .from(redeemCodes)
      .where(eq(redeemCodes.id, order.codeId))
      .limit(1);
    if (c && c.revealed) code = c.code;
  }

  return Response.json({
    status: order.status,
    orderType: order.orderType,
    amount: order.amount,
    quantity: order.quantity,
    code,
  });
}
