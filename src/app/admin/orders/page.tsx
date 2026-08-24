import { and, desc, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import OrderActions from "@/components/admin/OrderActions";
import StatusChip from "@/components/admin/StatusChip";

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
const TYPE_TEXT: Record<string, string> = {
  activation: "注册码",
  renewal: "更新额度",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const type = typeof sp.type === "string" ? sp.type : "";
  const status = typeof sp.status === "string" ? sp.status : "";

  const conds: SQL[] = [];
  if (type === "activation" || type === "renewal") {
    conds.push(eq(orders.orderType, type));
  }
  if (
    status === "paid" ||
    status === "pending" ||
    status === "refund_pending" ||
    status === "expired" ||
    status === "refunded"
  ) {
    conds.push(eq(orders.status, status));
  }

  const rows = await db
    .select({
      id: orders.id,
      outTradeNo: orders.outTradeNo,
      orderType: orders.orderType,
      quantity: orders.quantity,
      amount: orders.amount,
      status: orders.status,
      createdAt: orders.createdAt,
      paidAt: orders.paidAt,
      username: users.username,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(100);

  const FILTERS = [
    { label: "全部", href: "/admin/orders", q: "" },
    { label: "待支付", href: "/admin/orders?status=pending", q: "status=pending" },
    { label: "已支付", href: "/admin/orders?status=paid", q: "status=paid" },
    {
      label: "退款中",
      href: "/admin/orders?status=refund_pending",
      q: "status=refund_pending",
    },
    { label: "已退款", href: "/admin/orders?status=refunded", q: "status=refunded" },
    { label: "注册码单", href: "/admin/orders?type=activation", q: "type=activation" },
    { label: "额度单", href: "/admin/orders?type=renewal", q: "type=renewal" },
  ];
  const activeQ =
    [status && `status=${status}`, type && `type=${type}`].filter(Boolean).join("&");

  const fmt = (d: Date | null) =>
    d
      ? new Date(d).toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="ark-h2 ark-display text-xl font-bold">订单</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
          待支付可对账/取消回补;已支付可退款取消(走 LDC 退款,自动回滚发货)。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = f.q === activeQ;
          return (
            <Link
              key={f.href}
              href={f.href}
              className="ark-chip no-underline"
              style={
                active
                  ? {
                      color: "var(--ark-accent)",
                      borderColor: "color-mix(in srgb, var(--ark-accent) 42%, transparent)",
                      background: "color-mix(in srgb, var(--ark-accent) 10%, transparent)",
                    }
                  : undefined
              }
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <AdminTable
        head={["单号", "类型", "买家", "金额", "状态", "创建", "支付", "操作"]}
        rows={rows.map((o) => [
          <span key="no" className="ark-mono text-xs">
            {o.outTradeNo}
          </span>,
          `${TYPE_TEXT[o.orderType] ?? o.orderType} ×${o.quantity}`,
          o.username ?? "(游客)",
          <span key="am" className="ark-mono">
            {Number(o.amount).toFixed(0)} LDC
          </span>,
          <StatusChip key="st" tone={STATUS_TONE[o.status] ?? "neutral"}>
            {STATUS_TEXT[o.status] ?? o.status}
          </StatusChip>,
          fmt(o.createdAt),
          fmt(o.paidAt),
          <OrderActions key="op" id={o.id} status={o.status} />,
        ])}
      />
    </div>
  );
}
