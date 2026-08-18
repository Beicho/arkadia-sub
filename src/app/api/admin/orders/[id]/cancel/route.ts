import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { ldcRefund } from "@/lib/ldc";
import { expireOrder } from "@/lib/payment-core";
import { addStock } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * 管理端取消订单:
 * - pending → 直接过期,回补库存
 * - paid    → 调 LDC 退款 API 全额退回,回滚发货(注册码作废+回补 / 扣回额度)
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  const { id: idStr } = await ctx.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "参数错误" }, { status: 400 });
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return Response.json({ error: "订单不存在" }, { status: 404 });

  // ===== 待支付:直接取消,回补库存 =====
  if (order.status === "pending") {
    await expireOrder(order.id);
    await audit(admin.id, "order_cancel_pending", order.outTradeNo);
    return Response.json({ ok: true, result: "cancelled", message: "已取消并回补库存" });
  }

  if (order.status !== "paid") {
    return Response.json(
      { error: `订单状态为 ${order.status},无法取消` },
      { status: 422 },
    );
  }

  // ===== 已支付:走 LDC 退款 =====
  if (!order.tradeNo) {
    return Response.json(
      { error: "缺少 LDC 交易号(trade_no),无法发起退款" },
      { status: 422 },
    );
  }

  if (order.orderType === "activation" && order.codeId) {
    const [code] = await db
      .select()
      .from(redeemCodes)
      .where(eq(redeemCodes.id, order.codeId))
      .limit(1);
    if (code?.status === "redeemed") {
      return Response.json(
        { error: "该订单的注册码已被兑换,不能退款" },
        { status: 422 },
      );
    }
  }

  if (order.orderType === "renewal" && order.userId) {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);
    if (u && u.updateCredits < order.quantity) {
      return Response.json(
        {
          error: `用户剩余额度 ${u.updateCredits} 不足扣回 ${order.quantity}(可能已消耗),确认强退请先手动调整额度`,
        },
        { status: 422 },
      );
    }
  }

  const refund = await ldcRefund(order.tradeNo, Number(order.amount));
  if (!refund.ok) {
    await audit(admin.id, "order_refund_failed", order.outTradeNo, {
      msg: refund.msg,
    });
    return Response.json(
      { error: `LDC 退款失败:${refund.msg}` },
      { status: 502 },
    );
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, order.id))
      .for("update")
      .limit(1);
    if (!locked || locked.status !== "paid") return;

    await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(eq(orders.id, locked.id));

    if (locked.orderType === "activation" && locked.codeId) {
      await tx
        .update(redeemCodes)
        .set({ status: "void" })
        .where(eq(redeemCodes.id, locked.codeId));
      await addStock(tx, 1);
    }

    if (locked.orderType === "renewal" && locked.userId) {
      const [u] = await tx
        .select()
        .from(users)
        .where(eq(users.id, locked.userId))
        .for("update")
        .limit(1);
      if (u) {
        await tx
          .update(users)
          .set({ updateCredits: Math.max(0, u.updateCredits - locked.quantity) })
          .where(eq(users.id, u.id));
      }
    }
  });

  await audit(admin.id, "order_refund", order.outTradeNo, {
    tradeNo: order.tradeNo,
    amount: order.amount,
    msg: refund.msg,
  });
  return Response.json({ ok: true, result: "refunded", message: "已退款并回滚发货" });
}
