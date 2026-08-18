"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

export default function ResetTokenButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const reset = async () => {
    if (!confirm("重置后旧订阅链接立即作废,所有客户端需更换新链接。确定?")) return;
    setLoading(true);
    try {
      await apiPost("/api/me/reset-token");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="ark-btn ark-btn-ghost ark-btn-sm" disabled={loading} onClick={reset}>
      <ArrowClockwiseIcon size={14} />
      {loading ? "重置中…" : "重置链接"}
    </button>
  );
}
