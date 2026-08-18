"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/kumo";
import { DownloadSimpleIcon, TicketIcon } from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

export function GiftCodeButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const create = async () => {
    const input = prompt("生成多少个 gift 注册码?(1-100,不占库存)", "5");
    if (input === null) return;
    const count = Math.min(Math.max(Number(input) || 0, 1), 100);
    if (!confirm(`生成 ${count} 个 gift 注册码(不占库存,兑换送激活天数)。确定?`))
      return;
    setLoading(true);
    try {
      const res = await apiPost<{ codes: string[] }>("/api/admin/codes", {
        kind: "gift",
        count,
      });
      alert(`已生成 ${res.codes.length} 个:\n${res.codes.join("\n")}`);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" icon={TicketIcon} loading={loading} onClick={create}>
      批量生成 gift 码
    </Button>
  );
}

export function ExportCodesButton() {
  const download = async () => {
    try {
      const res = await fetch("/api/admin/codes");
      if (!res.ok) throw new Error(`导出失败(${res.status})`);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "arkadia-codes.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e instanceof Error ? e.message : "导出失败");
    }
  };
  return (
    <Button variant="ghost" size="sm" icon={DownloadSimpleIcon} onClick={download}>
      导出未使用码
    </Button>
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
    <Button variant="ghost" size="xs" loading={loading} onClick={voidCode}>
      作废
    </Button>
  );
}
