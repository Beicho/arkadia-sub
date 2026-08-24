import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes, users } from "@/db/schema";
import { addStock } from "@/lib/settings";

export type MarkPaidResult =
  | "ok"
  | "already_paid"
  | "not_found"
  | "invalid_status"
  | "delivery_failed";

export function canDeliverPaidOrder(status: string): boolean {
  return status === "pending" || status === "expired";
}

/**
 * 幂等入账:行锁保证并发通知/对账只生效一次。
 * - activation → 注册码 revealed(用户可见)
 * - renewal   → 增加永久有效的更新额度
 */
export async function markOrderPaid(
  outTradeNo: string,
  tradeNo: string | null,
  raw: unknown,
): Promise<MarkPaidResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.outTradeNo, outTradeNo))
      .for("update")
      .limit(1);
    if (!order) return "not_found";
    if (order.status === "paid") return "already_paid";
    if (!canDeliverPaidOrder(order.status)) return "invalid_status";

    if (order.orderType === "activation") {
      if (!order.codeId) return "delivery_failed";
      const [code] = await tx
        .select()
        .from(redeemCodes)
        .where(eq(redeemCodes.id, order.codeId))
        .for("update")
        .limit(1);
      if (!code || code.status === "redeemed") return "delivery_failed";

      if (order.status === "pending" && code.status !== "issued") {
        return "delivery_failed";
      }
      if (order.status === "expired" && code.status !== "void") {
        return "delivery_failed";
      }

      await tx
        .update(redeemCodes)
        .set({ status: "issued", revealed: true })
        .where(eq(redeemCodes.id, order.codeId));

      // expireOrder 曾回补一份库存；迟到付款交付原注册码时必须撤销回补。
      if (order.status === "expired") await addStock(tx, -1);
    } else if (order.orderType === "renewal") {
      if (!order.userId) return "delivery_failed";
      const [u] = await tx
        .select()
        .from(users)
        .where(eq(users.id, order.userId))
        .for("update")
        .limit(1);
      if (!u) return "delivery_failed";

      // 续费 = 增加更新额度(不随时间过期)
      await tx
        .update(users)
        .set({ updateCredits: u.updateCredits + order.quantity })
        .where(eq(users.id, u.id));
    } else {
      return "delivery_failed";
    }

    await tx
      .update(orders)
      .set({
        status: "paid",
        tradeNo,
        paidAt: new Date(),
        notifyRaw: (raw ?? null) as never,
      })
      .where(eq(orders.id, order.id));

    return "ok";
  });
}

/**
 * 过期未付:订单置 expired;注册码订单若码未 reveal 且未兑换 → 作废该码并回补库存。
 * 必须在向 LDC 对账确认"不存在/未支付"之后调用。
 */
export async function expireOrder(orderId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    if (!order || order.status !== "pending") return false;

    await tx
      .update(orders)
      .set({ status: "expired" })
      .where(eq(orders.id, order.id));

    if (order.orderType === "activation" && order.codeId) {
      const [code] = await tx
        .select()
        .from(redeemCodes)
        .where(eq(redeemCodes.id, order.codeId))
        .for("update")
        .limit(1);
      if (code && !code.revealed && code.status === "issued") {
        await tx
          .update(redeemCodes)
          .set({ status: "void" })
          .where(eq(redeemCodes.id, code.id));
        await addStock(tx, 1);
      }
    }
    return true;
  });
}

/** 兑换注册码:激活账号并送 activation_days 天免费更新期 */
export async function redeemCodeForUser(
  userId: number,
  codeStr: string,
  days: number,
): Promise<{ ok: true; paidUntil: Date } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [code] = await tx
      .select()
      .from(redeemCodes)
      .where(eq(redeemCodes.code, codeStr))
      .for("update")
      .limit(1);
    if (!code) return { ok: false, error: "注册码不存在,请检查输入" };
    if (code.status === "void") return { ok: false, error: "该注册码已作废" };
    if (code.status === "redeemed")
      return { ok: false, error: "该注册码已被使用" };

    const [u] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);
    if (!u) return { ok: false, error: "用户不存在" };
    if (u.activated) return { ok: false, error: "账号已激活,无需重复兑换" };

    await tx
      .update(redeemCodes)
      .set({ status: "redeemed", redeemedBy: userId, redeemedAt: new Date() })
      .where(eq(redeemCodes.id, code.id));

    const base =
      u.paidUntil && u.paidUntil.getTime() > Date.now() ? u.paidUntil : new Date();
    const paidUntil = new Date(base.getTime() + days * 86_400_000);
    await tx
      .update(users)
      .set({ activated: true, paidUntil })
      .where(eq(users.id, userId));

    return { ok: true, paidUntil };
  });
}
