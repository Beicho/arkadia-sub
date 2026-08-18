"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@/components/kumo";
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
      <Input
        label="注册码"
        placeholder="ARK-XXXX-XXXX-XXXX"
        value={code}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setCode(e.target.value.toUpperCase())
        }
      />
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
      <Button variant="primary" loading={loading} onClick={submit} className="w-full">
        兑换并激活
      </Button>
    </div>
  );
}
