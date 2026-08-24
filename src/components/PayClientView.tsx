"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LayerCard } from "@/components/kumo";
import { CheckCircleIcon, XCircleIcon, ClockIcon } from "@phosphor-icons/react";
import { apiGet } from "@/components/api";

type OrderStatus = {
  status: "pending" | "paid" | "expired" | "refund_pending" | "refunded";
  orderType: string;
  amount: string;
  quantity: number;
  code?: string | null;
};

export default function PayClientView({
  orderNo,
  amount,
  submitFields,
  submitUrl,
  targetUrl,
}: {
  orderNo: string;
  amount: number;
  submitFields: Record<string, string | number>;
  submitUrl: string;
  targetUrl: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus["status"]>("pending");
  const [redirected, setRedirected] = useState(false);
  const [pollCount, setPollCount] = useState(0);

  // 400ms 后自动提交跳转到 LDC 支付平台
  useEffect(() => {
    const timer = setTimeout(() => {
      const form = document.getElementById("payform") as HTMLFormElement | null;
      if (form) {
        setRedirected(true);
        form.submit();
      }
    }, 450);
    return () => clearTimeout(timer);
  }, []);

  // 轮询订单状态（用户可能在另一个标签页完成支付后切回本页）
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await apiGet<OrderStatus>(`/api/orders/${orderNo}`);
        if (res && res.status !== "pending") {
          setStatus(res.status);
          clearInterval(interval);
          if (res.status === "paid") {
            setTimeout(() => {
              router.push(targetUrl);
            }, 1000);
          }
        }
      } catch {
        // 忽略网络或限流暂态错误
      }
      setPollCount((c) => c + 1);
    }, 2500);

    return () => clearInterval(interval);
  }, [orderNo, targetUrl, router]);

  if (status === "paid") {
    return (
      <LayerCard className="space-y-5 p-8 text-center animate-in zoom-in-95 duration-200">
        <div className="flex justify-center text-emerald-500" style={{ color: "var(--ark-green)" }}>
          <CheckCircleIcon size={56} weight="fill" />
        </div>
        <h1 className="ark-display text-2xl font-bold">支付成功！</h1>
        <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
          系统已自动完成对账入账，正在跳转中...
        </p>
        <Button variant="primary" onClick={() => router.push(targetUrl)}>
          立即前往
        </Button>
      </LayerCard>
    );
  }

  if (status === "expired" || status === "refund_pending" || status === "refunded") {
    return (
      <LayerCard className="space-y-5 p-8 text-center animate-in zoom-in-95 duration-200">
        <div className="flex justify-center text-rose-500" style={{ color: "var(--ark-red)" }}>
          <XCircleIcon size={56} weight="fill" />
        </div>
        <h1 className="ark-display text-2xl font-bold">
          {status === "refund_pending"
            ? "退款处理中"
            : status === "refunded"
              ? "订单已退款"
              : "订单已过期失效"}
        </h1>
        <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
          {status === "refund_pending"
            ? "退款申请正在处理，请稍后在订单列表查看结果。"
            : status === "refunded"
              ? "款项已退回，已发放的权益同时失效。"
              : "未在规定时间内完成支付，库存已自动回补，请重新下单。"}
        </p>
        <Button variant="secondary" onClick={() => router.push("/")}>
          返回首页
        </Button>
      </LayerCard>
    );
  }

  return (
    <LayerCard className="space-y-5 p-6 text-center">
      <h1 className="ark-display text-xl font-bold">正在前往 Linux.do Credit 支付</h1>
      <div className="ark-mono text-xs" style={{ color: "var(--ark-muted)" }}>
        单号：{orderNo}
      </div>
      <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: "var(--ark-amber)" }}>
        <ClockIcon size={14} />
        请在 5 分钟内完成支付，超时订单自动关闭回补库存
      </div>
      <div className="ark-display text-4xl font-extrabold" style={{ color: "var(--ark-accent)" }}>
        {amount.toFixed(2)}
        <span className="ml-1 text-sm font-normal" style={{ color: "var(--ark-muted)" }}>
          LDC
        </span>
      </div>

      <form id="payform" method="POST" action={submitUrl} className="hidden">
        {Object.entries(submitFields).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      </form>

      <div className="flex flex-col items-center gap-4 pt-2">
        <div
          className="h-9 w-9 animate-spin rounded-full"
          style={{
            border: "2.5px solid var(--ark-border-strong)",
            borderTopColor: "var(--ark-accent)",
          }}
        />
        <p className="text-xs" style={{ color: "var(--ark-muted)" }}>
          {redirected ? "已跳转至支付收银台，等待支付完成..." : "正在跳转至收银台..."}
        </p>
        <button
          type="button"
          onClick={() => {
            const form = document.getElementById("payform") as HTMLFormElement | null;
            if (form) form.submit();
          }}
          className="cursor-pointer text-xs underline transition-opacity hover:opacity-80"
          style={{ color: "var(--ark-accent)" }}
        >
          若页面没有自动跳转，请点击此处手动进入支付
        </button>
      </div>
    </LayerCard>
  );
}
