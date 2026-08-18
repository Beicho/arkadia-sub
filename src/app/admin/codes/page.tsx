import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { redeemCodes, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import { ExportCodesButton, GiftCodeButton, VoidCodeButton } from "@/components/admin/CodesActions";
import StatCards from "@/components/admin/StatCards";
import StatusChip from "@/components/admin/StatusChip";
import StockPanel from "@/components/admin/StockPanel";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "amber" | "neutral"> = {
  issued: "amber",
  redeemed: "green",
  void: "neutral",
};
const STATUS_TEXT: Record<string, string> = {
  issued: "未使用",
  redeemed: "已兑换",
  void: "已作废",
};

export default async function AdminCodesPage() {
  const [s, codes] = await Promise.all([
    getSettings(),
    db
      .select({
        id: redeemCodes.id,
        code: redeemCodes.code,
        kind: redeemCodes.kind,
        status: redeemCodes.status,
        revealed: redeemCodes.revealed,
        redeemedAt: redeemCodes.redeemedAt,
        username: users.username,
        createdAt: redeemCodes.createdAt,
      })
      .from(redeemCodes)
      .leftJoin(users, eq(users.id, redeemCodes.redeemedBy))
      .orderBy(desc(redeemCodes.createdAt))
      .limit(200),
  ]);

  const counts = {
    issued: codes.filter((c) => c.status === "issued").length,
    redeemed: codes.filter((c) => c.status === "redeemed").length,
    void: codes.filter((c) => c.status === "void").length,
  };

  return (
    <div className="space-y-6">
      <h1 className="ark-display text-xl font-bold">注册码 / 库存</h1>

      <StatCards
        items={[
          { label: "可售库存", value: String(s.code_stock), tone: s.code_stock > 0 ? "green" : "red" },
          { label: "未使用码(近200)", value: String(counts.issued), tone: "amber" },
          { label: "已兑换(近200)", value: String(counts.redeemed) },
          { label: "已作废(近200)", value: String(counts.void) },
        ]}
      />

      <StockPanel stock={s.code_stock} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">发码记录(最近 200)</h2>
          <div className="flex gap-2">
            <GiftCodeButton />
            <ExportCodesButton />
          </div>
        </div>
        <AdminTable
          head={["注册码", "类型", "状态", "可见", "兑换人", "兑换时间", "创建", "操作"]}
          rows={codes.map((c) => [
            <span key="c" className="ark-mono text-xs">
              {c.code}
            </span>,
            c.kind === "gift" ? "gift" : "售卖",
            <StatusChip key="s" tone={STATUS_TONE[c.status] ?? "neutral"}>
              {STATUS_TEXT[c.status] ?? c.status}
            </StatusChip>,
            c.revealed ? "是" : "否",
            c.username ?? "—",
            c.redeemedAt ? new Date(c.redeemedAt).toLocaleDateString("zh-CN") : "—",
            new Date(c.createdAt).toLocaleDateString("zh-CN"),
            c.status === "issued" ? <VoidCodeButton key="op" id={c.id} /> : "—",
          ])}
        />
      </section>
    </div>
  );
}
