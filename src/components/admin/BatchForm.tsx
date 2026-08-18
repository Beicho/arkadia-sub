"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
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
      setMsg(`已创建批次,共 ${res.count} 个节点。去下方列表点"激活"。`);
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
    <div className="space-y-3 rounded-xl border border-neutral-200 p-5 dark:border-neutral-700">
      <div className="font-semibold">上传节点批次(一行一个)</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="批次标题(可选)"
          placeholder="如:8月18日 30 个"
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        />
        <Input
          label="批次日期(用于节点命名 Arkadia-日期-序号)"
          type="date"
          value={batchDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBatchDate(e.target.value)}
        />
      </div>
      <div>
        <div className="mb-1 text-sm text-neutral-500">
          节点列表(vless:// / hysteria2:// / vmess:// / ss:// 等,一行一个;也支持整段 base64)
        </div>
        <textarea
          className="h-48 w-full rounded-md border border-neutral-300 bg-transparent p-3 font-mono text-xs dark:border-neutral-600"
          placeholder={"vless://...\nhysteria2://...\nss://..."}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-1 text-xs text-neutral-400">
          期望 {expectedCount} 个节点,数量不符会被拦截。
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={force}
          onChange={(e) => setForce(e.target.checked)}
        />
        强制上传(数量不符也提交)
      </label>
      {err ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {err}
        </div>
      ) : null}
      {msg ? (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          {msg}
        </div>
      ) : null}
      <Button variant="primary" loading={loading} onClick={submit}>
        {needForce && !force ? "数量不符 — 勾选强制后重试" : "创建批次"}
      </Button>
    </div>
  );
}
