"use client";

import { useState } from "react";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
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
      <Input
        label="订单号 / 注册码"
        placeholder="ARK20260818XXXXXX"
        value={query}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
      />
      {error ? (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Button variant="secondary" loading={loading} onClick={submit}>
        查询
      </Button>
      {code ? (
        <div className="space-y-2">
          <CopyField value={code} label={status === "redeemed" ? "注册码(已兑换)" : "你的注册码"} />
        </div>
      ) : null}
    </div>
  );
}
