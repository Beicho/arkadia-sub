"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
        <button
          className="ark-btn ark-btn-ghost ark-btn-sm"
          disabled={loading !== null}
          onClick={() => run("unban")}
        >
          {loading === "unban" ? "…" : "解封"}
        </button>
      ) : admin ? (
        <span className="text-xs" style={{ color: "var(--ark-muted)" }}>—</span>
      ) : (
        <>
          <input
            className="w-24 rounded-lg px-2 py-1 text-xs"
            style={{
              border: "1px solid var(--ark-border-strong)",
              background: "var(--ark-bg)",
              color: "var(--ark-text)",
            }}
            placeholder="封禁原因"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="ark-btn ark-btn-danger ark-btn-sm"
            disabled={loading !== null}
            onClick={ban}
          >
            {loading === "ban" ? "…" : "封禁"}
          </button>
        </>
      )}
      <button
        className="ark-btn ark-btn-ghost ark-btn-sm"
        onClick={() => {
          setShowDays((v) => !v);
          setShowCredits(false);
        }}
      >
        免费天
      </button>
      {showDays ? (
        <span className="flex items-center gap-1">
          <input
            className="ark-input w-16 px-2 py-1 text-xs"
            type="number"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <button
            className="ark-btn ark-btn-ghost ark-btn-sm"
            disabled={loading !== null}
            onClick={() => run("add_days", { days: Number(days) })}
          >
            确认
          </button>
        </span>
      ) : null}
      <button
        className="ark-btn ark-btn-ghost ark-btn-sm"
        onClick={() => {
          setShowCredits((v) => !v);
          setShowDays(false);
        }}
      >
        额度
      </button>
      {showCredits ? (
        <span className="flex items-center gap-1">
          <input
            className="ark-input w-16 px-2 py-1 text-xs"
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
          />
          <button
            className="ark-btn ark-btn-ghost ark-btn-sm"
            disabled={loading !== null}
            onClick={() => run("add_credits", { credits: Number(credits) })}
          >
            确认
          </button>
        </span>
      ) : null}
      <button
        className="ark-btn ark-btn-ghost ark-btn-sm"
        disabled={loading !== null}
        onClick={() => {
          if (confirm("重置该用户订阅链接?旧链接立即作废。")) run("reset_token");
        }}
      >
        {loading === "reset_token" ? "…" : "重置链接"}
      </button>
      <button
        className="ark-btn ark-btn-ghost ark-btn-sm"
        disabled={loading !== null}
        onClick={() => run("activate")}
      >
        强制激活
      </button>
    </div>
  );
}
