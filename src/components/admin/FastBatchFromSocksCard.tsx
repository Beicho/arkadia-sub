"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LayerCard } from "@/components/kumo";
import { LightningIcon, ArrowsClockwiseIcon, GiftIcon } from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

export default function FastBatchFromSocksCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const generateBatch = async (force = false) => {
    if (
      !confirm(
        force
          ? "确认：将直接创建包含 30 个健康 Socks5 节点的今日新批次并立即激活！"
          : "从后台 SOCKS5 健康池挑选延迟最低且原生/家宽的 Top 30 节点，一键生成今日批次并激活生效。确定继续？",
      )
    ) {
      return;
    }

    setLoading(true);
    setMsg(null);
    setErr(null);

    try {
      const r = await apiPost<{ message: string; added: string[] }>("/api/admin/socks", {
        action: "create_batch",
        count: 30,
        force,
      });
      setMsg(r.message);
      router.refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "生成批次失败";
      if (m.includes("确认继续")) {
        if (confirm(`${m}\n\n(二次确认，将直接替换当前下发内容)`)) {
          setLoading(false);
          return void generateBatch(true);
        }
        setErr("已取消");
      } else {
        setErr(m);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LayerCard className="space-y-3 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <GiftIcon size={18} style={{ color: "var(--ark-accent)" }} />
          <span>快捷流：从健康 SOCKS5 池一键生成并激活批次</span>
        </div>
        <a
          href="/admin/socks"
          className="text-xs no-underline hover:underline"
          style={{ color: "var(--ark-accent)" }}
        >
          查看代理池详情 →
        </a>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: "var(--ark-muted)" }}>
        无需手动复制粘贴。系统将自动选取经过测活巡检、可用且延迟最优的前 30 个 SOCKS5/HTTP 节点，自动格式化命名并打包生成今日批次直接激活。
      </p>

      {err ? <p className="text-xs" style={{ color: "var(--ark-red)" }}>{err}</p> : null}
      {msg ? <p className="text-xs" style={{ color: "var(--ark-green)" }}>{msg}</p> : null}

      <div className="pt-1">
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          icon={LightningIcon}
          onClick={() => generateBatch(false)}
        >
          一键选取 Top 30 生成今日批次并激活
        </Button>
      </div>
    </LayerCard>
  );
}
