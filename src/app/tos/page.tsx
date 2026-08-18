import { Banner } from "@cloudflare/kumo/components/banner";
import { WarningIcon } from "@phosphor-icons/react";

export const metadata = { title: "服务条款 — Arkadia" };

export default function TosPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold">服务条款</h1>
      <Banner
        icon={<WarningIcon weight="fill" />}
        variant="error"
        title="重要:不退款"
        description="本服务为虚拟订阅商品,一经支付,任何情况下不退款(包括但不限于:未使用、不想用了、节点不满意、账号被封禁、订阅到期)。下单前请务必确认需求。"
      />

      <article className="mt-8 space-y-6 text-sm leading-7 text-neutral-700 dark:text-neutral-300">
        <section>
          <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">1. 服务内容</h2>
          <p>
            Arkadia 提供按日订阅的代理节点列表。站长每天测试并更新节点批次;已付费用户通过专属订阅链接获取当天节点。
            节点名称形如 Arkadia-20260818-01,标明批次日期与序号。
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">2. 计费</h2>
          <p>
            注册码价格以首页展示为准,兑换后赠送对应天数;赠期结束后按天计费,价格以购买时页面展示为准。
            一次可购买多天,费用支付后立即叠加到现有到期时间。
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">3. 不退款(再次强调)</h2>
          <p>
            支付成功即视为服务开始交付。虚拟商品不适用七天无理由;续费天数一经支付不退还、不可转让、不可折现。
            因违反本条款被封禁的账号同样不退款。
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">4. 使用限制</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>仅限本人使用,禁止分享订阅链接、倒卖、公开发布。</li>
            <li>禁止利用节点从事任何违法违规活动。</li>
            <li>系统会记录设备指纹用于识别一人多号;同设备绑定多个账号将被自动封禁且不予退款。</li>
          </ul>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">5. 服务变更与中断</h2>
          <p>
            节点由第三方提供,可能因上游原因失效;站长每日测试并替换,但不做可用性保证( SLA)。
            服务可能因不可抗力暂停或终止,已支付天数不因此退还。
          </p>
        </section>
        <section>
          <h2 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">6. 账号</h2>
          <p>
            使用 LinuxDo OAuth 登录。注册与购买设有信任等级门槛(以后台配置为准)。封禁申诉请联系站长。
          </p>
        </section>
      </article>

      <footer className="mt-10 text-sm text-neutral-400">
        <a href="/" className="underline">← 返回首页</a>
      </footer>
    </main>
  );
}
