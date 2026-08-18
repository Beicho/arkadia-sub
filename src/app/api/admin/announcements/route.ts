import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { announcements } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  content: z.string().trim().min(1).max(500),
  level: z.enum(["info", "warning", "alert"]).default("info"),
});

/** 发布公告 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "公告内容 1~500 字" }, { status: 400 });
  }

  const [row] = await db
    .insert(announcements)
    .values({
      content: parsed.data.content,
      level: parsed.data.level,
      isActive: true,
      createdBy: admin.id,
    })
    .returning({ id: announcements.id });

  await audit(admin.id, "announcement_create", `id:${row.id}`, {
    level: parsed.data.level,
  });
  return Response.json({ ok: true, id: row.id, message: "公告已发布" });
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["activate", "deactivate", "delete"]),
});

/** 启用/停用/删除 */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const { id, action } = parsed.data;
  const [row] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, id))
    .limit(1);
  if (!row) return Response.json({ error: "公告不存在" }, { status: 404 });

  if (action === "delete") {
    await db.delete(announcements).where(eq(announcements.id, id));
  } else {
    await db
      .update(announcements)
      .set({ isActive: action === "activate" })
      .where(eq(announcements.id, id));
  }
  await audit(admin.id, `announcement_${action}`, `id:${id}`);
  return Response.json({ ok: true });
}

/** 导出全部(管理页备用) */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });
  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(200);
  return Response.json({ rows });
}
