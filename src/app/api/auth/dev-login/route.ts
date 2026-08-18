import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * DEV_FAKE_LOGIN=1 且非 production 时可用:
 * /api/auth/dev-login?username=devadmin&trust_level=3 直接造登录态,
 * 用于没有真实 LinuxDo OAuth 凭据时打通全流程。
 */
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production" || process.env.DEV_FAKE_LOGIN !== "1") {
    return Response.json({ error: "Not Found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const username = (url.searchParams.get("username") ?? "devuser").trim();
  const trustLevel = Number(url.searchParams.get("trust_level") ?? "1");
  const linuxdoId = Number(url.searchParams.get("linuxdo_id") ?? "0") || 900_000 + Math.abs(hashCode(username));

  const s = await getSettings();
  const admins = (s.admin_usernames ?? []).map((u: string) => u.toLowerCase());
  const isAdmin = admins.includes(username.toLowerCase());

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.linuxdoId, linuxdoId))
    .limit(1);

  let uid: number;
  if (existing) {
    uid = existing.id;
    await db
      .update(users)
      .set({ username, trustLevel, role: isAdmin ? "admin" : existing.role, lastLoginAt: new Date() })
      .where(eq(users.id, existing.id));
  } else {
    const [created] = await db
      .insert(users)
      .values({
        linuxdoId,
        username,
        name: `DEV ${username}`,
        trustLevel,
        role: isAdmin ? "admin" : "user",
        subToken: crypto.randomUUID(),
        lastLoginAt: new Date(),
      })
      .returning({ id: users.id });
    uid = created.id;
  }

  await setSessionCookie({ uid, role: isAdmin ? "admin" : "user" });
  return Response.redirect(new URL(isAdmin ? "/admin" : "/dashboard", url.origin), 302);
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}
