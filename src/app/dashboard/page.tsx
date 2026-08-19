import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { announcements, nodeBatches, orders } from "@/db/schema";
import { Badge, Banner, LayerCard, LinkButton } from "@/components/kumo";
import {
  GlobeHemisphereWestIcon,
  ClockIcon,
  LightningIcon,
  LinkIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import AdminTable from "@/components/admin/AdminTable";
import SubExportCard from "@/components/SubExportCard";
import Fingerprint from "@/components/Fingerprint";
import BatchLockCard from "@/components/BatchLockCard";
import RenewCard from "@/components/RenewCard";
import { LogoutButton } from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { reconcileOrder } from "@/lib/reconcile";
import { getSettings } from "@/lib/settings";
import { daysLeft, formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.status === "banned") redirect("/denied?reason=banned");

  const sp = await searchParams;
  const orderNo = typeof sp.order === "string" ? sp.order : null;
  if (orderNo) {
    await reconcileOrder(orderNo).catch(() => undefined);
  }

  const [s, myOrders, activeBatch, activeAnnouncements] = await Promise.all([
    getSettings(),
    db
      .select()
      .from(orders)
      .where(eq(orders.userId, user.id))
      .orderBy(desc(orders.createdAt))
      .limit(10),
    db
      .select({ batchDate: nodeBatches.batchDate })
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .limit(1),
    db
      .select()
      .from(announcements)
      .where(eq(announcements.isActive, true))
      .orderBy(desc(announcements.createdAt))
      .limit(3),
  ]);

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const subUrl = appUrl ? `${appUrl}/${user.subToken}` : `/${user.subToken}`;

  const freeDays = daysLeft(user.paidUntil);
  const inFreePeriod = Boolean(user.paidUntil) && freeDays > 0;
  const canPull = user.activated && (inFreePeriod || user.updateCredits > 0);
  const lastUpdate = activeBatch[0]?.batchDate ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6">
      <Fingerprint />

      {activeAnnouncements.length > 0 ? (
        <div className="mb-4 space-y-2">
          {activeAnnouncements.map((a) => (
            <Banner
              key={a.id}
              variant={
                a.level === "alert" ? "error" : a.level === "warning" ? "alert" : "secondary"
              }
              title="站长公告"
              description={a.content}
            />
          ))}
        </div>
      ) : null}

      <header className="ark-float-nav mb-8 flex items-center justify-between px-5 py-3">
        <a href="/" className="flex items-center gap-2.5 no-underline" style={{ color: "var(--ark-text)" }}>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "var(--ark-accent)", color: "var(--ark-accent-ink)" }}
          >
            <GlobeHemisphereWestIcon size={18} weight="bold" />
          </span>
          <span className="ark-display text-lg font-bold">Arkadia</span>
        </a>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {user.username}
            {user.role === "admin" ? " · 管理员" : ""}
          </Badge>
          {user.role === "admin" ? (
            <LinkButton href="/admin" variant="secondary" size="sm">后台</LinkButton>
          ) : null}
          <LogoutButton />
        </div>
      </header>

      {!user.activated ? (
        <LinkButton
          href="/redeem"
          variant="primary"
          className="mb-6 flex w-full items-center justify-between !py-5"
        >
          <span>账号未激活 —— 用注册码激活,立得免费更新期</span>
          <span>去兑换 →</span>
        </LinkButton>
      ) : (
        <section className="ark-rise ark-rise-2 mb-6 grid gap-4 md:grid-cols-2">
          {/* 状态卡 */}
          <LayerCard className="ark-card-lift p-6">
            <div className="ark-label">订阅状态</div>
            {canPull ? (
              <div className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--ark-green)" }}>
                <LightningIcon size={20} weight="fill" />
                可更新
              </div>
            ) : (
              <div className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--ark-red)" }}>
                无可用更新
              </div>
            )}
            <div className="mt-4 space-y-2 text-sm">
              {inFreePeriod ? (
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--ark-muted)" }}>
                    <ClockIcon size={13} className="mr-1 inline" /> 免费更新期
                  </span>
                  <span>
                    剩 <b className="ark-num">{freeDays}</b> 天({formatDate(user.paidUntil)})
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--ark-muted)" }}>
                  <LightningIcon size={13} className="mr-1 inline" /> 更新额度
                </span>
                <span>
                  <b className="ark-num" style={{ color: user.updateCredits > 0 ? "var(--ark-accent)" : "inherit" }}>
                    {user.updateCredits}
                  </b>{" "}
                  次
                </span>
              </div>
              {lastUpdate ? (
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--ark-muted)" }}>站长最近更新</span>
                  <span className="ark-mono">{lastUpdate}</span>
                </div>
              ) : null}
            </div>
          </LayerCard>

          {/* 订阅导出卡 */}
          <SubExportCard subUrl={subUrl} subToken={user.subToken} />
        </section>
      )}

      {user.activated ? (
        <section className="mb-6">
          <BatchLockCard
            locked={user.batchLocked}
            lockedUntil={user.batchLockedUntil}
            currentBatchDate={lastUpdate}
          />
        </section>
      ) : null}

      {user.activated ? (
        <section className="mb-6">
          <RenewCard
            pricePerUpdate={s.price_per_update}
            maxCredits={s.max_credits_per_order}
            noRefundAccepted={Boolean(user.noRefundAcceptedAt)}
          />
        </section>
      ) : null}

      <section>
        <h2 className="ark-h2 mb-3">我的订单</h2>
        <AdminTable
          head={["单号", "内容", "金额", "状态"]}
          rows={myOrders.map((o) => [
            <span key="no" className="ark-mono text-xs">{o.outTradeNo}</span>,
            o.orderType === "renewal" ? `更新额度 ×${o.quantity}` : "注册码",
            <span key="am" className="ark-mono">{Number(o.amount).toFixed(0)} LDC</span>,
            <Badge
              key="st"
              variant={
                o.status === "paid"
                  ? "success"
                  : o.status === "pending"
                    ? "warning"
                    : o.status === "refunded"
                      ? "error"
                      : "secondary"
              }
            >
              {{ paid: "已支付", pending: "待支付", expired: "已过期", refunded: "已退款" }[o.status] ?? o.status}
            </Badge>,
          ])}
        />
      </section>

      {orderNo ? (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--ark-muted)" }}>
          支付回跳订单:{orderNo}(若未入账,系统会自动对账)
        </p>
      ) : null}

      <footer className="mt-10 pb-6 text-center text-xs" style={{ color: "var(--ark-muted)" }}>
        <a href="/tos" style={{ color: "inherit" }}>服务条款(不退款)</a>
      </footer>
    </div>
  );
}
