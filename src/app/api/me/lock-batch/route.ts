import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireActiveUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  locked: z.boolean(),
  days: z.number().int().min(1).max(365).optional().nullable(),
});

/** 用户自助锁定/解锁批次(防客户端自动更新被动扣费,支持设置暂停天数) */
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

  const { locked, days } = parsed.data;
  const lockedUntil =
    locked && typeof days === "number" && days > 0
      ? new Date(Date.now() + days * 86_400_000)
      : null;

  await db
    .update(users)
    .set({
      batchLocked: locked,
      batchLockedUntil: lockedUntil,
    })
    .where(eq(users.id, user.id));

  await audit(
    user.id,
    locked ? "batch_lock" : "batch_unlock",
    user.username,
    lockedUntil ? { days, until: lockedUntil.toISOString() } : undefined,
  );

  let message = "";
  if (locked) {
    if (lockedUntil) {
      const untilStr = lockedUntil.toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      message = `已暂停自动拉取新批次至 ${untilStr} (约 ${days} 天)，到期后将自动恢复更新。期间客户端刷新不扣额度。`;
    } else {
      message = "已永久锁定当前批次:站长更新新批次时,你的客户端刷新不会扣费(仍获得当前批次)。想更新时随时解锁。";
    }
  } else {
    message = "已恢复正常更新:下次刷新订阅将获得最新批次(新日期扣 1 次额度)。";
  }

  return Response.json({
    ok: true,
    locked,
    lockedUntil: lockedUntil?.toISOString() ?? null,
    message,
  });
}
