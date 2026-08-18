import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches } from "@/db/schema";
import { Badge, Banner } from "@/components/kumo";

import { GlobeIcon, ShieldCheckIcon, DatabaseIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import BuyActivationCard from "@/components/BuyActivationCard";
import DevLoginPanel from "@/components/DevLoginPanel";
import LoginButton from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const isDevLogin =
  process.env.NODE_ENV !== "production" && process.env.DEV_FAKE_LOGIN === "1";

export default async function Home() {
  const [s, user, activeBatch] = await Promise.all([
    getSettings(),
    getCurrentUser(),
    db
      .select({ batchDate: nodeBatches.batchDate })
      .from(nodeBatches)
      .where(eq(nodeBatches.isActive, true))
      .limit(1),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 md:py-16">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xl font-bold">
          <GlobeIcon />
          Arkadia
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <a href={user.role === "admin" ? "/admin" : "/dashboard"} className="text-sm underline">
              {user.username} · 进入{user.role === "admin" ? "后台" : "面板"}
            </a>
          ) : null}
          {user ? null : <LoginButton variant="secondary" />}
        </div>
      </header>

      <section className="mb-10 text-center">
        <h1 className="mb-3 text-3xl font-bold md:text-5xl">每日实测节点订阅</h1>
        <p className="mx-auto max-w-2xl text-neutral-600 dark:text-neutral-300">
          站长每天人工测试、替换节点。付款后用你的专属订阅链接,随时拉取当天最新的
          {" "}{s.expected_node_count} 个可用节点。
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="info">
            <span className="flex items-center gap-1">
              <ShieldCheckIcon /> LinuxDo OAuth 登录
            </span>
          </Badge>
          <Badge variant="info">LDC 支付</Badge>
          <Badge variant="info">每日更新</Badge>
        </div>
      </section>

      <section className="mb-10 grid gap-4 md:grid-cols-2">
        <BuyActivationCard
          price={s.activation_price}
          days={s.activation_days}
          stock={s.code_stock}
          priceHint={s.price_per_update}
          lastUpdate={activeBatch[0]?.batchDate ?? null}
        />
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
          <div className="flex items-center gap-2 font-semibold">
            <DatabaseIcon />
            更新额度
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">{s.price_per_update}</span>
            <span className="text-sm text-neutral-500">LDC / 次更新</span>
          </div>
          <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
            <li>· 免费期结束后,每次更新(新批次)消耗 1 额度</li>
            <li>· 额度不随时间过期,不更新就不用买</li>
            <li>· 一次可购买 1 ~ {s.max_credits_per_order} 个额度</li>
            <li>· 节点名称带日期(Arkadia-日期-序号),一眼识别新鲜度</li>
          </ul>
          <div className="text-sm text-neutral-500">
            购买请先 <a className="underline" href="/api/auth/login">登录</a> 后进入
            <a className="underline" href="/dashboard"> 面板</a>。
          </div>
        </div>
      </section>

      <Banner
        icon={<WarningIcon weight="fill" />}
        variant="alert"
        title="不退款声明"
        description="本服务为虚拟商品,支付后一律不退款(无论是否使用、用了多久)。购买前请确认需求,详见服务条款。"
      />

      <footer className="mt-10 flex flex-wrap items-center justify-center gap-4 text-sm text-neutral-400">
        <a href="/tos" className="underline">服务条款</a>
        <a href="/redeem" className="underline">兑换 / 找回注册码</a>
        <span>© Arkadia</span>
      </footer>

      {isDevLogin ? (
        <div className="mt-6">
          <DevLoginPanel adminName={s.admin_usernames[0] ?? "devadmin"} />
        </div>
      ) : null}
    </main>
  );
}
