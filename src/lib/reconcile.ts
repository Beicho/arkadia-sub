import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { ldcConfigured, queryLdcOrder } from "@/lib/ldc";
import { expireOrder, markOrderPaid } from "@/lib/payment-core";

/** 待支付订单有效期(分钟):超时自动关闭并回补库存 */
export const ORDER_EXPIRE_MINUTES = Number(
  process.env.LDC_ORDER_EXPIRE_MINUTES ?? 5,
);

/** 扫描起点:创建满 1 分钟的 pending 订单才参与对账(给支付跳转留时间) */
const SCAN_AFTER_MINUTES = 1;

/**
 * 对账 + 超时关闭:
 * 1. 向 LDC 查询,已支付 → 入账(优先,绝不误杀已付订单)
 * 2. 未支付且创建时间超过 ORDER_EXPIRE_MINUTES → 关闭订单、回补库存
 *    (不再要求"LDC 侧查不到";LDC 对已创建未付订单返回 found=true/status=0,
 *     旧逻辑因此永远不过期 —— 这是待支付订单堆积的根因)
 * 3. LDC 未配置或查询异常 → 仍按时间关闭(用户没付款,不能一直占库存),
 *    已付订单靠回调 + 单笔对账兜底
 */
export async function reconcilePendingOrders(): Promise<{
  markedPaid: number;
  expired: number;
}> {
  const scanCutoff = new Date(Date.now() - SCAN_AFTER_MINUTES * 60_000);
  const pending = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.createdAt, scanCutoff)))
    .limit(500);

  let markedPaid = 0;
  let expired = 0;

  for (const order of pending) {
    const ageMin = (Date.now() - order.createdAt.getTime()) / 60_000;
    try {
      if (ldcConfigured()) {
        const res = await queryLdcOrder(order.outTradeNo);
        if (res.found && res.paid) {
          const r = await markOrderPaid(order.outTradeNo, res.tradeNo, res.raw);
          if (r === "ok") markedPaid += 1;
          continue;
        }
      }
      if (ageMin > ORDER_EXPIRE_MINUTES) {
        await expireOrder(order.id);
        expired += 1;
      }
    } catch (err) {
      console.warn("[reconcile] query failed %s", order.outTradeNo, err);
      // 查询失败也按时间关闭:未付订单不应无限占用库存
      if (ageMin > ORDER_EXPIRE_MINUTES) {
        try {
          await expireOrder(order.id);
          expired += 1;
        } catch {
          // 关闭失败留给下一轮
        }
      }
    }
  }

  if (markedPaid || expired) {
    console.log("[reconcile] markedPaid=%d expired=%d", markedPaid, expired);
  }
  return { markedPaid, expired };
}

/** 单笔对账(页面加载 / 管理端按钮):只做入账,不做过期 */
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
