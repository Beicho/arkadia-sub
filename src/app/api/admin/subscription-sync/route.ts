import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import {
  getSubscriptionSyncAdminState,
  runSubscriptionSync,
  saveSubscriptionSyncConfig,
} from "@/lib/subscription-sync";

export const dynamic = "force-dynamic";

const configSchema = z.object({
  sourceUrl: z.string().trim().max(2_048).optional(),
  enabled: z.boolean().optional(),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });
  return Response.json(await getSubscriptionSyncAdminState());
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const parsed = configSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "订阅同步设置格式错误" }, { status: 400 });
  }

  try {
    const config = await saveSubscriptionSyncConfig(parsed.data);
    // 订阅 URL 可能包含访问令牌，审计中只记录开关和配置来源。
    await audit(admin.id, "subscription_sync_config", undefined, {
      enabled: config.enabled,
      source: parsed.data.sourceUrl?.trim() ? "database" : "environment",
    });
    return Response.json({ ok: true, config });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "保存失败" },
      { status: 400 },
    );
  }
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "无权限" }, { status: 403 });

  try {
    const result = await runSubscriptionSync({
      trigger: "manual",
      actorUserId: admin.id,
    });
    if (result.outcome === "busy") {
      return Response.json({ error: "已有同步任务正在运行" }, { status: 409 });
    }
    if (result.outcome !== "created" && result.outcome !== "unchanged") {
      return Response.json({ error: "同步未执行" }, { status: 409 });
    }
    await audit(
      admin.id,
      result.outcome === "created"
        ? "subscription_sync_create"
        : "subscription_sync_unchanged",
      result.batchId ? `batch:${result.batchId}` : undefined,
      {
        upstreamNodes: result.upstreamNodeCount,
        extraNodes: result.extraNodeCount,
        totalNodes: result.totalNodeCount,
      },
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "订阅同步失败" },
      { status: 502 },
    );
  }
}
