import crypto from "node:crypto";
import { requireActiveUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** 用户自助重置订阅 token(旧链接立即作废,防分发) */
export async function POST() {
  const user = await requireActiveUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });

  const newToken = crypto.randomUUID();
  await db
    .update(users)
    .set({ subToken: newToken })
    .where(eq(users.id, user.id));

  await audit(user.id, "self_reset_token", user.username);
  return Response.json({ ok: true, subToken: newToken });
}
