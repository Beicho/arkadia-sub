import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import StatCards from "@/components/admin/StatCards";
import StatusChip from "@/components/admin/StatusChip";
import UserActions from "@/components/admin/UserActions";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZES = [20, 50, 100] as const;

type SearchParams = { [key: string]: string | string[] | undefined };

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function positiveInt(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function usersHref(
  filters: {
    q: string;
    status: string;
    activation: string;
    role: string;
    pageSize: number;
  },
  page: number,
) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.status) params.set("status", filters.status);
  if (filters.activation) params.set("activation", filters.activation);
  if (filters.role) params.set("role", filters.role);
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    params.set("pageSize", String(filters.pageSize));
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const q = single(sp.q).trim().slice(0, 80);
  const statusParam = single(sp.status);
  const activationParam = single(sp.activation);
  const roleParam = single(sp.role);
  const status = statusParam === "active" || statusParam === "banned" ? statusParam : "";
  const activation =
    activationParam === "activated" || activationParam === "inactive" ? activationParam : "";
  const role = roleParam === "user" || roleParam === "admin" ? roleParam : "";
  const requestedPage = positiveInt(single(sp.page), 1);
  const requestedPageSize = positiveInt(single(sp.pageSize), DEFAULT_PAGE_SIZE);
  const pageSize = PAGE_SIZES.includes(requestedPageSize as (typeof PAGE_SIZES)[number])
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;

  const filters = { q, status, activation, role, pageSize };
  const conds: SQL[] = [];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const numericQuery = Number(q);
    const textMatch = or(ilike(users.username, pattern), ilike(users.name, pattern));
    if (Number.isSafeInteger(numericQuery) && numericQuery > 0) {
      conds.push(
        or(
          textMatch,
          eq(users.id, numericQuery),
          eq(users.linuxdoId, numericQuery),
        )!,
      );
    } else {
      conds.push(textMatch!);
    }
  }
  if (status) conds.push(eq(users.status, status));
  if (activation) conds.push(eq(users.activated, activation === "activated"));
  if (role) conds.push(eq(users.role, role));
  const where = conds.length ? and(...conds) : undefined;

  const [summaryRows, filteredCountRows] = await Promise.all([
    db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${users.status} = 'active')`.mapWith(Number),
        banned: sql<number>`count(*) filter (where ${users.status} = 'banned')`.mapWith(Number),
        activated: sql<number>`count(*) filter (where ${users.activated} = true)`.mapWith(Number),
        credits: sql<number>`coalesce(sum(${users.updateCredits}), 0)`.mapWith(Number),
      })
      .from(users),
    db.select({ total: count() }).from(users).where(where),
  ]);

  const summary = summaryRows[0] ?? {
    total: 0,
    active: 0,
    banned: 0,
    activated: 0,
    credits: 0,
  };
  const filteredTotal = filteredCountRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const page = Math.min(requestedPage, totalPages);

  if (requestedPage !== page) {
    redirect(usersHref(filters, page));
  }

  const rows = await db
    .select()
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const firstItem = filteredTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, filteredTotal);
  const hasFilters = Boolean(q || status || activation || role);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="ark-h2 ark-display text-xl font-bold">用户</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
            查找账号、查看权益状态并执行用户级管理操作。
          </p>
        </div>
        <span className="ark-chip ark-mono self-start md:self-auto">
          {firstItem}–{lastItem} / {filteredTotal}
        </span>
      </header>

      <StatCards
        items={[
          { label: "全部用户", value: String(summary.total), tone: "accent" },
          { label: "当前结果", value: String(filteredTotal) },
          { label: "状态正常", value: String(summary.active), tone: "green" },
          { label: "已封禁", value: String(summary.banned), tone: "red" },
          { label: "已激活", value: String(summary.activated), tone: "amber" },
          { label: "剩余额度", value: String(summary.credits) },
        ]}
      />

      <form
        action="/admin/users"
        method="get"
        className="ark-card grid gap-3 p-4 sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(110px,auto))_auto]"
      >
        <label className="block">
          <span className="ark-label">搜索用户</span>
          <input
            name="q"
            defaultValue={q}
            maxLength={80}
            className="ark-input"
            placeholder="用户名、昵称或用户 ID"
          />
        </label>
        <FilterSelect label="账号状态" name="status" defaultValue={status}>
          <option value="">全部</option>
          <option value="active">正常</option>
          <option value="banned">封禁</option>
        </FilterSelect>
        <FilterSelect label="激活状态" name="activation" defaultValue={activation}>
          <option value="">全部</option>
          <option value="activated">已激活</option>
          <option value="inactive">未激活</option>
        </FilterSelect>
        <FilterSelect label="角色" name="role" defaultValue={role}>
          <option value="">全部</option>
          <option value="user">普通用户</option>
          <option value="admin">管理员</option>
        </FilterSelect>
        <FilterSelect label="每页" name="pageSize" defaultValue={String(pageSize)}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} 条
            </option>
          ))}
        </FilterSelect>
        <div className="flex gap-2">
          <button type="submit" className="ark-btn ark-btn-primary h-10 px-4">
            查询
          </button>
          {hasFilters || pageSize !== DEFAULT_PAGE_SIZE ? (
            <Link href="/admin/users" className="ark-btn ark-btn-ghost h-10 px-4">
              重置
            </Link>
          ) : null}
        </div>
      </form>

      {rows.length > 0 ? (
        <>
          <AdminTable
            head={[
              "用户",
              "信任级",
              "角色",
              "账号",
              "激活",
              "免费期至",
              "额度",
              "最近登录",
              "操作",
            ]}
            rows={rows.map((u) => [
              <span key="u" className="flex min-w-32 items-center gap-2">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="ark-mono flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: "var(--ark-surface-2)", color: "var(--ark-accent)" }}
                  >
                    {u.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>
                  <span className="block font-medium">{u.username}</span>
                  <span className="ark-mono block text-[10px]" style={{ color: "var(--ark-muted)" }}>
                    #{u.id} · LD {u.linuxdoId}
                  </span>
                </span>
              </span>,
              u.trustLevel,
              u.role === "admin" ? (
                <StatusChip key="r" tone="accent">
                  管理员
                </StatusChip>
              ) : (
                <StatusChip key="r">用户</StatusChip>
              ),
              u.status === "banned" ? (
                <span key="s" title={u.banReason ?? "未记录封禁原因"}>
                  <StatusChip tone="red">封禁</StatusChip>
                </span>
              ) : (
                <StatusChip key="s" tone="green">
                  正常
                </StatusChip>
              ),
              u.activated ? (
                <StatusChip key="a" tone="green">
                  已激活
                </StatusChip>
              ) : (
                <StatusChip key="a" tone="amber">
                  未激活
                </StatusChip>
              ),
              u.paidUntil ? formatDate(u.paidUntil) : "—",
              <span key="c" className="ark-mono">{u.updateCredits}</span>,
              u.lastLoginAt ? formatDate(u.lastLoginAt) : "从未登录",
              <UserActions
                key="op"
                id={u.id}
                banned={u.status === "banned"}
                admin={u.role === "admin"}
                activated={u.activated}
              />,
            ])}
          />

          <nav
            className="ark-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
            aria-label="用户列表分页"
          >
            <p className="text-xs" style={{ color: "var(--ark-muted)" }}>
              第{" "}
              <span className="ark-mono" style={{ color: "var(--ark-text)" }}>
                {page}
              </span>{" "}
              / {totalPages} 页
            </p>
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Link className="ark-btn ark-btn-ghost ark-btn-sm" href={usersHref(filters, 1)}>
                  首页
                </Link>
              ) : null}
              {page > 1 ? (
                <Link
                  className="ark-btn ark-btn-ghost ark-btn-sm"
                  href={usersHref(filters, page - 1)}
                  rel="prev"
                >
                  上一页
                </Link>
              ) : (
                <span className="ark-btn ark-btn-ghost ark-btn-sm opacity-40" aria-disabled="true">
                  上一页
                </span>
              )}
              {page < totalPages ? (
                <Link
                  className="ark-btn ark-btn-ghost ark-btn-sm"
                  href={usersHref(filters, page + 1)}
                  rel="next"
                >
                  下一页
                </Link>
              ) : (
                <span className="ark-btn ark-btn-ghost ark-btn-sm opacity-40" aria-disabled="true">
                  下一页
                </span>
              )}
              {page < totalPages ? (
                <Link
                  className="ark-btn ark-btn-ghost ark-btn-sm"
                  href={usersHref(filters, totalPages)}
                >
                  末页
                </Link>
              ) : null}
            </div>
          </nav>
        </>
      ) : (
        <section className="ark-card px-6 py-12 text-center">
          <div className="ark-mono text-xs tracking-[0.22em]" style={{ color: "var(--ark-accent)" }}>
            0 MATCHES
          </div>
          <h2 className="ark-display mt-3 text-lg font-bold">
            {hasFilters ? "没有符合条件的用户" : "还没有用户"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--ark-muted)" }}>
            {hasFilters ? "可以缩短关键词或移除部分筛选条件后再试。" : "用户完成首次登录后会出现在这里。"}
          </p>
          {hasFilters ? (
            <Link href="/admin/users" className="ark-btn ark-btn-ghost mt-5">
              清除筛选
            </Link>
          ) : null}
        </section>
      )}

      {rows.some((u) => u.status === "banned") ? (
        <section className="ark-card p-4 text-sm">
          <div className="mb-2 font-semibold">本页封禁原因</div>
          <ul className="space-y-1" style={{ color: "var(--ark-muted)" }}>
            {rows
              .filter((u) => u.status === "banned")
              .map((u) => (
                <li key={u.id}>
                  <span className="font-medium" style={{ color: "var(--ark-text)" }}>
                    {u.username}
                  </span>
                  ：{u.banReason ?? "未记录"}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="ark-label">{label}</span>
      <select name={name} defaultValue={defaultValue} className="ark-input h-10 min-w-28">
        {children}
      </select>
    </label>
  );
}
