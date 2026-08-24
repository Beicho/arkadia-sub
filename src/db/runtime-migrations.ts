import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * 镜像轮询部署不会自动执行 migrate 容器，因此启动时只补本版本必需的兼容 DDL。
 * 所有语句均幂等；完整的新环境仍由 drizzle-kit push 创建结构。
 */
export async function runRuntimeMigrations(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE "socks_pool" ADD COLUMN IF NOT EXISTS "username" text NOT NULL DEFAULT ''`,
  );
  await db.execute(
    sql`ALTER TABLE "socks_pool" ADD COLUMN IF NOT EXISTS "password" text NOT NULL DEFAULT ''`,
  );
  await db.execute(sql`DROP INDEX IF EXISTS "socks_pool_host_port_uq"`);
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "socks_pool_identity_uq" ON "socks_pool" ("protocol", "host", "port", "username", "password")`,
  );
}
