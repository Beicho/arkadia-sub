import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { LinkButton } from "@/components/kumo";
import PayClientView from "@/components/PayClientView";
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

  const target =
    order.orderType === "activation"
      ? `/redeem?order=${order.outTradeNo}`
      : `/dashboard?order=${order.outTradeNo}`;

  if (order.status !== "pending") {
    const refunded = order.status === "refunded";
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
    returnUrl: `${base}${target}`,
  });

  return (
    <main className="mx-auto max-w-md px-4 py-24">
      <PayClientView
        orderNo={order.outTradeNo}
        amount={Number(order.amount)}
        submitFields={fields}
        submitUrl={SUBMIT_URL}
        targetUrl={target}
      />
    </main>
  );
}
