"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, LockOpenIcon } from "@phosphor-icons/react";
import { LayerCard, Switch } from "@/components/kumo";
import { apiPost } from "@/components/api";

export default function BatchLockCard({
  locked,
  currentBatchDate,
}: {
  locked: boolean;
  currentBatchDate: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(locked);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await apiPost<{ message: string }>("/api/me/lock-batch", {
        locked: next,
      });
      setMsg(r.message);
      router.refresh();
    } catch (e) {
      setOn(!next); // 失败回滚
      setErr(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LayerCard className="flex items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-semibold">
          {on ? (
            <LockIcon size={16} style={{ color: "var(--ark-accent)" }} />
          ) : (
            <LockOpenIcon size={16} style={{ color: "var(--ark-muted)" }} />
          )}
          锁定当前批次
          {on ? (
            <span className="ark-chip ark-chip-accent">已锁定</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ark-muted)" }}>
          {on
            ? `订阅只会下发${currentBatchDate ? ` ${currentBatchDate} ` : "当前"}批次;站长上传新批次后,客户端自动更新不会扣费。想更新就回来解锁。`
            : "客户端若开了自动更新,站长传新批次时会被动扣 1 次额度。锁上可防止被动扣费。"}
        </p>
        {msg ? (
          <p className="mt-1.5 text-xs" style={{ color: "var(--ark-green)" }}>{msg}</p>
        ) : null}
        {err ? (
          <p className="mt-1.5 text-xs" style={{ color: "var(--ark-red)" }}>{err}</p>
        ) : null}
      </div>
      <Switch checked={on} onCheckedChange={toggle} disabled={busy} variant="neutral" />
    </LayerCard>
  );
}
