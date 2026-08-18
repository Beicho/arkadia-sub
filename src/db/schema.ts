import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  linuxdoId: integer("linuxdo_id").notNull().unique(),
  username: text("username").notNull(),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  trustLevel: integer("trust_level").notNull().default(0),
  // user | admin
  role: text("role").notNull().default("user"),
  // active | banned
  status: text("status").notNull().default("active"),
  banReason: text("ban_reason"),
  activated: boolean("activated").notNull().default(false),
  subToken: text("sub_token").notNull().unique(),
  // 免费更新期截止(注册码赠送)
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  // 更新额度:3 LDC/个,拉新批次扣 1,不随时间过期
  updateCredits: integer("update_credits").notNull().default(0),
  lastPulledBatchId: integer("last_pulled_batch_id"),
  // 最近拉取的批次日期:同日期批次(含站长当天补传)不重复扣额度
  lastPulledBatchDate: date("last_pulled_batch_date", { mode: "string" }),
  // 锁定批次:锁定后订阅只下发已拉取的批次,站长更新不扣费;解锁后刷新即得新批次
  batchLocked: boolean("batch_locked").notNull().default(false),
  noRefundAcceptedAt: timestamp("no_refund_accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

export const redeemCodes = pgTable(
  "redeem_codes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    // register | gift
    kind: text("kind").notNull().default("register"),
    // issued | redeemed | void
    status: text("status").notNull().default("issued"),
    // 订单支付成功前不向用户展示
    revealed: boolean("revealed").notNull().default(false),
    orderId: integer("order_id"),
    redeemedBy: integer("redeemed_by"),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("redeem_codes_status_idx").on(t.status)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    outTradeNo: text("out_trade_no").notNull().unique(),
    // activation | renewal
    orderType: text("order_type").notNull(),
    userId: integer("user_id"),
    // activation:赠送免费天数;renewal:购买更新额度数
    quantity: integer("quantity").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    codeId: integer("code_id"),
    // pending | paid | expired
    status: text("status").notNull().default("pending"),
    tradeNo: text("trade_no"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    notifyRaw: jsonb("notify_raw"),
    buyerIp: text("buyer_ip"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_idx").on(t.userId),
  ],
);

export const nodeBatches = pgTable("node_batches", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  // 原始节点行(保留原始备注,仅管理端可见)
  nodes: jsonb("nodes").$type<string[]>().notNull(),
  batchDate: date("batch_date", { mode: "string" }).notNull(),
  nodeCount: integer("node_count").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const announcements = pgTable(
  "announcements",
  {
    id: serial("id").primaryKey(),
    content: text("content").notNull(),
    // info | warning | alert
    level: text("level").notNull().default("info"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("announcements_active_idx").on(t.isActive, t.createdAt)],
);

export const subPulls = pgTable(
  "sub_pulls",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    batchId: integer("batch_id"),
    ip: text("ip"),
    ua: text("ua"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sub_pulls_user_idx").on(t.userId, t.createdAt),
    index("sub_pulls_created_idx").on(t.createdAt),
  ],
);

export const deviceFingerprints = pgTable(
  "device_fingerprints",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    fpHash: text("fp_hash").notNull(),
    // 随机设备 ID(localStorage 持久化):同浏览器多账号必然相同,
    // 不同设备不可能碰撞;硬件指纹(同型号设备会重复)仅作弱信号展示
    deviceId: text("device_id"),
    ip: text("ip"),
    ua: text("ua"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("device_fp_user_hash_uq").on(t.userId, t.fpHash),
    index("device_fp_hash_idx").on(t.fpHash),
    index("device_fp_devid_idx").on(t.deviceId),
  ],
);

export const socksPool = pgTable(
  "socks_pool",
  {
    id: serial("id").primaryKey(),
    host: text("host").notNull(),
    port: integer("port").notNull(),
    line: text("line").notNull(),
    // ["原生IP","家宽",...] 标签
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    country: text("country"),
    region: text("region"),
    provider: text("provider"),
    riskScore: integer("risk_score"),
    // untested | ok | fail
    status: text("status").notNull().default("untested"),
    latencyMs: integer("latency_ms"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("socks_pool_host_port_uq").on(t.host, t.port),
    index("socks_pool_status_idx").on(t.status),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id"),
    action: text("action").notNull(),
    target: text("target"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
});

export type User = typeof users.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type RedeemCode = typeof redeemCodes.$inferSelect;
export type NodeBatch = typeof nodeBatches.$inferSelect;
