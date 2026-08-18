"use client";

import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Badge } from "@cloudflare/kumo/components/badge";
import { TicketIcon } from "@phosphor-icons/react";
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
    <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <TicketIcon />
          注册码
        </div>
        {soldOut ? (
          <Badge variant="error">已售罄</Badge>
        ) : (
          <Badge variant="success">有货 · 库存 {stock}</Badge>
        )}
      </div>
      {lastUpdate ? (
        <div className="text-xs text-neutral-400">站长最近更新:{lastUpdate}</div>
      ) : (
        <div className="text-xs text-neutral-400">站长尚未上传节点批次</div>
      )}
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold">{price}</span>
        <span className="text-sm text-neutral-500">LDC</span>
      </div>
      <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
        <li>· 兑换后 {days} 天内更新免费,随便拉</li>
        <li>· 每天更新实测可用节点</li>
        <li>· 免费期后 {`${priceHint} LDC/次更新`},额度永不过期</li>
      </ul>
      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Button
        variant="primary"
        loading={loading}
        disabled={soldOut}
        onClick={buy}
      >
        {soldOut ? "暂无库存,等补货" : `购买注册码(${price} LDC)`}
      </Button>
      <p className="text-xs text-neutral-400">
        支付即视为同意 <a className="underline" href="/tos">不退款条款</a>;请保存好订单号与注册码。
      </p>
    </div>
  );
}
