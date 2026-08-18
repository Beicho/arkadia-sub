import { WarningIcon } from "@phosphor-icons/react/dist/ssr";

export const metadata = { title: "服务条款 — Arkadia" };

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. 服务内容",
    body: "Arkadia 提供订阅制的代理节点列表。站长不定期(通常每天)测试并更新节点批次;已付费用户通过专属订阅链接获取最新批次节点,节点名称形如 Arkadia-20260818-01,标明批次日期与序号。",
  },
  {
    title: "2. 计费",
    body: "注册码价格以首页展示为准,兑换后赠送对应天数的免费更新期;免费期结束后按“更新额度”计费:每次获取新批次消耗 1 个额度,价格以购买时页面展示为准。额度不随时间过期,站长未更新期间无需购买。",
  },
  {
    title: "3. 不退款(再次强调)",
    body: "支付成功即视为服务开始交付。虚拟商品不适用七天无理由;已支付的注册码与更新额度不退还、不可转让、不可折现。因违反本条款被封禁的账号同样不退款。",
  },
  {
    title: "4. 使用限制",
    body: (
      <ul className="list-disc space-y-1 pl-6">
        <li>仅限本人使用,禁止分享订阅链接、倒卖、公开发布。</li>
        <li>禁止利用节点从事任何违法违规活动。</li>
        <li>系统会记录设备指纹用于识别一人多号;同设备绑定多个账号将被自动封禁且不予退款。</li>
      </ul>
    ),
  },
  {
    title: "5. 服务变更与中断",
    body: "节点由第三方提供,可能因上游原因失效;站长每日测试并替换,但不做可用性保证(SLA)。服务可能因不可抗力暂停或终止,已支付款项不因此退还。",
  },
  {
    title: "6. 账号",
    body: "使用 LinuxDo OAuth 登录。注册与购买设有信任等级门槛(以后台配置为准)。封禁申诉请联系站长。",
  },
];

export default function TosPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 md:py-12">
      <header className="mb-8">
        <a href="/" className="text-sm no-underline" style={{ color: "var(--ark-muted)" }}>
          ← 返回首页
        </a>
        <h1 className="ark-display mt-4 text-2xl font-bold">服务条款</h1>
      </header>

      <div
        className="mb-8 flex items-start gap-3 rounded-xl border p-5"
        style={{
          borderColor: "color-mix(in srgb, var(--ark-red) 35%, transparent)",
          background: "color-mix(in srgb, var(--ark-red) 7%, transparent)",
        }}
      >
        <WarningIcon size={22} weight="fill" className="mt-0.5 shrink-0" style={{ color: "var(--ark-red)" }} />
        <div className="text-sm">
          <b>重要:不退款。</b>
          <span style={{ color: "var(--ark-muted)" }}>
            {" "}本服务为虚拟订阅商品,一经支付,任何情况下不退款(包括但不限于:未使用、不想用了、节点不满意、账号被封禁)。下单前请务必确认需求。
          </span>
        </div>
      </div>

      <article className="space-y-7 text-sm leading-7" style={{ color: "var(--ark-muted)" }}>
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="mb-2 font-semibold" style={{ color: "var(--ark-text)" }}>
              {s.title}
            </h2>
            <p>{s.body}</p>
          </section>
        ))}
      </article>

      <footer className="mt-12 pb-6 text-center">
        <a href="/" className="ark-btn ark-btn-ghost ark-btn-sm">← 返回首页</a>
      </footer>
    </div>
  );
}
