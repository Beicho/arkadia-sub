"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/components/api";

export default function OrderActions({
  id,
  status,
}: {
  id: number;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const reconcile = async () => {
    setLoading("reconcile");
    try {
      await apiPost(`/api/admin/orders/${id}/reconcile`, {});
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "对账失败");
    } finally {
      setLoading(null);
    }
  };

  const cancel = async (paid: boolean) => {
    const tip = paid
      ? "将向 LDC 发起全额退款,并回滚发货(注册码作废回补库存 / 扣回更新额度)。确定?"
      : "取消该待支付订单并回补库存,确定?";
    if (!confirm(tip)) return;
    setLoading("cancel");
    try {
      const res = await apiPost<{ message?: string }>(
        `/api/admin/orders/${id}/cancel`,
      );
      alert(res.message ?? "已取消");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLoading(null);
    }
  };

  if (status === "pending") {
    return (
      <div className="flex gap-1.5">
        <button
          className="ark-btn ark-btn-ghost ark-btn-sm"
          disabled={loading !== null}
          onClick={reconcile}
        >
          {loading === "reconcile" ? "…" : "对账"}
        </button>
        <button
          className="ark-btn ark-btn-danger ark-btn-sm"
          disabled={loading !== null}
          onClick={() => cancel(false)}
        >
          {loading === "cancel" ? "…" : "取消"}
        </button>
      </div>
    );
  }

  if (status === "paid") {
    return (
      <button
        className="ark-btn ark-btn-danger ark-btn-sm"
        disabled={loading !== null}
        onClick={() => cancel(true)}
      >
        {loading === "cancel" ? "退款中…" : "退款取消"}
      </button>
    );
  }

  return <span style={{ color: "var(--ark-muted)" }}>—</span>;
}
