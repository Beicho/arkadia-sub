"use client";

import { useState } from "react";
import {
  TicketIcon,
  LightningIcon,
  ClockIcon,
  CheckCircleIcon,
} from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

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
    <div
      className="ark-card relative flex flex-col gap-4 p-6"
      style={{ borderColor: "color-mix(in srgb, var(--ark-accent) 30%, var(--ark-border))" }}
    >
      <div
        className="ark-chip ark-chip-accent absolute -top-3 left-5"
        style={{ background: "var(--ark-bg)" }}
      >
        推荐
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "var(--ark-surface-2)", color: "var(--ark-accent)" }}
          >
            <TicketIcon size={18} />
          </span>
          注册码
        </div>
        {soldOut ? (
          <span className="ark-chip ark-chip-red">已售罄</span>
        ) : (
          <span className="ark-chip ark-chip-green">余 {stock} 个名额</span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="ark-display text-4xl font-extrabold">{price}</span>
        <span className="text-sm" style={{ color: "var(--ark-muted)" }}>LDC</span>
      </div>

      <ul className="space-y-2.5 text-sm" style={{ color: "var(--ark-muted)" }}>
        <li className="flex gap-2">
          <CheckCircleIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
          兑换即激活,绑定你的 LinuxDo 账号
        </li>
        <li className="flex gap-2">
          <ClockIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
          赠送 {days} 天免费更新期,期间随便拉
        </li>
        <li className="flex gap-2">
          <LightningIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
          免费期后 {priceHint} LDC/次更新,额度永不过期
        </li>
        <li className="flex gap-2">
          <CheckCircleIcon size={15} className="mt-0.5 shrink-0" style={{ color: "var(--ark-green)" }} />
          专属订阅链接,节点名带日期(Arkadia-日期-序号)
        </li>
      </ul>

      {lastUpdate ? (
        <div className="ark-mono text-xs" style={{ color: "var(--ark-muted)" }}>
          站长最近更新批次:{lastUpdate}
        </div>
      ) : (
        <div className="ark-mono text-xs" style={{ color: "var(--ark-amber)" }}>
          站长尚未上传首批节点
        </div>
      )}

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

      <button className="ark-btn ark-btn-primary mt-auto w-full" disabled={soldOut} onClick={buy}>
        {loading ? "正在创建订单…" : soldOut ? "暂无库存,等补货" : `购买注册码 · ${price} LDC`}
      </button>

      <p className="text-center text-xs" style={{ color: "var(--ark-muted)" }}>
        无需注册,直接 LDC 支付,付款后立刻发码
      </p>
    </div>
  );
}
