"use client";

import { useState } from "react";
import { Button, Badge, LayerCard } from "@/components/kumo";
import {
  TicketIcon,
  LightningIcon,
  ClockIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

const FEATS = [
  { icon: CheckCircleIcon, text: "兑换即激活,绑定你的 LinuxDo 账号" },
  { icon: ClockIcon, text: "赠送天数内免费更新,期间随便拉" },
  { icon: LightningIcon, text: "免费期后按次更新,额度永不过期" },
  { icon: CheckCircleIcon, text: "专属订阅链接,订阅名自动带批次日期" },
];

export default function BuyActivationCard({
  price,
  days,
  stock,
  priceHint,
  lastUpdate,
}: {
  price: number;
  days: number;
  stock: number;
  priceHint: number;
  lastUpdate: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buy = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ payUrl: string }>("/api/orders/activation");
      location.href = res.payUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "下单失败");
      setLoading(false);
    }
  };

  const soldOut = stock <= 0;

  return (
    <LayerCard className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <TicketIcon size={18} style={{ color: "var(--ark-accent)" }} />
          注册码
        </div>
        {soldOut ? (
          <Badge variant="error">已售罄</Badge>
        ) : (
          <Badge variant="success">余 {stock} 个名额</Badge>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="ark-display text-4xl font-extrabold">{price}</span>
        <span className="text-sm" style={{ color: "var(--ark-muted)" }}>LDC</span>
      </div>

      <ul className="space-y-2.5 text-sm" style={{ color: "var(--ark-muted)" }}>
        {FEATS.map((f) => (
          <li key={f.text} className="flex gap-2">
            <f.icon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
            {f.text}
          </li>
        ))}
      </ul>

      <div className="ark-mono text-xs" style={{ color: lastUpdate ? "var(--ark-muted)" : "var(--ark-amber)" }}>
        {lastUpdate ? `站长最近更新批次:${lastUpdate}` : "站长尚未上传首批节点"}
      </div>

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

      <Button variant="primary" className="ark-pop mt-auto w-full" loading={loading} disabled={soldOut} onClick={buy}>
        {soldOut ? "暂无库存,等补货" : `购买注册码 · ${price} LDC`}
      </Button>
      <p className="text-center text-xs" style={{ color: "var(--ark-muted)" }}>
        无需注册,直接 LDC 支付,付款后立刻发码;免费期后 {priceHint} LDC/次更新
      </p>
    </LayerCard>
  );
}
