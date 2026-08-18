import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireActiveUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ locked: z.boolean() });

/** 用户自助锁定/解锁批次(防客户端自动更新被动扣费) */
export async function POST(req: Request) {
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

  await db
    .update(users)
    .set({ batchLocked: parsed.data.locked })
    .where(eq(users.id, user.id));

  await audit(user.id, parsed.data.locked ? "batch_lock" : "batch_unlock", user.username);

  return Response.json({
    ok: true,
    locked: parsed.data.locked,
    message: parsed.data.locked
      ? "已锁定当前批次:站长更新新批次时,你的客户端刷新不会扣费(仍获得当前批次)。想更新时回来解锁。"
      : "已解锁:下次刷新订阅将获得最新批次(新日期扣 1 次额度)。",
  });
}
