import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes, users } from "@/db/schema";
import { generateOutTradeNo, generateRedeemCode } from "@/lib/redeem-code";
import { consumeStock, getSettings } from "@/lib/settings";

export const DAY_MS = 86_400_000;

/**
 * 游客购买注册码(库存制):
 * 1. 原子扣库存(防超卖)
 * 2. 生成注册码(未 reveal)+ pending 订单
 */
export async function createActivationOrder(
  ip: string,
): Promise<
  | { ok: true; outTradeNo: string; amount: number; days: number }
  | { ok: false; error: string }
> {
  const s = await getSettings();
  return db.transaction(async (tx) => {
    const ok = await consumeStock(tx);
    if (!ok) return { ok: false as const, error: "暂无库存,请等待补货" };

    const outTradeNo = generateOutTradeNo();
    const code = generateRedeemCode();

    const [codeRow] = await tx
      .insert(redeemCodes)
      .values({ code, kind: "register", status: "issued", revealed: false })
      .returning({ id: redeemCodes.id });

    await tx.insert(orders).values({
      outTradeNo,
      orderType: "activation",
      userId: null,
      days: s.activation_days,
      amount: s.activation_price.toFixed(2),
      codeId: codeRow.id,
      status: "pending",
      buyerIp: ip,
    });

    return {
      ok: true as const,
      outTradeNo,
      amount: s.activation_price,
      days: s.activation_days,
    };
  });
}

/**
 * 登录用户续费:天数 1..max_days_per_order,金额服务端计算。
 * 要求已激活 + 已勾选不退款(一次记录终身)。
 */
export async function createRenewalOrder(
  userId: number,
  days: number,
  acceptNoRefund: boolean,
  ip: string,
): Promise<
  | { ok: true; outTradeNo: string; amount: number }
  | { ok: false; error: string; needNoRefund?: boolean }
> {
  const s = await getSettings();
  if (!Number.isInteger(days) || days < 1 || days > s.max_days_per_order) {
    return {
      ok: false,
      error: `天数需在 1 ~ ${s.max_days_per_order} 之间`,
    };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, error: "用户不存在" };
  if (user.status === "banned") return { ok: false, error: "账号已被封禁" };
  if (!user.activated) return { ok: false, error: "请先兑换注册码激活账号" };

  if (!user.noRefundAcceptedAt && !acceptNoRefund) {
    return {
      ok: false,
      error: "请先阅读并同意不退款条款",
      needNoRefund: true,
    };
  }

  if (!user.noRefundAcceptedAt) {
    await db
      .update(users)
      .set({ noRefundAcceptedAt: new Date() })
      .where(eq(users.id, userId));
  }

  const amount = days * s.price_per_day;
  const outTradeNo = generateOutTradeNo();
  await db.insert(orders).values({
    outTradeNo,
    orderType: "renewal",
    userId,
    days,
    amount: amount.toFixed(2),
    status: "pending",
    buyerIp: ip,
  });

  return { ok: true, outTradeNo, amount };
}
