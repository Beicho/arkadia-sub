"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
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
    <div className="space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
      <div className="flex items-center justify-between">
        <div className="font-semibold">注册码库存</div>
        <div className="text-2xl font-bold">{stock}</div>
      </div>
      <div className="flex items-end gap-2">
        <div className="w-32">
          <Input
            label="调整数量"
            type="number"
            min={1}
            value={delta}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setDelta(e.target.value)
            }
          />
        </div>
        <Button
          variant="primary"
          loading={loading === "add"}
          onClick={() => change(1)}
        >
          加库存
        </Button>
        <Button
          variant="secondary"
          loading={loading === "sub"}
          onClick={() => change(-1)}
        >
          减库存
        </Button>
      </div>
      <p className="text-xs text-neutral-400">
        用户购买时系统从库存原子扣减并自动生成注册码;超时未付自动回补。
      </p>
      {msg ? <div className="text-sm text-red-600">{msg}</div> : null}
    </div>
  );
}
