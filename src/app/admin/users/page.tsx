import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import UserActions from "@/components/admin/UserActions";
import { Badge } from "@/components/kumo";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt)).limit(300);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">用户</h1>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">还没有用户登录过。</p>
      ) : (
        <AdminTable
          head={["用户", "信任级", "角色", "状态", "激活", "到期", "最近登录", "操作"]}
          rows={rows.map((u) => [
            <span key="u" className="flex items-center gap-1">
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={u.avatarUrl}
                  alt=""
                  className="h-5 w-5 rounded-full"
                />
              ) : null}
              {u.username}
            </span>,
            u.trustLevel,
            u.role === "admin" ? <Badge key="r" variant="info">管理员</Badge> : "—",
            u.status === "banned" ? (
              <Badge key="s" variant="error" >
                封禁
              </Badge>
            ) : (
              <Badge key="s" variant="success">
                正常
              </Badge>
            ),
            u.activated ? "是" : "否",
            u.paidUntil ? formatDate(u.paidUntil) : "—",
            u.lastLoginAt ? formatDate(u.lastLoginAt) : "—",
            <UserActions
              key="op"
              id={u.id}
              banned={u.status === "banned"}
              admin={u.role === "admin"}
            />,
          ])}
        />
      )}
      {rows.some((u) => u.status === "banned") ? (
        <section className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-700">
          <div className="mb-2 font-semibold">封禁原因</div>
          <ul className="space-y-1 text-neutral-500">
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
