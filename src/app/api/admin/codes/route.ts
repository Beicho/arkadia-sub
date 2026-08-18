import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { redeemCodes } from "@/db/schema";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { generateRedeemCode } from "@/lib/redeem-code";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  kind: z.literal("gift"),
  count: z.number().int().min(1).max(100).optional(),
});

/** 手工建 gift 注册码(补偿/赠送,不占库存) */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = { kind: "gift" };
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "参数错误" }, { status: 400 });

  const count = parsed.data.count ?? 1;
  const created: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = generateRedeemCode();
    await db.insert(redeemCodes).values({
      code,
      kind: "gift",
      status: "issued",
      revealed: true, // gift 码无需支付即可兑换展示
      createdBy: admin.id,
    });
    created.push(code);
  }

  await audit(admin.id, "code_gift", `count=${count}`, { count, codes: created });
  return Response.json({ ok: true, codes: created });
}

/** 导出全部未使用 gift 码(txt 纯文本,一行一个) */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });
  const rows = await db
    .select({ code: redeemCodes.code })
    .from(redeemCodes)
    .where(eq(redeemCodes.status, "issued"));
  const body =
    rows.length === 0
      ? "(没有未使用的注册码)"
      : rows.map((r) => r.code).join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="arkadia-codes.txt"',
    },
  });
}

const patchSchema = z.object({
  id: z.number().int().positive(),
  action: z.literal("void"),
});

/** 作废未使用的注册码 */
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

  const [code] = await db
    .select()
    .from(redeemCodes)
    .where(eq(redeemCodes.id, parsed.data.id))
    .limit(1);
  if (!code) return Response.json({ error: "注册码不存在" }, { status: 404 });
  if (code.status === "redeemed") {
    return Response.json({ error: "该码已被兑换,无法作废" }, { status: 422 });
  }

  await db
    .update(redeemCodes)
    .set({ status: "void" })
    .where(eq(redeemCodes.id, code.id));
  await audit(admin.id, "code_void", code.code);

  return Response.json({ ok: true });
}
