"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";
import { apiPost } from "@/components/api";

type Action =
  | "ban"
  | "unban"
  | "add_days"
  | "reset_token"
  | "activate"
  | "deactivate";

export default function UserActions({
  id,
  banned,
  admin,
}: {
  id: number;
  banned: boolean;
  admin: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<Action | null>(null);
  const [showDays, setShowDays] = useState(false);
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");

  const run = async (action: Action, extra?: Record<string, unknown>) => {
    setLoading(action);
    try {
      await apiPost(`/api/admin/users/${id}`, { action, ...extra }, "PATCH");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLoading(null);
    }
  };

  const ban = () => {
    const r = reason.trim() || `管理员封禁 ${new Date().toLocaleDateString()}`;
    if (!confirm(`确定封禁该用户?原因:${r}`)) return;
    void run("ban", { reason: r });
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {banned ? (
        <Button
          variant="secondary"
          size="xs"
          loading={loading === "unban"}
          onClick={() => run("unban")}
        >
          解封
        </Button>
      ) : admin ? null : (
        <>
          <input
            className="w-28 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-600"
            placeholder="封禁原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="ghost"
            size="xs"
            loading={loading === "ban"}
            onClick={ban}
          >
            封禁
          </Button>
        </>
      )}
      <Button
        variant="secondary"
        size="xs"
        loading={loading === "add_days"}
        onClick={() => setShowDays((v) => !v)}
      >
        加/减天数
      </Button>
      {showDays ? (
        <span className="flex items-center gap-1">
          <input
            className="w-16 rounded border border-neutral-300 bg-transparent px-2 py-1 text-xs dark:border-neutral-600"
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <Button
            variant="secondary"
            size="xs"
            onClick={() => run("add_days", { days: Number(days) })}
          >
            确认
          </Button>
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        loading={loading === "reset_token"}
        onClick={() => {
          if (confirm("重置该用户订阅链接?旧链接立即作废。")) run("reset_token");
        }}
      >
        重置链接
      </Button>
      <Button
        variant="ghost"
        size="xs"
        loading={loading === "activate"}
        onClick={() => run("activate")}
      >
        强制激活
      </Button>
    </div>
  );
}
