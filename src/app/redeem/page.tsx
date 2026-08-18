import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, redeemCodes } from "@/db/schema";
import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { CheckCircleIcon, InfoIcon } from "@phosphor-icons/react";
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
  let orderInfo: { code: string | null; status: string; amount: string } | null =
    null;
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
      orderInfo = { code, status: order.status, amount: order.amount };
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="mb-1 text-2xl font-bold">兑换注册码</h1>
      <p className="mb-6 text-sm text-neutral-500">
        用注册码激活账号,获得赠送天数与专属订阅链接。
      </p>

      {orderInfo ? (
        <div className="mb-6 space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
          <div className="flex items-center gap-2 font-semibold">
            {orderInfo.status === "paid" ? (
              <>
                <CheckCircleIcon className="text-green-600" /> 支付成功
              </>
            ) : (
              <>
                <Badge variant="warning">
                  {orderInfo.status === "pending" ? "待支付" : "已过期"}
                </Badge>
              </>
            )}
          </div>
          {orderInfo.code ? (
            <>
              <CopyField value={orderInfo.code} label="你的注册码(请立即保存)" />
              <p className="text-xs text-neutral-500">
                凭订单号 {orderNo} 可随时在下方"找回注册码"再次查询。
              </p>
            </>
          ) : (
            <Banner
              icon={<InfoIcon weight="fill" />}
              title={
                orderInfo.status === "pending"
                  ? "订单尚未支付"
                  : "订单已过期"
              }
              description={
                orderInfo.status === "pending"
                  ? "完成支付后回到本页即可看到注册码。"
                  : "订单超时未支付已失效,库存已回补,请重新购买。"
              }
            />
          )}
        </div>
      ) : null}

      {user ? (
        user.activated ? (
          <Banner
            icon={<InfoIcon weight="fill" />}
            title="账号已激活"
            description="无需再次兑换。到面板查看订阅状态与链接。"
          />
        ) : (
          <div className="space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
            <div className="font-semibold">输入注册码</div>
            <RedeemForm />
          </div>
        )
      ) : (
        <div className="space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
          <div className="font-semibold">已有注册码?</div>
          <p className="text-sm text-neutral-500">
            兑换需要先登录 LinuxDo 账号(用于绑定订阅)。
          </p>
          <LoginButton />
        </div>
      )}

      <div className="mt-6 space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
        <div className="font-semibold">找回注册码</div>
        <p className="text-sm text-neutral-500">
          支付后关了页面?输入订单号(支付跳转页显示的 ARK 开头单号)重新获取。
        </p>
        <CodeLookupForm />
      </div>

      <footer className="mt-10 text-sm text-neutral-400">
        <a href="/" className="underline">← 返回首页</a>
      </footer>
    </main>
  );
}
