"use client";

import { useState } from "react";
import { apiPost } from "@/components/api";
import CopyField from "@/components/CopyField";

export default function CodeLookupForm() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setCode(null);
    setStatus(null);
    if (!query.trim()) {
      setError("请输入订单号或注册码");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost<{ code: string | null; status?: string; message?: string }>(
        "/api/code-lookup",
        { query: query.trim() },
      );
      if (res.code) {
        setCode(res.code);
        if (res.status) setStatus(res.status);
      } else {
        setError(res.message ?? "该注册码尚未支付");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="ark-label" htmlFor="lookup-q">订单号 / 注册码</label>
        <input
          id="lookup-q"
          className="ark-input ark-mono"
          placeholder="ARK20260818XXXXXX"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {error ? (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{
            background: "color-mix(in srgb, var(--ark-red) 12%, transparent)",
            color: "var(--ark-red)",
          }}
        >
          {error}
        </div>
      ) : null}
      <button className="ark-btn ark-btn-ghost" disabled={loading} onClick={submit}>
        {loading ? "查询中…" : "查询"}
      </button>
      {code ? (
        <CopyField value={code} label={status === "redeemed" ? "注册码(已兑换)" : "你的注册码"} />
      ) : null}
    </div>
  );
}
