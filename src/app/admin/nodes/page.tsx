import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import BatchActivateButton from "@/components/admin/BatchActivateButton";
import BatchForm from "@/components/admin/BatchForm";
import FastBatchFromSocksCard from "@/components/admin/FastBatchFromSocksCard";
import StatusChip from "@/components/admin/StatusChip";
import { getSettings } from "@/lib/settings";
import { formatDate, shanghaiToday } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminNodesPage() {
  const [s, batches] = await Promise.all([
    getSettings(),
    db.select().from(nodeBatches).orderBy(desc(nodeBatches.createdAt)).limit(50),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="ark-h2 ark-display text-xl font-bold">节点批次</h1>

      <FastBatchFromSocksCard />

      <BatchForm expectedCount={s.expected_node_count} today={shanghaiToday()} />

      <section>
        <h2 className="ark-h2 mb-3">
          历史批次(同时只有一个激活;激活即&quot;当前下发批次&quot;)
        </h2>
        <AdminTable
          head={["ID", "日期", "标题", "数量", "状态", "创建时间", "操作"]}
          rows={batches.map((b) => [
            b.id,
            <span key="d" className="ark-mono text-xs">
              {b.batchDate}
            </span>,
            b.title,
            b.nodeCount,
            b.isActive ? (
              <StatusChip key="a" tone="green">已激活</StatusChip>
            ) : (
              <StatusChip key="a">未激活</StatusChip>
            ),
            formatDate(b.createdAt),
            <BatchActivateButton key="op" id={b.id} active={b.isActive} />,
          ])}
        />
      </section>
    </div>
  );
}
