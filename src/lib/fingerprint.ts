import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deviceFingerprints, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";

/**
 * 记录设备指纹;同一指纹绑定 ≥ auto_ban_fp_threshold 个不同账号时,
 * 自动封禁该簇全部非管理员账号(一人多号)。
 * 返回被自动封禁的用户 id 列表。
 */
export async function recordFingerprint(
  userId: number,
  fpHash: string,
  ip: string,
  ua: string,
): Promise<number[]> {
  await db
    .insert(deviceFingerprints)
    .values({ userId, fpHash, ip, ua })
    .onConflictDoUpdate({
      target: [deviceFingerprints.userId, deviceFingerprints.fpHash],
      set: { lastSeenAt: new Date(), ip, ua },
    });

  const cluster = await db
    .select({ userId: deviceFingerprints.userId })
    .from(deviceFingerprints)
    .where(eq(deviceFingerprints.fpHash, fpHash));

  const s = await getSettings();
  const userIds = [...new Set(cluster.map((c) => c.userId))];
  if (userIds.length < s.auto_ban_fp_threshold) return [];

  // 管理员豁免
  const rows = await db.select().from(users);
  const banned: number[] = [];
  for (const u of rows) {
    if (!userIds.includes(u.id)) continue;
    if (u.role === "admin") continue;
    if (u.status === "banned") continue;
    await db
      .update(users)
      .set({
        status: "banned",
        banReason: `风控:同一设备指纹关联 ${userIds.length} 个账号(自动封禁,可申诉)`,
      })
      .where(eq(users.id, u.id));
    banned.push(u.id);
  }

  if (banned.length > 0) {
    await audit(null, "auto_ban_fingerprint", `fp:${fpHash}`, {
      fpHash,
      clusterSize: userIds.length,
      banned,
    });
  }
  return banned;
}

/** 风控页:指纹簇(≥2 个账号) */
export async function fingerprintClusters() {
  const rows = await db
    .select({
      userId: deviceFingerprints.userId,
      username: users.username,
      fpHash: deviceFingerprints.fpHash,
      status: users.status,
      lastSeenAt: deviceFingerprints.lastSeenAt,
    })
    .from(deviceFingerprints)
    .innerJoin(users, eq(users.id, deviceFingerprints.userId));

  const map = new Map<
    string,
    { fpHash: string; users: { id: number; username: string; status: string }[]; lastSeenAt: Date }
  >();
  for (const r of rows) {
    const entry = map.get(r.fpHash) ?? {
      fpHash: r.fpHash,
      users: [],
      lastSeenAt: r.lastSeenAt,
    };
    entry.users.push({ id: r.userId, username: r.username, status: r.status });
    if (r.lastSeenAt > entry.lastSeenAt) entry.lastSeenAt = r.lastSeenAt;
    map.set(r.fpHash, entry);
  }
  return [...map.values()]
    .filter((c) => new Set(c.users.map((u) => u.id)).size >= 2)
    .sort((a, b) => b.users.length - a.users.length);
}
