"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";
import { apiPost } from "@/components/api";

export default function ReconcileButton({ id }: { id: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const run = async (forceExpire: boolean) => {
    setLoading(true);
    try {
      await apiPost(`/api/admin/orders/${id}/reconcile`, { forceExpire });
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "对账失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-1">
      <Button
        variant="secondary"
        size="xs"
        loading={loading}
        onClick={() => run(false)}
      >
        对账
      </Button>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          if (confirm("强制过期将标记订单失效并回补库存,确定?")) run(true);
        }}
      >
        强制过期
      </Button>
    </div>
  );
}
