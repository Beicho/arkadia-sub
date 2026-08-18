import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { createRenewalOrder } from "@/lib/orders";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  days: z.number().int(),
  acceptNoRefund: z.boolean().optional(),
});

/** 登录用户续费下单 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`order-renew:${ip}`, 5, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);

  const user = await requireActiveUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "参数错误" }, { status: 400 });
  }

  const result = await createRenewalOrder(
    user.id,
    parsed.data.days,
    parsed.data.acceptNoRefund === true,
    ip,
  );
  if (!result.ok) {
    return Response.json(
      { error: result.error, needNoRefund: result.needNoRefund ?? false },
      { status: 422 },
    );
  }
  return Response.json({
    outTradeNo: result.outTradeNo,
    amount: result.amount,
    payUrl: `/pay/${result.outTradeNo}`,
  });
}
