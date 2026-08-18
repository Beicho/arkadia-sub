import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { deviceFingerprints, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";

/**
 * 记录设备指纹与随机设备 ID。
 * 自动封禁只依据随机设备 ID(同浏览器必然相同、不同设备不可能碰撞);
 * 硬件指纹(fpHash)对同型号设备会重复,仅作人工参考,不触发封禁。
 */
export async function recordFingerprint(
  userId: number,
  fpHash: string,
  deviceId: string | null,
  ip: string,
  ua: string,
): Promise<number[]> {
  await db
    .insert(deviceFingerprints)
    .values({ userId, fpHash, deviceId, ip, ua })
    .onConflictDoUpdate({
      target: [deviceFingerprints.userId, deviceFingerprints.fpHash],
      set: { lastSeenAt: new Date(), ip, ua, deviceId },
    });

  if (!deviceId) return [];

  const cluster = await db
    .select({ userId: deviceFingerprints.userId })
    .from(deviceFingerprints)
    .where(eq(deviceFingerprints.deviceId, deviceId));

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
        banReason: `风控:同一浏览器关联 ${userIds.length} 个账号(自动封禁,可申诉)`,
      })
      .where(eq(users.id, u.id));
    banned.push(u.id);
  }

  if (banned.length > 0) {
    await audit(null, "auto_ban_device", `did:${deviceId}`, {
      deviceId,
      clusterSize: userIds.length,
      banned,
    });
  }
  return banned;
}

/** 风控页:随机设备 ID 簇(强信号,触发自动封禁的依据) */
export async function deviceIdClusters() {
  const rows = await db
    .select({
      userId: deviceFingerprints.userId,
      username: users.username,
      deviceId: deviceFingerprints.deviceId,
      status: users.status,
      lastSeenAt: deviceFingerprints.lastSeenAt,
    })
    .from(deviceFingerprints)
    .innerJoin(users, eq(users.id, deviceFingerprints.userId));

  const map = new Map<
    string,
    {
      key: string;
      users: { id: number; username: string; status: string }[];
      lastSeenAt: Date;
    }
  >();
  for (const r of rows) {
    if (!r.deviceId) continue;
    const entry = map.get(r.deviceId) ?? {
      key: r.deviceId,
      users: [],
      lastSeenAt: r.lastSeenAt,
    };
    entry.users.push({ id: r.userId, username: r.username, status: r.status });
    if (r.lastSeenAt > entry.lastSeenAt) entry.lastSeenAt = r.lastSeenAt;
    map.set(r.deviceId, entry);
  }
  return [...map.values()]
    .filter((c) => new Set(c.users.map((u) => u.id)).size >= 2)
    .sort((a, b) => b.users.length - a.users.length);
}

/** 风控页:硬件指纹簇(弱信号,仅供人工参考,可能同型号误重) */
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
