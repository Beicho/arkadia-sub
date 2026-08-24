import { and, count, desc, eq, gt, gte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, subPulls, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import StatCards from "@/components/admin/StatCards";
import StatusChip from "@/components/admin/StatusChip";
import { getSettings } from "@/lib/settings";
import { shanghaiDayStart } from "@/lib/time";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "green" | "amber" | "neutral" | "red"> = {
  paid: "green",
  pending: "amber",
  refund_pending: "amber",
  expired: "neutral",
  refunded: "red",
};
const STATUS_TEXT: Record<string, string> = {
  paid: "已支付",
  pending: "待支付",
  refund_pending: "退款处理中",
  expired: "已过期",
  refunded: "已退款",
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

  const stock = s.code_stock;

  return (
    <div className="space-y-6">
      <h1 className="ark-h2 ark-display text-xl font-bold">总览</h1>

      <StatCards
        items={[
          { label: "今日成交", value: String(todayOrdersRow[0]?.c ?? 0) },
          {
            label: "今日收入",
            value: `${Number(todayIncomeRow[0]?.sum ?? 0).toFixed(0)} LDC`,
            tone: "accent",
          },
          { label: "有效订阅", value: String(activeSubsRow[0]?.c ?? 0), tone: "green" },
          { label: "今日拉取", value: String(todayPullsRow[0]?.c ?? 0) },
          {
            label: "待支付",
            value: String(pendingRow[0]?.c ?? 0),
            tone: (pendingRow[0]?.c ?? 0) > 0 ? "amber" : undefined,
          },
          {
            label: "注册码库存",
            value: String(stock),
            tone: stock > 0 ? "green" : "red",
          },
        ]}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">最近订单</h2>
          <a href="/admin/orders" className="text-sm no-underline" style={{ color: "var(--ark-accent)" }}>
            全部 →
          </a>
        </div>
        <AdminTable
          head={["单号", "类型", "金额", "状态", "时间"]}
          rows={recent.map((o) => [
            <span key="no" className="ark-mono text-xs">
              {o.outTradeNo}
            </span>,
            o.orderType === "activation" ? "注册码" : `额度×${o.quantity}`,
            <span key="am" className="ark-mono">
              {Number(o.amount).toFixed(0)} LDC
            </span>,
            <StatusChip key="st" tone={STATUS_TONE[o.status] ?? "neutral"}>
              {STATUS_TEXT[o.status] ?? o.status}
            </StatusChip>,
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
      </section>
    </div>
  );
}
