"use client";

import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Switch } from "@cloudflare/kumo/components/switch";
import { apiPost } from "@/components/api";

export default function RenewCard({
  pricePerDay,
  maxDays,
  noRefundAccepted,
}: {
  pricePerDay: number;
  maxDays: number;
  noRefundAccepted: boolean;
}) {
  const [days, setDays] = useState(1);
  const [accept, setAccept] = useState(noRefundAccepted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ payUrl: string }>("/api/orders", {
        days,
        acceptNoRefund: accept,
      });
      location.href = res.payUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "下单失败");
      setLoading(false);
    }
  };

  const amount = days * pricePerDay;

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
      <div className="font-semibold">续费订阅</div>
      <div className="grid grid-cols-2 items-end gap-3">
        <Input
          label="天数"
          type="number"
          min={1}
          max={maxDays}
          value={String(days)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const v = Number(e.target.value);
            setDays(Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 1), maxDays) : 1);
          }}
        />
        <div className="pb-2 text-sm text-neutral-500">
          单价 {pricePerDay} LDC/天
        </div>
      </div>
      <div className="text-lg font-semibold">
        合计:<span className="text-primary">{amount}</span> LDC
      </div>

      {!noRefundAccepted ? (
        <label className="flex items-start gap-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <Switch checked={accept} onCheckedChange={setAccept} />
          <span>
            我已阅读并同意
            <a href="/tos" className="underline" target="_blank" rel="noreferrer">
              《服务条款》
            </a>
            :本服务为虚拟商品,<b>支付后不退款</b>(无论是否使用)。
          </span>
        </label>
      ) : null}

      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}

      <Button variant="primary" loading={loading} disabled={!accept} onClick={pay}>
        支付 {amount} LDC
      </Button>
    </div>
  );
}
