"use client";

import { useState } from "react";
import { Button, Input, LayerCard, Switch } from "@/components/kumo";
import { CoinsIcon } from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

const QUICK = [1, 3, 5, 10, 30];

export default function RenewCard({
  pricePerUpdate,
  maxCredits,
  noRefundAccepted,
}: {
  pricePerUpdate: number;
  maxCredits: number;
  noRefundAccepted: boolean;
}) {
  const [credits, setCredits] = useState(1);
  const [accept, setAccept] = useState(noRefundAccepted);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ payUrl: string }>("/api/orders", {
        credits,
        acceptNoRefund: accept,
      });
      location.href = res.payUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "下单失败");
      setLoading(false);
    }
  };

  const amount = credits * pricePerUpdate;

  return (
    <LayerCard className="ark-card-lift flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <CoinsIcon size={18} style={{ color: "var(--ark-accent)" }} />
          购买更新额度
        </div>
        <span className="ark-mono text-xs" style={{ color: "var(--ark-muted)" }}>
          {pricePerUpdate} LDC / 次
        </span>
      </div>

      <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
        站长上传新批次后刷新订阅即得(扣 1 额度);额度永不过期,重复拉同一批不扣。
      </p>

      <div>
        <div className="ark-label">选择数量</div>
        <div className="flex flex-wrap gap-2">
          {QUICK.filter((q) => q <= maxCredits).map((q) => (
            <Button
              key={q}
              variant={credits === q ? "primary" : "secondary"}
              size="sm"
              onClick={() => setCredits(q)}
            >
              {q} 次
            </Button>
          ))}
          <div className="w-24">
            <Input
              type="number"
              min={1}
              max={maxCredits}
              value={String(credits)}
              aria-label="自定义额度数"
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const v = Number(e.target.value);
                setCredits(
                  Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 1), maxCredits) : 1,
                );
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-sm" style={{ color: "var(--ark-muted)" }}>
          {credits} 次更新 × {pricePerUpdate} LDC
        </span>
        <span className="ark-display text-2xl font-bold">
          {amount}
          <span className="ml-1 text-sm font-normal" style={{ color: "var(--ark-muted)" }}>LDC</span>
        </span>
      </div>

      {!noRefundAccepted ? (
        <label
          className="flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm"
          style={{
            background: "color-mix(in srgb, var(--ark-amber) 9%, transparent)",
            color: "var(--ark-amber)",
            border: "1px solid color-mix(in srgb, var(--ark-amber) 30%, transparent)",
          }}
        >
          <Switch checked={accept} onCheckedChange={setAccept} variant="neutral" />
          <span>
            我已阅读并同意
            <a href="/tos" target="_blank" rel="noreferrer" className="underline">
              《服务条款》
            </a>
            :本服务为虚拟商品,<b>支付后不退款</b>(无论是否使用)。
          </span>
        </label>
      ) : null}

      {error ? (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--ark-red) 12%, transparent)",
            color: "var(--ark-red)",
          }}
        >
          {error}
        </div>
      ) : null}

      <Button
        variant="primary"
        className="ark-pop w-full"
        loading={loading}
        disabled={!accept && !noRefundAccepted}
        onClick={pay}
      >
        支付 {amount} LDC
      </Button>
    </LayerCard>
  );
}
