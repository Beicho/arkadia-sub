import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
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
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-3 text-xl font-bold">订单不存在</h1>
        <p className="text-sm text-neutral-500">请回到首页重新下单。</p>
      </main>
    );
  }

  if (order.status !== "pending") {
    const target =
      order.orderType === "activation"
        ? `/redeem?order=${order.outTradeNo}`
        : `/dashboard?order=${order.outTradeNo}`;
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="mb-3 text-xl font-bold">
          订单{order.status === "paid" ? "已支付" : "已过期"}
        </h1>
        <p className="mb-6 text-sm text-neutral-500">单号:{order.outTradeNo}</p>
        <a
          href={target}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          继续
        </a>
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
    <main className="mx-auto max-w-md px-4 py-20">
      <h1 className="mb-1 text-xl font-bold">正在前往 LDC 支付</h1>
      <p className="mb-6 text-sm text-neutral-500">
        订单 {order.outTradeNo} · {Number(order.amount).toFixed(2)} LDC
      </p>
      <form id="payform" method="POST" action={SUBMIT_URL} className="hidden">
        {Object.entries(fields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      </form>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "setTimeout(function(){document.getElementById('payform').submit()},300);",
        }}
      />
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800 dark:border-neutral-600 dark:border-t-neutral-200" />
        <button
          type="submit"
          form="payform"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          若未自动跳转,点这里提交
        </button>
      </div>
    </main>
  );
}
