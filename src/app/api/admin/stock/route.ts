import { z } from "zod";
import { db } from "@/db/client";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { addStock } from "@/lib/settings";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  delta: z.number().int().min(-10_000).max(10_000),
  reason: z.string().max(200).optional(),
});

/** 管理端调整注册码库存(正数补货/负数下架) */
export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const { delta, reason } = parsed.data;
  if (delta === 0) return Response.json({ error: "调整量不能为 0" }, { status: 400 });

  await db.transaction(async (tx) => {
    await addStock(tx, delta);
  });
  await audit(admin.id, "stock_change", `delta=${delta}`, { delta, reason: reason ?? null });

  return Response.json({ ok: true });
}
