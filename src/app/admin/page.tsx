import { and, count, desc, eq, gt, gte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, subPulls, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import StatCards from "@/components/admin/StatCards";
import { Badge } from "@/components/kumo";
import { getSettings } from "@/lib/settings";
import { shanghaiDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, "success" | "warning" | "secondary"> = {
  paid: "success",
  pending: "warning",
  expired: "secondary",
};

export default async function AdminOverview() {
  const dayStart = shanghaiDayStart();

  const [
    s,
    todayOrdersRow,
    todayIncomeRow,
    activeSubsRow,
    todayPullsRow,
    pendingRow,
    recent,
  ] = await Promise.all([
    getSettings(),
    db
      .select({ c: count() })
      .from(orders)
      .where(and(eq(orders.status, "paid"), gte(orders.paidAt, dayStart))),
    db
      .select({ sum: sql<string>`coalesce(sum(${orders.amount}),0)` })
      .from(orders)
      .where(and(eq(orders.status, "paid"), gte(orders.paidAt, dayStart))),
    db
      .select({ c: count() })
      .from(users)
      .where(
        and(
          eq(users.activated, true),
          or(gte(users.paidUntil, new Date()), gt(users.updateCredits, 0)),
        ),
      ),
    db
      .select({ c: count() })
      .from(subPulls)
      .where(gte(subPulls.createdAt, dayStart)),
    db.select({ c: count() }).from(orders).where(eq(orders.status, "pending")),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(10),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">总览</h1>

      <StatCards
        items={[
          { label: "今日成交", value: String(todayOrdersRow[0]?.c ?? 0) },
          {
            label: "今日收入",
            value: `${Number(todayIncomeRow[0]?.sum ?? 0).toFixed(0)} LDC`,
          },
          { label: "有效订阅", value: String(activeSubsRow[0]?.c ?? 0) },
          { label: "今日拉取", value: String(todayPullsRow[0]?.c ?? 0) },
          { label: "待支付订单", value: String(pendingRow[0]?.c ?? 0) },
          { label: "注册码库存", value: String(s.code_stock) },
        ]}
      />

      <section>
        <h2 className="mb-3 font-semibold">最近订单</h2>
        <AdminTable
          head={["单号", "类型", "金额", "状态", "时间"]}
          rows={recent.map((o) => [
            <span key="no" className="font-mono text-xs">
              {o.outTradeNo}
            </span>,
            o.orderType === "activation" ? "注册码" : `额度×${o.quantity}`,
            `${Number(o.amount).toFixed(0)} LDC`,
            <Badge
              key="st"
              variant={STATUS_BADGE[o.status] ?? "secondary"}
            >
              {o.status}
            </Badge>,
            new Date(o.createdAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
          ])}
        />
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">还没有订单。</p>
        ) : null}
      </section>
    </div>
  );
}
