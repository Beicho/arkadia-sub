import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { ldcRefund } from "@/lib/ldc";
import { expireOrder } from "@/lib/payment-core";
import { addStock } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RefundOrder = typeof orders.$inferSelect;
type ReserveResult =
  | { ok: true; order: RefundOrder }
  | { ok: false; status: number; error: string };

/** 在调用外部退款前锁定订单并收回已发权益，阻止重复退款或并发消费。 */
async function reserveRefund(orderId: number): Promise<ReserveResult> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    if (!order) return { ok: false, status: 404, error: "订单不存在" };
    if (order.status === "refund_pending") {
      return { ok: false, status: 409, error: "该订单正在退款处理中" };
    }
    if (order.status !== "paid") {
      return {
        ok: false,
        status: 422,
        error: `订单状态为 ${order.status},无法取消`,
      };
    }
    if (!order.tradeNo) {
      return {
        ok: false,
        status: 422,
        error: "缺少 LDC 交易号(trade_no),无法发起退款",
      };
    }

    if (order.orderType === "activation" && order.codeId) {
      const [code] = await tx
        .select()
        .from(redeemCodes)
        .where(eq(redeemCodes.id, order.codeId))
        .for("update")
        .limit(1);
      if (!code || code.status !== "issued") {
        return {
          ok: false,
          status: 422,
          error:
            code?.status === "redeemed"
              ? "该订单的注册码已被兑换,不能退款"
              : "该订单的注册码状态异常,不能退款",
        };
      }
      await tx
        .update(redeemCodes)
        .set({ status: "void" })
        .where(eq(redeemCodes.id, code.id));
      await addStock(tx, 1);
    } else if (order.orderType === "renewal" && order.userId) {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, order.userId))
        .for("update")
        .limit(1);
      if (!user) {
        return { ok: false, status: 422, error: "订单用户不存在,不能退款" };
      }
      if (user.updateCredits < order.quantity) {
        return {
          ok: false,
          status: 422,
          error: `用户剩余额度 ${user.updateCredits} 不足扣回 ${order.quantity}(可能已消耗),确认强退请先手动调整额度`,
        };
      }
      await tx
        .update(users)
        .set({ updateCredits: user.updateCredits - order.quantity })
        .where(eq(users.id, user.id));
    } else {
      return { ok: false, status: 422, error: "订单类型或权益关联数据异常" };
    }

    await tx
      .update(orders)
      .set({ status: "refund_pending" })
      .where(eq(orders.id, order.id));
    return { ok: true, order };
  });
}

/** 外部退款明确失败时，把预留的权益和 paid 状态原子恢复。 */
async function restoreFailedRefund(orderId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    if (!order || order.status !== "refund_pending") return false;

    if (order.orderType === "activation" && order.codeId) {
      const [code] = await tx
        .select()
        .from(redeemCodes)
        .where(eq(redeemCodes.id, order.codeId))
        .for("update")
        .limit(1);
      if (!code || code.status !== "void") {
        throw new Error("refund rollback activation code state mismatch");
      }
      await tx
        .update(redeemCodes)
        .set({ status: "issued", revealed: true })
        .where(eq(redeemCodes.id, code.id));
      await addStock(tx, -1);
    } else if (order.orderType === "renewal" && order.userId) {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, order.userId))
        .for("update")
        .limit(1);
      if (!user) throw new Error("refund rollback user missing");
      await tx
        .update(users)
        .set({ updateCredits: user.updateCredits + order.quantity })
        .where(eq(users.id, user.id));
    } else {
      throw new Error("refund rollback order relation mismatch");
    }

    await tx
      .update(orders)
      .set({ status: "paid" })
      .where(eq(orders.id, order.id));
    return true;
  });
}

async function finalizeRefund(orderId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .for("update")
      .limit(1);
    if (!order || order.status !== "refund_pending") return false;
    await tx
      .update(orders)
      .set({ status: "refunded" })
      .where(eq(orders.id, order.id));
    return true;
  });
}

/**
 * 管理端取消订单:
 * - pending → 直接过期,回补库存
 * - paid    → 先预留并回滚权益,再调 LDC 全额退款
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

  const [current] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!current) return Response.json({ error: "订单不存在" }, { status: 404 });

  if (current.status === "pending") {
    const didExpire = await expireOrder(current.id);
    if (!didExpire) {
      return Response.json({ error: "订单状态已改变,请刷新后重试" }, { status: 409 });
    }
    await audit(admin.id, "order_cancel_pending", current.outTradeNo);
    return Response.json({ ok: true, result: "cancelled", message: "已取消并回补库存" });
  }

  const reserved = await reserveRefund(id);
  if (!reserved.ok) {
    return Response.json({ error: reserved.error }, { status: reserved.status });
  }
  const order = reserved.order;
  const refund = await ldcRefund(order.tradeNo!, Number(order.amount));

  if (!refund.ok) {
    if (refund.uncertain) {
      await audit(admin.id, "order_refund_unknown", order.outTradeNo, {
        msg: refund.msg,
      });
      return Response.json(
        {
          error:
            "LDC 退款结果不确定,订单保持退款处理中且权益已预留,请先核对 LDC 后再人工处理",
        },
        { status: 502 },
      );
    }
    try {
      const restored = await restoreFailedRefund(order.id);
      if (!restored) throw new Error("refund compensation state mismatch");
    } catch (err) {
      console.error("[refund] compensation failed", order.outTradeNo, err);
      await audit(admin.id, "order_refund_compensation_failed", order.outTradeNo, {
        msg: refund.msg,
      });
      return Response.json(
        { error: "LDC 退款失败且本地权益恢复失败,订单保持退款处理中,请人工检查" },
        { status: 500 },
      );
    }
    await audit(admin.id, "order_refund_failed", order.outTradeNo, {
      msg: refund.msg,
    });
    return Response.json({ error: `LDC 退款失败:${refund.msg}` }, { status: 502 });
  }

  const finalized = await finalizeRefund(order.id);
  if (!finalized) {
    console.error("[refund] finalize state mismatch", order.outTradeNo);
    return Response.json(
      { error: "LDC 已退款,但本地订单确认失败,请人工检查" },
      { status: 500 },
    );
  }

  await audit(admin.id, "order_refund", order.outTradeNo, {
    tradeNo: order.tradeNo,
    amount: order.amount,
    msg: refund.msg,
  });
  return Response.json({ ok: true, result: "refunded", message: "已退款并回滚发货" });
}
