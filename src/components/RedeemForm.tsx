"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
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
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : null}
      <Button variant="primary" loading={loading} onClick={submit}>
        兑换并激活
      </Button>
    </div>
  );
}
