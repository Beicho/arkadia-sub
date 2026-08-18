import crypto from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["ban", "unban", "add_days", "reset_token", "activate", "deactivate"]),
  reason: z.string().max(300).optional(),
  days: z.number().int().min(-365).max(365).optional(),
});

export async function PATCH(
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return Response.json({ error: "用户不存在" }, { status: 404 });

  const { action, reason, days } = parsed.data;

  switch (action) {
    case "ban": {
      if (user.role === "admin") {
        return Response.json({ error: "不能封禁管理员" }, { status: 422 });
      }
      await db
        .update(users)
        .set({ status: "banned", banReason: reason ?? "管理员封禁(未填原因)" })
        .where(eq(users.id, id));
      await audit(admin.id, "user_ban", user.username, { reason: reason ?? null });
      break;
    }
    case "unban": {
      await db
        .update(users)
        .set({ status: "active", banReason: null })
        .where(eq(users.id, id));
      await audit(admin.id, "user_unban", user.username);
      break;
    }
    case "add_days": {
      if (!days || days === 0) {
        return Response.json({ error: "天数不能为 0" }, { status: 400 });
      }
      const base =
        user.paidUntil && user.paidUntil.getTime() > Date.now() ? user.paidUntil : new Date();
      await db
        .update(users)
        .set({ paidUntil: new Date(base.getTime() + days * 86_400_000) })
        .where(eq(users.id, id));
      await audit(admin.id, "user_add_days", user.username, { days });
      break;
    }
    case "reset_token": {
      await db
        .update(users)
        .set({ subToken: crypto.randomUUID() })
        .where(eq(users.id, id));
      await audit(admin.id, "user_reset_token", user.username);
      break;
    }
    case "activate": {
      await db
        .update(users)
        .set({ activated: true })
        .where(eq(users.id, id));
      await audit(admin.id, "user_force_activate", user.username);
      break;
    }
    case "deactivate": {
      await db
        .update(users)
        .set({ activated: false })
        .where(eq(users.id, id));
      await audit(admin.id, "user_force_deactivate", user.username);
      break;
    }
  }

  return Response.json({ ok: true });
}
