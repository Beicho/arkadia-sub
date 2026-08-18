"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@cloudflare/kumo/components/button";
import { apiPost } from "@/components/api";

export default function BatchActivateButton({
  id,
  active,
}: {
  id: number;
  active: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const action = active ? "deactivate" : "activate";
    if (action === "activate") {
      if (!confirm("激活该批次后,所有用户的订阅将立即下发这批节点。确定?")) return;
    }
    setLoading(true);
    try {
      await apiPost("/api/admin/nodes", { id, action }, "PATCH");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant={active ? "secondary" : "primary"} loading={loading} onClick={toggle}>
      {active ? "停用" : "激活"}
    </Button>
  );
}
