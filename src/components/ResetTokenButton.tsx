"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/kumo";
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
    <Button
      variant="secondary"
      size="sm"
      icon={ArrowClockwiseIcon}
      loading={loading}
      onClick={reset}
    >
      重置链接
    </Button>
  );
}
