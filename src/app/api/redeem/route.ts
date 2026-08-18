import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { redeemCodeForUser } from "@/lib/payment-core";
import { normalizeCode } from "@/lib/redeem-code";
import { getSettings } from "@/lib/settings";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ code: z.string().min(8).max(64) });

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`redeem:${ip}`, 10, 60_000);
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
  if (!parsed.success) return Response.json({ error: "注册码格式错误" }, { status: 400 });

  const code = normalizeCode(parsed.data.code);
  const s = await getSettings();
  const result = await redeemCodeForUser(user.id, code, s.activation_days);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  await audit(user.id, "redeem_code", code);
  return Response.json({ ok: true, paidUntil: result.paidUntil });
}
