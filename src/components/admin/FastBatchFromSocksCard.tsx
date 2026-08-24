"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, LayerCard } from "@/components/kumo";
import { LightningIcon, GiftIcon } from "@phosphor-icons/react";
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
          ? "确认：将直接创建包含最多 60 个健康代理的今日新批次并立即激活！"
          : "从健康池选择 30 个原生/家宽优选 + 30 个实测高速代理（不足自动回填），生成今日批次并激活。确定继续？",
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
        count: 60,
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
          <span>快捷流：从健康代理池一键生成并激活批次</span>
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
        自动选择最多 60 个已测可用代理：前 30 个优先原生/家宽，后 30 个按实测速度从所有 SOCKS5/HTTP 类型中择优；不足时自动回填。
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
          一键选取 60 个生成今日批次并激活
        </Button>
      </div>
    </LayerCard>
  );
}
