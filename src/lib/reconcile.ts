import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { ldcConfigured, queryLdcOrder } from "@/lib/ldc";
import { expireOrder, markOrderPaid } from "@/lib/payment-core";

/** 订单支付有效期(分钟),与 LDC 平台侧 merchant_order_expire_minutes 对齐留余量 */
const ORDER_EXPIRE_MINUTES = Number(
  process.env.LDC_ORDER_EXPIRE_MINUTES ?? 60,
);

/** 对超过 5 分钟的 pending 订单:向 LDC 查询 → 已付则入账;确认不存在且超时则过期回补 */
export async function reconcilePendingOrders(): Promise<{
  markedPaid: number;
  expired: number;
}> {
  if (!ldcConfigured()) return { markedPaid: 0, expired: 0 };

  const cutoff = new Date(Date.now() - 5 * 60_000);
  const pending = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.createdAt, cutoff)))
    .limit(200);

  let markedPaid = 0;
  let expired = 0;

  for (const order of pending) {
    try {
      const res = await queryLdcOrder(order.outTradeNo);
      if (res.found && res.paid) {
        const r = await markOrderPaid(order.outTradeNo, res.tradeNo, res.raw);
        if (r === "ok") markedPaid += 1;
        continue;
      }
      const ageMin = (Date.now() - order.createdAt.getTime()) / 60_000;
      if (!res.found && ageMin > ORDER_EXPIRE_MINUTES) {
        await expireOrder(order.id);
        expired += 1;
      }
      // found 但未支付:还在认证流程里,等下一轮
    } catch (err) {
      // 网络错误等:跳过,下轮再试
      console.warn("[reconcile] order %s failed", order.outTradeNo, err);
    }
  }

  if (markedPaid || expired) {
    console.log(
      "[reconcile] markedPaid=%d expired=%d",
      markedPaid,
      expired,
    );
  }
  return { markedPaid, expired };
}

/** 单笔对账(页面加载 / 管理端按钮) */
export async function reconcileOrder(
  outTradeNo: string,
): Promise<"paid" | "still_pending" | "not_found"> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.outTradeNo, outTradeNo))
    .limit(1);
  if (!order) return "not_found";
  if (order.status === "paid") return "paid";

  if (ldcConfigured()) {
    try {
      const res = await queryLdcOrder(outTradeNo);
      if (res.found && res.paid) {
        await markOrderPaid(outTradeNo, res.tradeNo, res.raw);
        return "paid";
      }
    } catch {
      // 查询失败按 pending 处理
    }
  }
  return "still_pending";
}
