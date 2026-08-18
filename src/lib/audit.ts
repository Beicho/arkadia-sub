import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";

export async function audit(
  actorUserId: number | null,
  action: string,
  target?: string,
  detail?: unknown,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      actorUserId,
      action,
      target: target ?? null,
      detail: (detail ?? null) as never,
    });
  } catch (err) {
    // 审计失败不阻断主流程,但要留下 stderr 痕迹
    console.error("[audit] failed", action, err);
  }
}
