import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { redeemCodes, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import { GiftCodeButton, VoidCodeButton } from "@/components/admin/CodesActions";
import StockPanel from "@/components/admin/StockPanel";
import { Badge } from "@cloudflare/kumo/components/badge";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, "success" | "warning" | "secondary"> = {
  issued: "warning",
  redeemed: "success",
  void: "secondary",
};
const STATUS_TEXT: Record<string, string> = {
  issued: "未使用",
  redeemed: "已兑换",
  void: "已作废",
};

export default async function AdminCodesPage() {
  const [s, codes] = await Promise.all([
    (await import("@/lib/settings")).getSettings(),
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

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">注册码 / 库存</h1>

      <StockPanel stock={s.code_stock} />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">发码记录(最近 200)</h2>
          <GiftCodeButton />
        </div>
        {codes.length === 0 ? (
          <p className="text-sm text-neutral-500">还没有发过码。</p>
        ) : (
          <AdminTable
            head={["注册码", "类型", "状态", "已对用户可见", "兑换人", "兑换时间", "创建时间", "操作"]}
            rows={codes.map((c) => [
              <span key="c" className="font-mono text-xs">
                {c.code}
              </span>,
              c.kind === "gift" ? "gift" : "售卖",
              <Badge key="s" variant={STATUS_BADGE[c.status] ?? "secondary"}>
                {STATUS_TEXT[c.status] ?? c.status}
              </Badge>,
              c.revealed ? "是" : "否",
              c.username ?? "—",
              c.redeemedAt
                ? new Date(c.redeemedAt).toLocaleDateString("zh-CN")
                : "—",
              new Date(c.createdAt).toLocaleDateString("zh-CN"),
              c.status === "issued" ? (
                <VoidCodeButton key="op" id={c.id} />
              ) : (
                "—"
              ),
            ])}
          />
        )}
      </section>
    </div>
  );
}
