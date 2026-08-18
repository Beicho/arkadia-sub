"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, LayerCard } from "@/components/kumo";
import { MegaphoneIcon } from "@phosphor-icons/react";
import { apiPost } from "@/components/api";

export type AnnouncementRow = {
  id: number;
  content: string;
  level: string;
  isActive: boolean;
  createdAt: string;
};

const LEVEL_TEXT: Record<string, string> = {
  info: "普通",
  warning: "提醒",
  alert: "紧急",
};

export default function AnnouncementPanel({
  rows,
}: {
  rows: AnnouncementRow[];
}) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [level, setLevel] = useState<"info" | "warning" | "alert">("info");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const publish = async () => {
    if (!content.trim()) return setErr("写点内容");
    setLoading(true);
    setErr(null);
    try {
      await apiPost("/api/admin/announcements", { content: content.trim(), level });
      setContent("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "发布失败");
    } finally {
      setLoading(false);
    }
  };

  const act = async (id: number, action: "activate" | "deactivate" | "delete") => {
    if (action === "delete" && !confirm("删除该公告?")) return;
    try {
      await apiPost("/api/admin/announcements", { id, action }, "PATCH");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败");
    }
  };

  return (
    <div className="space-y-6">
      <LayerCard className="space-y-4 p-6">
        <div className="flex items-center gap-2 font-semibold">
          <MegaphoneIcon size={18} style={{ color: "var(--ark-accent)" }} />
          发布公告
        </div>
        <div>
          <label className="ark-label" htmlFor="ann-content">内容(用户面板顶部横幅)</label>
          <textarea
            id="ann-content"
            className="ark-input h-24 resize-y"
            placeholder="如:今日批次已更新;最近封锁严重,已追加 SOCKS5 福利节点…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32">
            <label className="ark-label" htmlFor="ann-level">级别</label>
            <select
              id="ann-level"
              className="ark-input"
              value={level}
              onChange={(e) => setLevel(e.target.value as typeof level)}
            >
              <option value="info">普通(蓝)</option>
              <option value="warning">提醒(橙)</option>
              <option value="alert">紧急(红)</option>
            </select>
          </div>
          <Button variant="primary" loading={loading} onClick={publish}>
            发布
          </Button>
        </div>
        {err ? <div className="text-sm" style={{ color: "var(--ark-red)" }}>{err}</div> : null}
      </LayerCard>

      <LayerCard className="space-y-3 p-6">
        <div className="font-semibold">历史公告({rows.length})</div>
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ark-muted)" }}>还没有发过公告。</p>
        ) : (
          <div className="ark-scroll-x">
            <table className="ark-table">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>级别</th>
                  <th>内容</th>
                  <th>发布时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className={r.isActive ? "ark-chip ark-chip-green" : "ark-chip"}>
                        {r.isActive ? "生效中" : "已停用"}
                      </span>
                    </td>
                    <td>{LEVEL_TEXT[r.level] ?? r.level}</td>
                    <td className="max-w-md">{r.content}</td>
                    <td className="whitespace-nowrap text-xs">{r.createdAt}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => act(r.id, r.isActive ? "deactivate" : "activate")}
                        >
                          {r.isActive ? "停用" : "启用"}
                        </Button>
                        <Button variant="ghost" size="xs" onClick={() => act(r.id, "delete")}>
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LayerCard>
    </div>
  );
}
