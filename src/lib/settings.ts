import { eq, sql } from "drizzle-orm";
import { db, type DbTx } from "@/db/client";
import { settings } from "@/db/schema";
import type { RoutingMode } from "./rules";

export const DEFAULT_SETTINGS = {
  activation_price: 100,
  activation_days: 5,
  price_per_update: 3,
  trust_level_min: 1,
  expected_node_count: 30,
  max_credits_per_order: 30,
  admin_usernames: ["devadmin"],
  auto_ban_fp_threshold: 3,
  code_stock: 100,
  /** 订阅分流:rules = 按规则分流,global = 全量走代理(出问题时一键回退) */
  routing_mode: "rules" as RoutingMode,
};

export type SettingsKey = keyof typeof DEFAULT_SETTINGS;
export type SettingsMap = {
  [K in SettingsKey]: (typeof DEFAULT_SETTINGS)[K];
};

const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];

/** 幂等播种默认设置行(on conflict do nothing),保证 consumeStock 等 UPDATE 有行可改 */
export async function ensureDefaultsSeeded(tx?: DbTx): Promise<void> {
  const runner = tx ?? db;
  for (const key of SETTING_KEYS) {
    await runner
      .insert(settings)
      .values({ key, value: DEFAULT_SETTINGS[key] as never })
      .onConflictDoNothing();
  }
}

export async function getSettings(): Promise<SettingsMap> {
  const map: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  let rows: { key: string; value: unknown }[] = [];
  try {
    rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings);
  } catch {
    // 数据库尚未初始化时退回默认值(如构建期误触)
    return map as SettingsMap;
  }
  for (const row of rows) {
    if (SETTING_KEYS.includes(row.key as SettingsKey) && row.value != null) {
      map[row.key] = row.value;
    }
  }
  return map as SettingsMap;
}

export async function saveSetting(key: SettingsKey, value: unknown) {
  await db
    .insert(settings)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as never },
    });
}

export async function getSetting(key: SettingsKey) {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.value;
}

/**
 * 原子扣减一个库存(防超卖)。返回 false 表示库存不足。
 * jsonb 数字操作:`(value #>> '{}')::int` 取出数字,减 1 后写回。
 */
export async function consumeStock(tx: DbTx): Promise<boolean> {
  const res = await tx.execute(
    sql`UPDATE settings SET value = to_jsonb(((value #>> '{}')::int - 1)) WHERE key = 'code_stock' AND (value #>> '{}')::int > 0`,
  );
  const affected = Number(
    (res as { count?: number; rowCount?: number }).count ??
      (res as { rowCount?: number }).rowCount ??
      0,
  );
  return affected === 1;
}

/** 库存 +n(过期回补 / 后台加库存) */
export async function addStock(tx: DbTx, n: number): Promise<void> {
  await tx.execute(
    sql`UPDATE settings SET value = to_jsonb(((value #>> '{}')::int + ${n})) WHERE key = 'code_stock'`,
  );
}
