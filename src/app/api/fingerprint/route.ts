import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { recordFingerprint } from "@/lib/fingerprint";
import { clientIp, rateLimit, tooMany } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fp: z.string().regex(/^[a-f0-9]{16,64}$/),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  const rl = rateLimit(`fp:${ip}`, 30, 60_000);
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
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const banned = await recordFingerprint(
    user.id,
    parsed.data.fp,
    ip,
    req.headers.get("user-agent")?.slice(0, 300) ?? "",
  );

  return Response.json({ ok: true, banned: banned.length > 0 }, { status: banned.length ? 403 : 200 });
}
