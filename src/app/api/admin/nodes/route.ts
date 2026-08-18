import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { normalizeNodeInput } from "@/lib/nodes";
import { getSettings } from "@/lib/settings";
import { shanghaiToday } from "@/lib/time";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().max(120).optional(),
  text: z.string().min(1).max(1_000_000),
  batchDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  force: z.boolean().optional(),
});

/** 新建节点批次(一行一个节点;支持整段 base64 自动解码) */
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
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const nodes = normalizeNodeInput(parsed.data.text);
  if (nodes.length === 0) {
    return Response.json(
      { error: "未解析到有效节点(需一行一个 xxx:// 开头)" },
      { status: 422 },
    );
  }

  const s = await getSettings();
  if (nodes.length !== s.expected_node_count && !parsed.data.force) {
    return Response.json(
      {
        error: `解析到 ${nodes.length} 个节点,与期望的 ${s.expected_node_count} 个不一致;确认无误请勾选"强制上传"`,
        needForce: true,
        count: nodes.length,
      },
      { status: 422 },
    );
  }

  const batchDate = parsed.data.batchDate ?? shanghaiToday();
  const [created] = await db
    .insert(nodeBatches)
    .values({
      title: parsed.data.title?.trim() || `批次 ${batchDate}`,
      nodes,
      batchDate,
      nodeCount: nodes.length,
      isActive: false,
      createdBy: admin.id,
    })
    .returning({ id: nodeBatches.id });

  await audit(admin.id, "batch_create", `batch:${created.id}`, {
    batchDate,
    count: nodes.length,
  });
  return Response.json({ ok: true, id: created.id, count: nodes.length });
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  action: z.enum(["activate", "deactivate"]),
});

/** 激活/停用批次(激活最新一批即"当天节点") */
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
  const [batch] = await db.select().from(nodeBatches).where(eq(nodeBatches.id, id)).limit(1);
  if (!batch) return Response.json({ error: "批次不存在" }, { status: 404 });

  await db.transaction(async (tx) => {
    if (action === "activate") {
      // 同一时间只激活一批
      await tx
        .update(nodeBatches)
        .set({ isActive: false })
        .where(eq(nodeBatches.isActive, true));
      await tx.update(nodeBatches).set({ isActive: true }).where(eq(nodeBatches.id, id));
    } else {
      await tx.update(nodeBatches).set({ isActive: false }).where(eq(nodeBatches.id, id));
    }
  });

  await audit(admin.id, `batch_${action}`, `batch:${id}`);
  return Response.json({ ok: true });
}
