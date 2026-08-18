import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { DEFAULT_SETTINGS, saveSetting, type SettingsKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  activation_price: z.number().int().min(1).max(100_000).optional(),
  activation_days: z.number().int().min(1).max(365).optional(),
  price_per_update: z.number().int().min(1).max(100_000).optional(),
  trust_level_min: z.number().int().min(0).max(4).optional(),
  expected_node_count: z.number().int().min(1).max(500).optional(),
  max_credits_per_order: z.number().int().min(1).max(365).optional(),
  admin_usernames: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(20)
    .optional(),
  auto_ban_fp_threshold: z.number().int().min(2).max(50).optional(),
  code_stock: z.number().int().min(0).max(100_000).optional(),
});

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "参数错误" },
      { status: 400 },
    );
  }

  const keys = Object.keys(parsed.data) as SettingsKey[];
  for (const key of keys) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    let value: unknown = parsed.data[key as keyof typeof parsed.data];
    if (key === "admin_usernames" && Array.isArray(value)) {
      value = (value as string[]).map((v) => v.trim()).filter(Boolean);
    }
    await saveSetting(key, value);
  }

  await audit(admin.id, "settings_change", keys.join(","), parsed.data);
  return Response.json({ ok: true });
}
