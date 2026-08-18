import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, type User } from "@/db/schema";
import { getSession } from "@/lib/session";

/** 会话 → 数据库里的最新用户状态(不信 JWT 里的旧角色) */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.uid))
    .limit(1);
  if (!user) return null;
  return user;
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role !== "admin") return null;
  if (user.status === "banned") return null;
  return user;
}

export async function requireActiveUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.status === "banned") return null;
  return user;
}
