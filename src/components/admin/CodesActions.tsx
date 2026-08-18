"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/components/api";

export function GiftCodeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (!confirm("生成 1 个 gift 注册码(不占库存,兑换送激活天数)?")) return;
    setLoading(true);
    try {
      const res = await apiPost<{ codes: string[] }>("/api/admin/codes", {
        kind: "gift",
        count: 1,
      });
      alert(`已生成:${res.codes.join("\n")}`);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="ark-btn ark-btn-ghost ark-btn-sm" disabled={loading} onClick={create}>
      {loading ? "生成中…" : "生成 gift 码"}
    </button>
  );
}

export function VoidCodeButton({ id }: { id: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const voidCode = async () => {
    if (!confirm("作废后该码不可再兑换,确定?")) return;
    setLoading(true);
    try {
      await apiPost("/api/admin/codes", { id, action: "void" }, "PATCH");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button className="ark-btn ark-btn-danger ark-btn-sm" disabled={loading} onClick={voidCode}>
      {loading ? "…" : "作废"}
    </button>
  );
}
