import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes } from "@/db/schema";
import { CheckCircleIcon, WarningIcon } from "@phosphor-icons/react/dist/ssr";
import CodeLookupForm from "@/components/CodeLookupForm";
import CopyField from "@/components/CopyField";
import LoginButton from "@/components/LogoutButton";
import RedeemForm from "@/components/RedeemForm";
import { getCurrentUser } from "@/lib/auth";
import { reconcileOrder } from "@/lib/reconcile";

export const dynamic = "force-dynamic";

export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();

  // return 页带单号进来:先对账再展示
  let orderInfo: { code: string | null; status: string } | null = null;
  const orderNo = typeof sp.order === "string" ? sp.order : null;
  if (orderNo) {
    await reconcileOrder(orderNo).catch(() => undefined);
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.outTradeNo, orderNo))
      .limit(1);
    if (order) {
      let code: string | null = null;
      if (order.status === "paid" && order.codeId) {
        const [c] = await db
          .select()
          .from(redeemCodes)
          .where(eq(redeemCodes.id, order.codeId))
          .limit(1);
        if (c && c.revealed) code = c.code;
      }
      orderInfo = { code, status: order.status };
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 md:py-12">
      <header className="mb-8">
        <a href="/" className="text-sm no-underline" style={{ color: "var(--ark-muted)" }}>
          ← 返回首页
        </a>
        <h1 className="ark-display mt-4 text-2xl font-bold">兑换注册码</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ark-muted)" }}>
          用注册码激活账号,获得免费更新期与专属订阅链接。
        </p>
      </header>

      {orderInfo ? (
        <div className="ark-card mb-6 space-y-3 p-6">
          {orderInfo.status === "paid" ? (
            <>
              <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--ark-green)" }}>
                <CheckCircleIcon size={20} weight="fill" />
                支付成功
              </div>
              {orderInfo.code ? (
                <>
                  <CopyField value={orderInfo.code} label="你的注册码(请立即保存)" />
                  <p className="text-xs" style={{ color: "var(--ark-muted)" }}>
                    凭订单号 <span className="ark-mono">{orderNo}</span> 可随时在下方找回。
                  </p>
                </>
              ) : null}
            </>
          ) : (
            <div
              className="flex items-start gap-3 rounded-xl p-4 text-sm"
              style={{
                background: "color-mix(in srgb, var(--ark-amber) 9%, transparent)",
                color: "var(--ark-amber)",
              }}
            >
              <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0" />
              <div>
                {orderInfo.status === "pending"
                  ? "订单尚未支付——完成支付后回到本页即可看到注册码。"
                  : orderInfo.status === "refund_pending"
                    ? "订单正在退款处理中，注册码已暂停使用。"
                    : orderInfo.status === "refunded"
                      ? "订单已退款，注册码已作废。"
                      : "订单超时未支付已失效,库存已回补,请重新购买。"}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {user ? (
        user.activated ? (
          <div className="ark-card mb-6 p-6 text-sm" style={{ color: "var(--ark-muted)" }}>
            <b style={{ color: "var(--ark-text)" }}>账号已激活</b>
            ,无需再次兑换。到
            <a href="/dashboard" style={{ color: "var(--ark-accent)" }}> 面板 </a>
            查看订阅状态与链接。
          </div>
        ) : (
          <div className="ark-card mb-6 space-y-4 p-6">
            <div className="font-semibold">输入注册码</div>
            <RedeemForm />
          </div>
        )
      ) : (
        <div className="ark-card mb-6 space-y-4 p-6">
          <div className="font-semibold">已有注册码?</div>
          <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
            兑换需要先登录 LinuxDo 账号(用于绑定订阅)。
          </p>
          <LoginButton />
        </div>
      )}

      <div className="ark-card space-y-4 p-6">
        <div className="font-semibold">找回注册码</div>
        <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
          支付后关了页面?输入订单号(支付页显示的 ARK 开头单号)重新获取。
        </p>
        <CodeLookupForm />
      </div>
    </div>
  );
}
