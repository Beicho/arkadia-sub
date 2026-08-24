import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { orders, redeemCodes } from "@/db/schema";
import { normalizeCode } from "@/lib/redeem-code";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  query: z.string().min(6).max(64),
});

/**
 * 找回注册码:输入订单号(或注册码本身)。
 * 只有订单已支付且码已 reveal 才返回。凭单号持有即视为买家。
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`lookup:${ip}`, 10, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "请输入订单号" }, { status: 400 });

  const query = parsed.data.query.trim();

  // 直接输注册码:返回其状态
  const codeNormalized = normalizeCode(query);
  if (codeNormalized.startsWith("ARK-")) {
    const [c] = await db
      .select()
      .from(redeemCodes)
      .where(eq(redeemCodes.code, codeNormalized))
      .limit(1);
    if (c) {
      return Response.json({
        code: c.revealed ? c.code : null,
        status: c.status,
        message: c.revealed ? null : "该注册码对应订单尚未支付",
      });
    }
    return Response.json({ error: "未找到该注册码" }, { status: 404 });
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.outTradeNo, query))
    .limit(1);
  if (!order) return Response.json({ error: "未找到该订单" }, { status: 404 });
  if (order.orderType !== "activation" || !order.codeId) {
    return Response.json({ error: "该订单不是注册码订单" }, { status: 422 });
  }
  if (order.status !== "paid") {
    const statusText =
      order.status === "pending"
        ? "待支付"
        : order.status === "refund_pending"
          ? "退款处理中"
          : order.status === "refunded"
            ? "已退款"
            : "已过期";
    return Response.json(
      { error: `订单状态:${statusText}` },
      { status: 422 },
    );
  }

  const [c] = await db
    .select()
    .from(redeemCodes)
    .where(eq(redeemCodes.id, order.codeId))
    .limit(1);
  if (!c || !c.revealed) {
    return Response.json({ error: "注册码尚未生成,请联系站长" }, { status: 422 });
  }
  return Response.json({ code: c.code, status: c.status });
}
