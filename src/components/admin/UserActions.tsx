"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/kumo";
import { apiPost } from "@/components/api";

type Action =
  | "ban"
  | "unban"
  | "add_days"
  | "add_credits"
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
  const [showCredits, setShowCredits] = useState(false);
  const [days, setDays] = useState("1");
  const [credits, setCredits] = useState("1");
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
    <div className="flex flex-wrap items-center gap-1.5">
      {banned ? (
        <Button
          variant="secondary"
          size="xs"
          loading={loading === "unban"}
          disabled={loading !== null}
          onClick={() => run("unban")}
        >
          解封
        </Button>
      ) : admin ? (
        <span className="text-xs" style={{ color: "var(--ark-muted)" }}>—</span>
      ) : (
        <>
          <div className="w-28">
            <Input
              placeholder="封禁原因"
              value={reason}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
            />
          </div>
          <Button
            variant="secondary-destructive"
            size="xs"
            loading={loading === "ban"}
            disabled={loading !== null}
            onClick={ban}
          >
            封禁
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setShowDays((v) => !v);
          setShowCredits(false);
        }}
      >
        免费天
      </Button>
      {showDays ? (
        <span className="flex items-center gap-1">
          <div className="w-16">
            <Input
              type="number"
              value={days}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDays(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="xs"
            disabled={loading !== null}
            onClick={() => run("add_days", { days: Number(days) })}
          >
            确认
          </Button>
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        onClick={() => {
          setShowCredits((v) => !v);
          setShowDays(false);
        }}
      >
        额度
      </Button>
      {showCredits ? (
        <span className="flex items-center gap-1">
          <div className="w-16">
            <Input
              type="number"
              value={credits}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCredits(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            size="xs"
            disabled={loading !== null}
            onClick={() => run("add_credits", { credits: Number(credits) })}
          >
            确认
          </Button>
        </span>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        loading={loading === "reset_token"}
        disabled={loading !== null}
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
        disabled={loading !== null}
        onClick={() => run("activate")}
      >
        强制激活
      </Button>
    </div>
  );
}
