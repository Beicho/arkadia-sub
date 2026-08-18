"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LayerCard } from "@/components/kumo";
import { apiPost } from "@/components/api";

export default function BatchForm({
  expectedCount,
  today,
}: {
  expectedCount: number;
  today: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [batchDate, setBatchDate] = useState(today);
  const [force, setForce] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [needForce, setNeedForce] = useState(false);

  const submit = async () => {
    setErr(null);
    setMsg(null);
    if (!text.trim()) {
      setErr("请粘贴节点内容");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<{ count: number }>("/api/admin/nodes", {
        title: title || undefined,
        text,
        batchDate,
        force,
      });
      setMsg(`已创建批次(共 ${res.count} 个节点),到下方列表点「激活」生效。`);
      setText("");
      setForce(false);
      setNeedForce(false);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "上传失败";
      setErr(message);
      if (message.includes("强制上传")) setNeedForce(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LayerCard className="space-y-4 p-6">
      <div className="font-semibold">上传节点批次</div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="批次标题(可选)"
          placeholder="如:8月18日 30 个"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        />
        <Input
          label="批次日期(订阅名带该日期)"
          type="date"
          value={batchDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatchDate(e.target.value)}
        />
      </div>
      <div>
        <div className="ark-label">
          节点列表 —— 一行一个(vless:// / hysteria2:// / vmess:// / ss:// 等;支持整段 base64)
        </div>
        <textarea
          className="ark-input ark-mono h-48 resize-y text-xs"
          placeholder={"vless://...\nhysteria2://...\nss://..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div
          className="mt-1.5 flex items-center justify-between text-xs"
          style={{ color: "var(--ark-muted)" }}
        >
          <span>期望 {expectedCount} 个;数量不符会被拦截</span>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="h-3.5 w-3.5"
              style={{ accentColor: "var(--ark-accent)" }}
            />
            强制上传
          </label>
        </div>
      </div>
      {err ? (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--ark-red) 12%, transparent)",
            color: "var(--ark-red)",
          }}
        >
          {err}
        </div>
      ) : null}
      {msg ? (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--ark-green) 12%, transparent)",
            color: "var(--ark-green)",
          }}
        >
          {msg}
        </div>
      ) : null}
      <Button variant="primary" loading={loading} onClick={submit}>
        {needForce && !force ? "数量不符 — 勾选强制后重试" : "创建批次"}
      </Button>
    </LayerCard>
  );
}
