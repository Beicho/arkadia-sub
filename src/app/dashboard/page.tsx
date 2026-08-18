import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { nodeBatches, orders } from "@/db/schema";
import { Badge, Banner } from "@/components/kumo";
import { CheckCircleIcon, GlobeIcon, InfoIcon } from "@phosphor-icons/react/dist/ssr";
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

const STATUS_BADGE: Record<string, "success" | "warning" | "secondary"> = {
  paid: "success",
  pending: "warning",
  expired: "secondary",
};
const STATUS_TEXT: Record<string, string> = {
  paid: "已支付",
  pending: "待支付",
  expired: "已过期",
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

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Fingerprint />
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-bold">
          <GlobeIcon /> Arkadia
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">{user.username}</span>
          {user.role === "admin" ? <Badge variant="info">管理员</Badge> : null}
          <LogoutButton />
        </div>
      </header>

      <section className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
          <div className="mb-2 text-sm text-neutral-500">订阅状态</div>
          {!user.activated ? (
            <Banner
              icon={<InfoIcon weight="fill" />}
              title="未激活"
              description="先到兑换页用注册码激活,获得免费更新期。"
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {canPull ? (
                  <>
                    <CheckCircleIcon className="text-green-600" />
                    <span className="font-semibold">可更新</span>
                  </>
                ) : (
                  <Badge variant="error">无可用更新</Badge>
                )}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-300">
                {inFreePeriod ? (
                  <>
                    免费更新期:剩余 <b>{freeDays}</b> 天({formatDate(user.paidUntil)}{" "}
                    到期)
                  </>
                ) : (
                  "免费更新期已结束"
                )}
              </div>
              <div className="text-sm text-neutral-600 dark:text-neutral-300">
                更新额度:<b>{user.updateCredits}</b> 次
                <span className="text-neutral-400">(拉新批次扣 1,不随时间过期)</span>
              </div>
              {activeBatch[0] ? (
                <div className="text-xs text-neutral-400">
                  站长最近更新:{activeBatch[0].batchDate}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
          <div className="mb-2 text-sm text-neutral-500">订阅链接(仅自己可见)</div>
          <CopyField value={subUrl} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`/${user.subToken}?raw=1`}
              className="text-sm underline"
              target="_blank"
              rel="noreferrer"
            >
              下载节点文件
            </a>
            <ResetTokenButton />
          </div>
          <p className="mt-2 text-xs text-neutral-400">
            把链接填进客户端的"订阅"即可;泄露给他人请立即重置。
          </p>
        </div>
      </section>

      {user.activated ? (
        <section className="mb-6">
          <RenewCard
            pricePerUpdate={s.price_per_update}
            maxCredits={s.max_credits_per_order}
            noRefundAccepted={Boolean(user.noRefundAcceptedAt)}
          />
        </section>
      ) : (
        <section className="mb-6">
          <a
            href="/redeem"
            className="block rounded-xl bg-neutral-900 px-5 py-4 text-center font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            前往兑换注册码 →
          </a>
        </section>
      )}

      <section className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
        <div className="mb-3 font-semibold">我的订单</div>
        {myOrders.length === 0 ? (
          <p className="text-sm text-neutral-500">还没有订单。</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
            {myOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-mono text-xs">{o.outTradeNo}</span>
                  <span className="ml-2 text-neutral-400">
                    {o.orderType === "renewal" ? `更新额度 ×${o.quantity}` : "注册码"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span>{Number(o.amount).toFixed(0)} LDC</span>
                  <Badge variant={STATUS_BADGE[o.status] ?? "secondary"}>
                    {STATUS_TEXT[o.status] ?? o.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {orderNo ? (
        <p className="mt-4 text-center text-xs text-neutral-400">
          支付回跳订单:{orderNo}(若未入账,稍后自动对账)
        </p>
      ) : null}

      <footer className="mt-10 text-center text-sm text-neutral-400">
        <a href="/tos" className="underline">服务条款(不退款)</a>
      </footer>
    </main>
  );
}
