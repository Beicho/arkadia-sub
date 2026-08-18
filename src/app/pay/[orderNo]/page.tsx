import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { Button, LinkButton, LayerCard } from "@/components/kumo";
import { buildSubmitFields } from "@/lib/ldc";
import { appUrl } from "@/lib/linuxdo";

export const dynamic = "force-dynamic";

const SUBMIT_URL = `${
  process.env.LDC_EPAY_BASE ?? "https://credit.linux.do/epay"
}/pay/submit.php`;

export default async function PayPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.outTradeNo, orderNo))
    .limit(1);

  if (!order) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="ark-display mb-3 text-xl font-bold">订单不存在</h1>
        <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
          请回到首页重新下单。
        </p>
        <LinkButton href="/" variant="secondary" size="sm">返回首页</LinkButton>
      </main>
    );
  }

  if (order.status !== "pending") {
    const refunded = order.status === "refunded";
    const target =
      order.orderType === "activation"
        ? `/redeem?order=${order.outTradeNo}`
        : `/dashboard?order=${order.outTradeNo}`;
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="ark-display mb-3 text-xl font-bold">
          {order.status === "paid" ? "订单已支付" : refunded ? "订单已退款" : "订单已过期"}
        </h1>
        <p className="ark-mono mb-6 text-xs" style={{ color: "var(--ark-muted)" }}>
          {order.outTradeNo}
        </p>
        <LinkButton href={target} variant="primary">继续</LinkButton>
      </main>
    );
  }

  const base = appUrl().replace(/\/$/, "");
  const fields = buildSubmitFields({
    outTradeNo: order.outTradeNo,
    name:
      order.orderType === "activation"
        ? `Arkadia 注册码(${order.quantity}天免费更新)`
        : `Arkadia 更新额度 ×${order.quantity}`,
    money: Number(order.amount),
    notifyUrl: `${base}/api/payment/notify`,
    returnUrl:
      order.orderType === "activation"
        ? `${base}/redeem?order=${order.outTradeNo}`
        : `${base}/dashboard?order=${order.outTradeNo}`,
  });

  return (
    <main className="mx-auto max-w-md px-4 py-24">
      <LayerCard className="space-y-5 p-6 text-center">
        <h1 className="ark-display text-xl font-bold">正在前往 LDC 支付</h1>
        <div className="ark-mono text-xs" style={{ color: "var(--ark-muted)" }}>
          {order.outTradeNo}
        </div>
        <div className="text-xs" style={{ color: "var(--ark-amber)" }}>
          请在 5 分钟内完成支付,超时订单自动关闭(库存回补,可重新下单)
        </div>
        <div className="ark-display text-3xl font-extrabold" style={{ color: "var(--ark-accent)" }}>
          {Number(order.amount).toFixed(2)}
          <span className="ml-1 text-sm font-normal" style={{ color: "var(--ark-muted)" }}>LDC</span>
        </div>
        <form id="payform" method="POST" action={SUBMIT_URL} className="hidden">
          {Object.entries(fields).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
        </form>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "setTimeout(function(){document.getElementById('payform').submit()},400);",
          }}
        />
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-8 w-8 animate-spin rounded-full"
            style={{
              border: "2px solid var(--ark-border-strong)",
              borderTopColor: "var(--ark-accent)",
            }}
          />
          <Button type="submit" variant="secondary" size="sm">
            若未自动跳转,点这里提交
          </Button>
        </div>
      </LayerCard>
    </main>
  );
}
