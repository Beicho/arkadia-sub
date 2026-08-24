import { eq, sql } from "drizzle-orm";
import type { DbTx } from "@/db/client";
import { nodeBatches } from "@/db/schema";

// ARKB：所有批次激活/停用入口共用，避免自动同步与后台手动切换交叉提交。
const BATCH_ACTIVATION_LOCK_ID = 0x41524b42;

async function lockBatchActivation(tx: DbTx): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(${BATCH_ACTIVATION_LOCK_ID})`,
  );
}

/** 串行化“停旧 → 启新”，保证任一提交时刻最多只有一个激活批次。 */
export async function activateBatch(tx: DbTx, id: number): Promise<void> {
  await lockBatchActivation(tx);
  await tx
    .update(nodeBatches)
    .set({ isActive: false })
    .where(eq(nodeBatches.isActive, true));
  await tx
    .update(nodeBatches)
    .set({ isActive: true })
    .where(eq(nodeBatches.id, id));
}

/** 停用也进入同一临界区，避免与另一个请求的激活操作互相穿插。 */
export async function deactivateBatch(tx: DbTx, id: number): Promise<void> {
  await lockBatchActivation(tx);
  await tx
    .update(nodeBatches)
    .set({ isActive: false })
    .where(eq(nodeBatches.id, id));
}
