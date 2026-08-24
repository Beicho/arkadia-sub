"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/components/api";
import { Button, Input, LayerCard, Switch } from "@/components/kumo";
import type {
  SubscriptionSyncConfig,
  SubscriptionSyncStatus,
} from "@/lib/subscription-sync";

type PublicStatus = Omit<SubscriptionSyncStatus, "contentHash">;

export default function SubscriptionSyncCard({
  initialConfig,
  initialStatus,
}: {
  initialConfig: SubscriptionSyncConfig;
  initialStatus: PublicStatus;
}) {
  const router = useRouter();
  const [sourceUrl, setSourceUrl] = useState(initialConfig.sourceUrl);
  const [enabled, setEnabled] = useState(initialConfig.enabled);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await apiPost("/api/admin/subscription-sync", { sourceUrl, enabled }, "PUT");
      setMessage("同步设置已保存");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      // 先保存当前输入，避免管理员编辑 URL 后误同步旧配置。
      await apiPost("/api/admin/subscription-sync", { sourceUrl, enabled }, "PUT");
      const result = await apiPost<{
        outcome: "created" | "unchanged";
        batchId: number | null;
        upstreamNodeCount: number;
        extraNodeCount: number;
        totalNodeCount: number;
      }>("/api/admin/subscription-sync");
      setMessage(
        result.outcome === "created"
          ? `同步完成：上游 ${result.upstreamNodeCount} 个 + 福利代理 ${result.extraNodeCount} 个，去重后共 ${result.totalNodeCount} 个，已原子切换激活。`
          : `上游与福利代理组合未变化（共 ${result.totalNodeCount} 个），继续使用当前批次。`,
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  };

  const statusTone =
    initialStatus.state === "failed"
      ? "var(--ark-red)"
      : initialStatus.state === "success" || initialStatus.state === "unchanged"
        ? "var(--ark-green)"
        : "var(--ark-muted)";

  return (
    <LayerCard className="relative overflow-hidden p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{ background: "var(--ark-accent)" }}
      />
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-semibold">上游订阅自动同步</div>
            <p className="mt-1 text-xs" style={{ color: "var(--ark-muted)" }}>
              每 4 小时全量拉取订阅，并自动加入最多 60 个已测福利代理；创建新批次后原子切换激活。
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              variant="neutral"
            />
            <span>{enabled ? "自动同步已开启" : "自动同步已暂停"}</span>
          </div>
        </div>

        <Input
          label="上游订阅地址（留空保存时使用系统默认地址）"
          value={sourceUrl}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setSourceUrl(event.target.value)
          }
          placeholder="https://example.com/subscription"
        />

        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <StatusItem label="最近尝试" value={formatStatusTime(initialStatus.lastAttemptAt)} />
          <StatusItem label="最近成功" value={formatStatusTime(initialStatus.lastSuccessAt)} />
          <StatusItem
            label="最近结果"
            value={
              initialStatus.state === "success"
                ? `上游 ${initialStatus.upstreamNodeCount} + 福利 ${initialStatus.extraNodeCount}，共 ${initialStatus.totalNodeCount} 个，批次 #${initialStatus.lastBatchId ?? "—"}`
                : initialStatus.state === "unchanged"
                  ? `${initialStatus.totalNodeCount} 个节点，无变化`
                  : initialStatus.state === "failed"
                    ? initialStatus.error || "同步失败"
                    : "尚未运行"
            }
            color={statusTone}
          />
        </div>

        {error ? <div className="text-sm" style={{ color: "var(--ark-red)" }}>{error}</div> : null}
        {message ? <div className="text-sm" style={{ color: "var(--ark-green)" }}>{message}</div> : null}

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" loading={syncing} onClick={syncNow}>
            保存并立即同步
          </Button>
          <Button variant="secondary" loading={saving} onClick={save}>
            保存设置
          </Button>
        </div>
      </div>
    </LayerCard>
  );
}

function StatusItem({
  label,
  value,
  color = "var(--ark-text)",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "color-mix(in srgb, var(--ark-surface) 70%, transparent)" }}
    >
      <div style={{ color: "var(--ark-muted)" }}>{label}</div>
      <div className="mt-1 break-words font-medium" style={{ color }}>{value}</div>
    </div>
  );
}

function formatStatusTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
