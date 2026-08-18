import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import StatusChip from "@/components/admin/StatusChip";
import UserActions from "@/components/admin/UserActions";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(300);

  return (
    <div className="space-y-6">
      <h1 className="ark-display text-xl font-bold">用户</h1>
      <AdminTable
        head={["用户", "信任级", "角色", "状态", "激活", "免费期至", "额度", "最近登录", "操作"]}
        rows={rows.map((u) => [
          <span key="u" className="flex items-center gap-1.5">
            {u.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={u.avatarUrl} alt="" className="h-5 w-5 rounded-full" />
            ) : null}
            {u.username}
          </span>,
          u.trustLevel,
          u.role === "admin" ? <StatusChip key="r" tone="accent">管理员</StatusChip> : "—",
          u.status === "banned" ? (
            <StatusChip key="s" tone="red">封禁</StatusChip>
          ) : (
            <StatusChip key="s" tone="green">正常</StatusChip>
          ),
          u.activated ? "是" : "否",
          u.paidUntil ? formatDate(u.paidUntil) : "—",
          <span key="c" className="ark-mono">
            {u.updateCredits}
          </span>,
          u.lastLoginAt ? formatDate(u.lastLoginAt) : "—",
          <UserActions
            key="op"
            id={u.id}
            banned={u.status === "banned"}
            admin={u.role === "admin"}
          />,
        ])}
      />
      {rows.some((u) => u.status === "banned") ? (
        <section className="ark-card p-4 text-sm">
          <div className="mb-2 font-semibold">封禁原因</div>
          <ul className="space-y-1" style={{ color: "var(--ark-muted)" }}>
            {rows
              .filter((u) => u.status === "banned")
              .map((u) => (
                <li key={u.id}>
                  {u.username}:{u.banReason ?? "(未记录)"}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
