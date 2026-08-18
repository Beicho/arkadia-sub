"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/components/api";

export default function RedeemForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!code.trim()) {
      setError("请输入注册码");
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/redeem", { code: code.trim() });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "兑换失败");
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="ark-label" htmlFor="redeem-code">注册码</label>
        <input
          id="redeem-code"
          className="ark-input ark-mono"
          placeholder="ARK-XXXX-XXXX-XXXX"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
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
      <button className="ark-btn ark-btn-primary w-full" disabled={loading} onClick={submit}>
        {loading ? "兑换中…" : "兑换并激活"}
      </button>
    </div>
  );
}
