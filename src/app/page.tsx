import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { nodeBatches } from "@/db/schema";
import { Badge, Button, LinkButton, LayerCard, Banner } from "@/components/kumo";
import {
  GlobeHemisphereWestIcon,
  LightningIcon,
  ShieldCheckIcon,
  CoinsIcon,
  ArrowRightIcon,
  ClockIcon,
  DatabaseIcon,
  WarningIcon,
  GiftIcon,
} from "@phosphor-icons/react/dist/ssr";
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
  const lastUpdate = activeBatch[0]?.batchDate ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
      {/* ===== 顶栏 ===== */}
      <header className="ark-float-nav mb-6 mt-4 flex items-center justify-between px-5 py-3 md:px-6">
        <a href="/" className="flex items-center gap-2.5 no-underline" style={{ color: "var(--ark-text)" }}>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "var(--ark-accent)", color: "var(--ark-accent-ink)" }}
          >
            <GlobeHemisphereWestIcon size={18} weight="bold" />
          </span>
          <span className="ark-display text-lg font-bold tracking-tight">Arkadia</span>
        </a>
        <nav className="hidden items-center gap-6 text-sm md:flex" style={{ color: "var(--ark-muted)" }}>
          <a href="#pricing" className="no-underline" style={{ color: "inherit" }}>定价</a>
          <a href="/redeem" className="no-underline" style={{ color: "inherit" }}>兑换注册码</a>
          <a href="/tos" className="no-underline" style={{ color: "inherit" }}>服务条款</a>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <LinkButton
              href={user.role === "admin" ? "/admin" : "/dashboard"}
              variant="secondary"
              size="sm"
            >
              {user.username}
              <ArrowRightIcon size={14} />
            </LinkButton>
          ) : (
            <LoginButton variant="secondary" />
          )}
        </div>
      </header>

      {/* ===== Hero ===== */}
      <section className="pb-14 pt-10 text-center md:pb-20 md:pt-16">
        <Badge variant="info" className="mb-6">
          <span className="flex items-center gap-1">
            <LightningIcon size={13} weight="fill" /> LinuxDo 生态 · 每日人工实测
          </span>
        </Badge>
        <h1 className="ark-display mx-auto mb-5 max-w-3xl text-4xl font-extrabold leading-[1.12] md:text-6xl">
          每天一批,
          <span style={{ color: "var(--ark-accent)" }}>实测可用</span>
          的节点
        </h1>
        <p className="mx-auto mb-8 max-w-xl text-sm leading-relaxed md:text-base" style={{ color: "var(--ark-muted)" }}>
          站长每天测速、筛掉坏节点,把当天最好的 {s.expected_node_count} 个打包成批次。
          付款激活后用你的专属订阅链接,随时刷出最新一批——订阅名自带日期,新鲜度一眼可辨。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <LinkButton href="#pricing" variant="primary" className="ark-pop">
            购买注册码 · {s.activation_price} LDC
            <ArrowRightIcon size={15} />
          </LinkButton>
          {user ? (
            <LinkButton href="/dashboard" variant="secondary">进入面板</LinkButton>
          ) : (
            <LinkButton href="/api/auth/login" variant="secondary">
              <ShieldCheckIcon size={15} />
              使用 LinuxDo 登录
            </LinkButton>
          )}
        </div>

        {/* 状态条 */}
        <div className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
          <Badge variant="secondary">
            <DatabaseIcon size={13} />
            库存
            <b className="ark-mono" style={{ color: s.code_stock > 0 ? "var(--ark-green)" : "var(--ark-red)" }}>
              {s.code_stock}
            </b>
          </Badge>
          <Badge variant="secondary">
            <ClockIcon size={13} />
            最近更新
            <b className="ark-mono">{lastUpdate ?? "待首传"}</b>
          </Badge>
          <Badge variant="secondary">
            <DatabaseIcon size={13} />
            每批 {s.expected_node_count} 节点
          </Badge>
          <Badge variant="secondary">
            <CoinsIcon size={13} />
            续价 {s.price_per_update} LDC/次
          </Badge>
        </div>
      </section>

      {/* ===== 定价 ===== */}
      <section id="pricing" className="pb-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <div className="ark-display text-xl font-bold md:text-2xl">定价</div>
            <div className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
              一次性注册,之后按需买更新额度——不更新就不用花钱。
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <BuyActivationCard
            price={s.activation_price}
            days={s.activation_days}
            stock={s.code_stock}
            priceHint={s.price_per_update}
            lastUpdate={lastUpdate}
          />

          <LayerCard className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold">
                <CoinsIcon size={18} style={{ color: "var(--ark-accent)" }} />
                更新额度
              </div>
              <Badge variant="secondary">免费期后</Badge>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="ark-display text-4xl font-extrabold" style={{ color: "var(--ark-accent)" }}>
                {s.price_per_update}
              </span>
              <span className="text-sm" style={{ color: "var(--ark-muted)" }}>LDC / 次更新</span>
            </div>
            <ul className="space-y-2.5 text-sm" style={{ color: "var(--ark-muted)" }}>
              <li className="flex gap-2">
                <LightningIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
                站长上传新批次后,刷新订阅即得,扣 1 额度
              </li>
              <li className="flex gap-2">
                <ClockIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
                额度永久有效,不随时间过期
              </li>
              <li className="flex gap-2">
                <DatabaseIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
                重复拉取同一批次不重复扣
              </li>
              <li className="flex gap-2">
                <ShieldCheckIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
                断更期间无需购买,零浪费
              </li>
            </ul>
            <div className="mt-auto text-sm" style={{ color: "var(--ark-muted)" }}>
              购买额度请先
              <a href="/api/auth/login" style={{ color: "var(--ark-accent)" }}> 登录 </a>
              后进入
              <a href="/dashboard" style={{ color: "var(--ark-accent)" }}> 面板</a>。
            </div>
          </LayerCard>
        </div>

        <div className="mt-4 space-y-4">
          <Banner
            icon={<WarningIcon weight="fill" />}
            variant="alert"
            title="不退款声明"
            description="本服务为虚拟商品,支付后一律不退款(无论是否使用)。购买即视为同意《服务条款》。"
          />
          <Banner
            icon={<GiftIcon weight="fill" />}
            variant="secondary"
            title="福利节点"
            description="可能会不定期向订阅中免费追加 SOCKS5 备用节点(如封锁严重时),不额外收取 LDC,可用性不作保证;同一天内更新多次不重复消耗额度。"
          />
        </div>
      </section>

      {/* ===== 底部 ===== */}
      <footer
        className="flex flex-wrap items-center justify-between gap-3 border-t py-8 text-sm"
        style={{ borderColor: "var(--ark-border)", color: "var(--ark-muted)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-md"
            style={{ background: "var(--ark-accent)", color: "var(--ark-accent-ink)" }}
          >
            <GlobeHemisphereWestIcon size={13} weight="bold" />
          </span>
          Arkadia
        </div>
        <div className="flex gap-5">
          <a href="/redeem" style={{ color: "inherit" }} className="no-underline">兑换 / 找回注册码</a>
          <a href="/tos" style={{ color: "inherit" }} className="no-underline">服务条款</a>
        </div>
      </footer>

      {isDevLogin ? (
        <div className="pb-10">
          <DevLoginPanel adminName={s.admin_usernames[0] ?? "devadmin"} />
        </div>
      ) : null}
    </div>
  );
}
