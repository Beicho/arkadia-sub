import { countDistinct, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLogs, subPulls, users } from "@/db/schema";
import AdminTable from "@/components/admin/AdminTable";
import { Badge } from "@cloudflare/kumo/components/badge";
import { fingerprintClusters } from "@/lib/fingerprint";
import { formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminFraudPage() {
  const since7d = new Date(Date.now() - 7 * 86_400_000);

  const [clusters, recentPulls, tokenSpread, autoBans] = await Promise.all([
    fingerprintClusters(),
    db
      .select({
        id: subPulls.id,
        username: users.username,
        ip: subPulls.ip,
        ua: subPulls.ua,
        createdAt: subPulls.createdAt,
      })
      .from(subPulls)
      .innerJoin(users, eq(users.id, subPulls.userId))
      .orderBy(desc(subPulls.createdAt))
      .limit(100),
    db
      .select({
        username: users.username,
        subToken: users.subToken,
        ips: countDistinct(subPulls.ip),
      })
      .from(subPulls)
      .innerJoin(users, eq(users.id, subPulls.userId))
      .where(gte(subPulls.createdAt, since7d))
      .groupBy(users.username, users.subToken),
    db
      .select()
      .from(auditLogs)
      .where(sql`${auditLogs.action} = 'auto_ban_fingerprint'`)
      .orderBy(desc(auditLogs.createdAt))
      .limit(20),
  ]);

  const suspicious = tokenSpread.filter((t) => Number(t.ips) >= 3);

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-bold">风控</h1>

      <section>
        <h2 className="mb-3 font-semibold">
          指纹簇(同设备指纹 ≥2 账号,达到阈值自动封禁)
        </h2>
        {clusters.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无多账号指纹簇。</p>
        ) : (
          <AdminTable
            head={["指纹", "账号数", "账号", "最近出现"]}
            rows={clusters.map((c) => [
              <span key="f" className="font-mono text-xs">
                {c.fpHash.slice(0, 16)}…
              </span>,
              c.users.length,
              <span key="u" className="flex flex-wrap gap-1">
                {c.users.map((u) => (
                  <Badge
                    key={u.id}
                    variant={u.status === "banned" ? "error" : "secondary"}
                  >
                    {u.username}
                  </Badge>
                ))}
              </span>,
              formatDate(c.lastSeenAt),
            ])}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">分发嫌疑(7 天内 ≥3 个不同 IP 拉取)</h2>
        {suspicious.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无。</p>
        ) : (
          <AdminTable
            head={["用户", "订阅 token", "不同 IP 数"]}
            rows={suspicious.map((t) => [
              t.username,
              <span key="t" className="font-mono text-xs">
                {t.subToken.slice(0, 8)}…
              </span>,
              String(t.ips),
            ])}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">自动封禁记录</h2>
        {autoBans.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无自动封禁。</p>
        ) : (
          <AdminTable
            head={["时间", "指纹", "详情"]}
            rows={autoBans.map((b) => [
              formatDate(b.createdAt),
              <span key="f" className="font-mono text-xs">
                {String(b.target ?? "").replace("fp:", "").slice(0, 12)}…
              </span>,
              <code key="d" className="text-xs">
                {JSON.stringify(b.detail)}
              </code>,
            ])}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">最近拉取日志(100 条)</h2>
        {recentPulls.length === 0 ? (
          <p className="text-sm text-neutral-500">暂无拉取。</p>
        ) : (
          <AdminTable
            head={["时间", "用户", "IP", "UA"]}
            rows={recentPulls.map((p) => [
              formatDate(p.createdAt),
              p.username,
              <span key="i" className="font-mono text-xs">
                {p.ip ?? "—"}
              </span>,
              <span key="u" className="max-w-48 truncate text-xs text-neutral-400">
                {p.ua ?? "—"}
              </span>,
            ])}
          />
        )}
      </section>
    </div>
  );
}
