import { and, desc, eq, type SQL } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import ReconcileButton from "@/components/admin/ReconcileButton";
import { Badge } from "@/components/kumo";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, "success" | "warning" | "secondary"> = {
  paid: "success",
  pending: "warning",
  expired: "secondary",
};
const TYPE_TEXT: Record<string, string> = {
  activation: "注册码",
  renewal: "续费",
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
  if (status === "paid" || status === "pending" || status === "expired") {
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
    { label: "全部", href: "/admin/orders" },
    { label: "待支付", href: "/admin/orders?status=pending" },
    { label: "已支付", href: "/admin/orders?status=paid" },
    { label: "已过期", href: "/admin/orders?status=expired" },
    { label: "注册码单", href: "/admin/orders?type=activation" },
    { label: "续费单", href: "/admin/orders?type=renewal" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">订单</h1>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="rounded-full border border-neutral-200 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            {f.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">没有符合条件的订单。</p>
      ) : (
        <AdminTable
          head={["单号", "类型", "买家", "金额", "状态", "创建时间", "支付时间", "操作"]}
          rows={rows.map((o) => [
            <span key="no" className="font-mono text-xs">
              {o.outTradeNo}
            </span>,
            `${TYPE_TEXT[o.orderType] ?? o.orderType}${o.orderType === "renewal" ? ` ×${o.quantity}` : ""}`,
            o.username ?? "(游客)",
            `${Number(o.amount).toFixed(0)} LDC`,
            <Badge key="st" variant={STATUS_BADGE[o.status] ?? "secondary"}>
              {o.status}
            </Badge>,
            new Date(o.createdAt).toLocaleString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }),
            o.paidAt
              ? new Date(o.paidAt).toLocaleString("zh-CN", {
                  timeZone: "Asia/Shanghai",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—",
            o.status === "pending" ? (
              <ReconcileButton key="op" id={o.id} />
            ) : (
              "—"
            ),
          ])}
        />
      )}
    </div>
  );
}
