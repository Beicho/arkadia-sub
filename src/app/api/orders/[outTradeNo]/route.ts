import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes } from "@/db/schema";
import { reconcileOrder } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

/**
 * 查询订单状态(return 页轮询用)。
 * pending 时顺手触发一次对账。
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ outTradeNo: string }> },
) {
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
    days: order.days,
    code,
  });
}
