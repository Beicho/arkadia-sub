import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { nodeBatches, orders } from "@/db/schema";
import {
  GlobeHemisphereWestIcon,
  ClockIcon,
  LightningIcon,
  LinkIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import CopyField from "@/components/CopyField";
import Fingerprint from "@/components/Fingerprint";
import RenewCard from "@/components/RenewCard";
import ResetTokenButton from "@/components/ResetTokenButton";
import { LogoutButton } from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { reconcileOrder } from "@/lib/reconcile";
import { getSettings } from "@/lib/settings";
import { daysLeft, formatDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const STATUS_TEXT: Record<string, string> = {
  paid: "已支付",
  pending: "待支付",
  expired: "已过期",
  refunded: "已退款",
};
const STATUS_CHIP: Record<string, string> = {
  paid: "ark-chip ark-chip-green",
  pending: "ark-chip ark-chip-amber",
  expired: "ark-chip",
  refunded: "ark-chip ark-chip-red",
};

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

  const [s, myOrders, activeBatch] = await Promise.all([
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

      <header className="mb-8 flex items-center justify-between">
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
          <span className="ark-chip">
            {user.username}
            {user.role === "admin" ? " · 管理员" : ""}
          </span>
          {user.role === "admin" ? (
            <a href="/admin" className="ark-btn ark-btn-ghost ark-btn-sm">后台</a>
          ) : null}
          <LogoutButton />
        </div>
      </header>

      {!user.activated ? (
        <a
          href="/redeem"
          className="ark-card mb-6 flex items-center justify-between p-5 no-underline"
          style={{ borderColor: "color-mix(in srgb, var(--ark-accent) 35%, var(--ark-border))" }}
        >
          <div>
            <div className="font-semibold">账号未激活</div>
            <div className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
              用注册码激活,立即获得 {s.activation_days} 天免费更新期
            </div>
          </div>
          <span className="ark-btn ark-btn-primary ark-btn-sm">去兑换 →</span>
        </a>
      ) : (
        <section className="mb-6 grid gap-4 md:grid-cols-2">
          {/* 状态卡 */}
          <div className="ark-card p-6">
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
                    剩 <b className="ark-mono">{freeDays}</b> 天({formatDate(user.paidUntil)})
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--ark-muted)" }}>
                  <LightningIcon size={13} className="mr-1 inline" /> 更新额度
                </span>
                <span>
                  <b className="ark-mono" style={{ color: user.updateCredits > 0 ? "var(--ark-accent)" : "inherit" }}>
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
          </div>

          {/* 订阅链接卡 */}
          <div className="ark-card flex flex-col p-6">
            <div className="ark-label">订阅链接(仅自己可见,勿分享)</div>
            <CopyField value={subUrl} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={`/${user.subToken}?raw=1`}
                target="_blank"
                rel="noreferrer"
                className="ark-btn ark-btn-ghost ark-btn-sm"
              >
                <DownloadSimpleIcon size={14} />
                下载节点文件
              </a>
              <ResetTokenButton />
            </div>
            <p className="mt-auto pt-3 text-xs" style={{ color: "var(--ark-muted)" }}>
              <LinkIcon size={12} className="mr-1 inline" />
              填进客户端&quot;订阅&quot;即可;泄露给他人请立即重置链接。
            </p>
          </div>
        </section>
      )}

      {user.activated ? (
        <section className="mb-6">
          <RenewCard
            pricePerUpdate={s.price_per_update}
            maxCredits={s.max_credits_per_order}
            noRefundAccepted={Boolean(user.noRefundAcceptedAt)}
          />
        </section>
      ) : null}

      <section className="ark-card p-6">
        <div className="mb-3 font-semibold">我的订单</div>
        {myOrders.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ark-muted)" }}>还没有订单。</p>
        ) : (
          <div className="ark-scroll-x">
            <table className="ark-table">
              <thead>
                <tr>
                  <th>单号</th>
                  <th>内容</th>
                  <th>金额</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {myOrders.map((o) => (
                  <tr key={o.id}>
                    <td className="ark-mono text-xs">{o.outTradeNo}</td>
                    <td>{o.orderType === "renewal" ? `更新额度 ×${o.quantity}` : "注册码"}</td>
                    <td className="ark-mono">{Number(o.amount).toFixed(0)} LDC</td>
                    <td>
                      <span className={STATUS_CHIP[o.status] ?? "ark-chip"}>
                        {STATUS_TEXT[o.status] ?? o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
