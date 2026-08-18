"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LayerCard } from "@/components/kumo";
import { apiPost } from "@/components/api";

export default function StockPanel({ stock }: { stock: number }) {
  const router = useRouter();
  const [delta, setDelta] = useState("100");
  const [loading, setLoading] = useState<"add" | "sub" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const change = async (sign: 1 | -1) => {
    const n = Number(delta);
    if (!Number.isInteger(n) || n <= 0) {
      setMsg("请输入正整数");
      return;
    }
    setLoading(sign === 1 ? "add" : "sub");
    setMsg(null);
    try {
      await apiPost("/api/admin/stock", { delta: n * sign }, "PATCH");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLoading(null);
    }
  };

  return (
    <LayerCard className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="ark-label">注册码库存(用户可买的名额)</div>
        <div
          className="ark-display text-3xl font-extrabold"
          style={{ color: stock > 0 ? "var(--ark-green)" : "var(--ark-red)" }}
        >
          {stock}
        </div>
        <p className="mt-1 text-xs" style={{ color: "var(--ark-muted)" }}>
          用户购买时原子扣减并自动发码;超时未付自动回补。
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-28">
          <Input
            label="调整数量"
            type="number"
            min={1}
            value={delta}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDelta(e.target.value)}
          />
        </div>
        <Button variant="primary" disabled={loading !== null} loading={loading === "add"} onClick={() => change(1)}>
          加库存
        </Button>
        <Button variant="secondary" disabled={loading !== null} loading={loading === "sub"} onClick={() => change(-1)}>
          减库存
        </Button>
      </div>
      {msg ? <div className="text-sm" style={{ color: "var(--ark-red)" }}>{msg}</div> : null}
    </LayerCard>
  );
}
