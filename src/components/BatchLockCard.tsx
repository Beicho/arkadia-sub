"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockIcon, LockOpenIcon, ClockIcon } from "@phosphor-icons/react";
import { LayerCard, Switch, Button } from "@/components/kumo";
import { apiPost } from "@/components/api";
import { formatDate } from "@/lib/time";

export default function BatchLockCard({
  locked,
  lockedUntil,
  currentBatchDate,
}: {
  locked: boolean;
  lockedUntil?: Date | string | null;
  currentBatchDate: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = useState(locked);
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const parsedUntil = lockedUntil ? new Date(lockedUntil) : null;
  const isTimeLocked = on && parsedUntil && parsedUntil.getTime() > Date.now();

  const handleToggle = async (next: boolean, days?: number | null) => {
    setOn(next);
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const r = await apiPost<{ message: string }>("/api/me/lock-batch", {
        locked: next,
        days: next ? (days !== undefined ? days : selectedDays) : null,
      });
      setMsg(r.message);
      setShowConfig(false);
      router.refresh();
    } catch (e) {
      setOn(!next); // 失败回滚
      setErr(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  };

  const applyDuration = (days: number | null) => {
    setSelectedDays(days);
    void handleToggle(true, days);
  };

  return (
    <LayerCard className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-semibold">
            {on ? (
              <LockIcon size={16} style={{ color: "var(--ark-accent)" }} />
            ) : (
              <LockOpenIcon size={16} style={{ color: "var(--ark-muted)" }} />
            )}
            <span>锁定当前批次 / 暂停更新</span>
            {on ? (
              isTimeLocked ? (
                <span className="ark-chip ark-chip-accent flex items-center gap-1">
                  <ClockIcon size={12} />
                  暂停至 {formatDate(parsedUntil)}
                </span>
              ) : (
                <span className="ark-chip ark-chip-accent">永久锁定</span>
              )
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--ark-muted)" }}>
            {on
              ? `订阅只会下发${currentBatchDate ? ` ${currentBatchDate} ` : "当前"}批次；站长上传新批次后客户端刷新不会被动扣额度。`
              : "客户端若开启了自动更新，站长上传新批次时会被动扣 1 次额度。锁上可防止非自愿更新与扣费。"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {on ? (
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              className="text-xs cursor-pointer no-underline hover:opacity-80"
              style={{ color: "var(--ark-accent)" }}
            >
              {showConfig ? "收起时长" : "修改时长"}
            </button>
          ) : null}
          <Switch
            checked={on}
            onCheckedChange={(checked) => {
              if (checked) {
                setShowConfig(true);
                void handleToggle(true, null);
              } else {
                void handleToggle(false, null);
              }
            }}
            disabled={busy}
            variant="neutral"
          />
        </div>
      </div>

      {/* 快捷配置定时暂停时长 */}
      {(showConfig || (on && !isTimeLocked)) && (
        <div
          className="mt-4 rounded-xl border p-3.5 animate-in fade-in duration-150"
          style={{ background: "var(--ark-surface-2)", borderColor: "var(--ark-border)" }}
        >
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--ark-text)" }}>
            选择自动恢复更新的时间（到期自动解锁）:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { label: "暂停 1 天", days: 1 },
              { label: "暂停 3 天", days: 3 },
              { label: "暂停 7 天", days: 7 },
              { label: "暂停 15 天", days: 15 },
              { label: "暂停 30 天", days: 30 },
              { label: "一直锁定(手动解)", days: null },
            ].map((item) => (
              <button
                key={String(item.days)}
                type="button"
                disabled={busy}
                onClick={() => applyDuration(item.days)}
                className="cursor-pointer rounded-lg border px-2.5 py-1 text-xs transition-colors hover:border-[var(--ark-accent)]"
                style={{
                  background: "var(--ark-surface)",
                  borderColor: "var(--ark-border)",
                  color: "var(--ark-text)",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span style={{ color: "var(--ark-muted)" }}>自定义天数:</span>
            <input
              type="number"
              min="1"
              max="365"
              placeholder="天数"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              className="ark-input w-20 py-1 text-xs"
            />
            <Button
              variant="secondary"
              size="xs"
              disabled={busy || !customDays || Number(customDays) <= 0}
              onClick={() => applyDuration(Number(customDays))}
            >
              确定设定
            </Button>
          </div>
        </div>
      )}

      {msg ? (
        <p className="mt-2 text-xs" style={{ color: "var(--ark-green)" }}>{msg}</p>
      ) : null}
      {err ? (
        <p className="mt-2 text-xs" style={{ color: "var(--ark-red)" }}>{err}</p>
      ) : null}
    </LayerCard>
  );
}
