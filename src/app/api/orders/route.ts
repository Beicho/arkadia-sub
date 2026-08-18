import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { createCreditOrder } from "@/lib/orders";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  credits: z.number().int(),
  acceptNoRefund: z.boolean().optional(),
});

/** 登录用户购买更新额度下单 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`order-credit:${ip}`, 5, 60_000);
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

  const result = await createCreditOrder(
    user.id,
    parsed.data.credits,
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
    credits: result.credits,
    payUrl: `/pay/${result.outTradeNo}`,
  });
}
