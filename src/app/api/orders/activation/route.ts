import { createActivationOrder } from "@/lib/orders";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** 游客购买注册码(库存制,原子扣减) */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`order-act:${ip}`, 5, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const result = await createActivationOrder(ip);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 409 });
  }
  return Response.json({
    outTradeNo: result.outTradeNo,
    amount: result.amount,
    days: result.days,
    payUrl: `/pay/${result.outTradeNo}`,
  });
}
