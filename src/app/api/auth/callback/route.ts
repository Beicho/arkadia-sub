import crypto from "node:crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { exchangeCode, fetchUserInfo, appUrl } from "@/lib/linuxdo";
import { getSettings } from "@/lib/settings";
import { setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

function redirect(path: string): Response {
  return Response.redirect(new URL(path, appUrl()), 302);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expected = store.get("arkadia_oauth_state")?.value;
  store.delete("arkadia_oauth_state");

  if (!code || !state || !expected || !timingEqual(state, expected)) {
    return redirect("/denied?reason=state");
  }

  let profile;
  try {
    const token = await exchangeCode(code, appUrl());
    profile = await fetchUserInfo(token);
  } catch (err) {
    console.error("[auth] linuxdo exchange failed", err);
    return redirect("/denied?reason=oauth");
  }

  const s = await getSettings();
  const admins = (s.admin_usernames ?? []).map((u: string) => u.toLowerCase());
  const isAdmin = admins.includes(profile.username.toLowerCase());

  // 信任等级门槛(管理员豁免)
  if (!isAdmin && profile.trust_level < s.trust_level_min) {
    return redirect("/denied?reason=trust");
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.linuxdoId, profile.id))
    .limit(1);

  if (existing) {
    if (existing.status === "banned") {
      return redirect("/denied?reason=banned");
    }
    await db
      .update(users)
      .set({
        username: profile.username,
        name: profile.name ?? null,
        avatarUrl: profile.avatar_url ?? null,
        trustLevel: profile.trust_level,
        role: isAdmin ? "admin" : existing.role,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    if (!isAdmin && existing.role === "admin") {
      // 从管理员名单移除后降级
      await db.update(users).set({ role: "user" }).where(eq(users.id, existing.id));
    }
    await setSessionCookie({ uid: existing.id, role: isAdmin ? "admin" : "user" });
    return redirect(existing.role === "admin" || isAdmin ? "/admin" : "/dashboard");
  }

  const subToken = crypto.randomUUID();
  const [created] = await db
    .insert(users)
    .values({
      linuxdoId: profile.id,
      username: profile.username,
      name: profile.name ?? null,
      avatarUrl: profile.avatar_url ?? null,
      trustLevel: profile.trust_level,
      role: isAdmin ? "admin" : "user",
      subToken,
      lastLoginAt: new Date(),
    })
    .returning({ id: users.id });

  await audit(created.id, "user_register", profile.username, {
    trustLevel: profile.trust_level,
  });
  await setSessionCookie({ uid: created.id, role: isAdmin ? "admin" : "user" });
  return redirect(isAdmin ? "/admin" : "/dashboard");
}

function timingEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
