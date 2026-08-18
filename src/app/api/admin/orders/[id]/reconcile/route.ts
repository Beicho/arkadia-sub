import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { expireOrder, markOrderPaid } from "@/lib/payment-core";
import { reconcileOrder } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

const bodySchema = {
  parse: (b: unknown): b is { forceExpire?: boolean } =>
    typeof b === "object" && b !== null,
};

/** 管理端手动对账;forceExpire 直接把 pending 订单标记过期(回补库存) */
export async function POST(
  req: Request,
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
  if (order.status !== "pending") {
    return Response.json({ error: `订单状态为 ${order.status},无需对账` }, { status: 422 });
  }

  let forceExpire = false;
  try {
    const body = await req.json();
    if (bodySchema.parse(body)) forceExpire = body.forceExpire === true;
  } catch {
    // 空请求体:普通对账
  }

  if (forceExpire) {
    await expireOrder(order.id);
    await audit(admin.id, "order_force_expire", order.outTradeNo);
    return Response.json({ ok: true, result: "expired" });
  }

  const result = await reconcileOrder(order.outTradeNo);
  if (result === "still_pending") {
    return Response.json(
      { error: "LDC 侧仍未支付;确认放弃可强制过期(回补库存)" },
      { status: 422 },
    );
  }
  await audit(admin.id, "order_reconcile", order.outTradeNo, { result });
  return Response.json({ ok: true, result });
}
