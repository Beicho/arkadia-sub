"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, LayerCard, StatusChip } from "@/components/kumo";
import { UploadSimpleIcon, LightningIcon, MergeIcon } from "@phosphor-icons/react";
import { apiGet, apiPost } from "@/components/api";

type Top = {
  host: string;
  port: number;
  tags: string[];
  country: string | null;
  provider: string | null;
  riskScore: number | null;
  latencyMs: number | null;
  name: string;
};

type Status = {
  run: { running: boolean; total: number; done: number; ok: number; fail: number };
  summary: { total: number; ok: number; fail: number; untested: number };
  top: Top[];
};

export default function SocksPoolPanel() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await apiGet<Status>("/api/admin/socks");
      setStatus(s);
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 测活运行中每 3s 轮询
  useEffect(() => {
    if (status?.run.running) {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => void refresh(), 3000);
      }
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status?.run.running, refresh]);

  const onFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setErr("文件超过 5MB,请分批");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setText((prev) => (prev ? `${prev}\n${reader.result}` : String(reader.result)));
      setErr(null);
    };
    reader.readAsText(f);
  };

  const doImport = async () => {
    if (!text.trim()) return setErr("先粘贴或上传代理文件");
    setBusy("import");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string }>("/api/admin/socks", {
        action: "import",
        text,
      });
      setMsg(r.message);
      setText("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(null);
    }
  };

  const doTest = async () => {
    setBusy("test");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string }>("/api/admin/socks", {
        action: "test",
      });
      setMsg(r.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "启动失败");
    } finally {
      setBusy(null);
    }
  };

  const doMerge = async () => {
    const n = status?.summary.ok ?? 0;
    if (n === 0) return setErr("没有可用代理");
    if (
      !confirm(
        `把可用代理中质量最高的 30 个并入当前激活批次(同日已拉过的用户刷新不扣额度)。确定?`,
      )
    )
      return;
    setBusy("merge");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string; added: string[] }>(
        "/api/admin/socks",
        { action: "merge", count: 30 },
      );
      setMsg(`${r.message}\n并入节点:\n${r.added.join("\n")}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "合并失败");
    } finally {
      setBusy(null);
    }
  };

  const run = status?.run;
  const pct = run && run.total > 0 ? Math.round((run.done / run.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <LayerCard className="space-y-4 p-6">
        <div className="font-semibold">导入代理文件</div>
        <p className="text-sm" style={{ color: "var(--ark-muted)" }}>
          每行一条 socks5://;自动过滤只保留 原生IP/家宽 且风险分 &lt;10 的;
          同 host:port 自动去重。支持直接粘贴或上传 txt。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,text/plain"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={UploadSimpleIcon}
            onClick={() => fileRef.current?.click()}
          >
            选择文件
          </Button>
          <span className="text-xs" style={{ color: "var(--ark-muted)" }}>
            单次上限 5MB(约 6 万行)
          </span>
        </div>
        <textarea
          className="ark-input ark-mono h-40 resize-y text-xs"
          placeholder={
            "socks5://38.252.8.57:1080 [原生IP] 美国 [美国 得克萨斯州 休斯敦] 入库:2026-08-18 17:34:30\nsocks5://89.148.196.156:1080 [家宽][高风险84] 俄罗斯 [俄罗斯 彼尔姆边疆区 彼尔姆] 入库:…"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {err ? (
          <div
            className="rounded-lg px-3 py-2 text-sm"
            style={{
              background: "color-mix(in srgb, var(--ark-red) 12%, transparent)",
              color: "var(--ark-red)",
            }}
          >
            {err}
          </div>
        ) : null}
        {msg ? (
          <div
            className="whitespace-pre-wrap rounded-lg px-3 py-2 text-xs"
            style={{
              background: "color-mix(in srgb, var(--ark-green) 10%, transparent)",
              color: "var(--ark-green)",
            }}
          >
            {msg}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" loading={busy === "import"} onClick={doImport}>
            导入解析
          </Button>
        </div>
      </LayerCard>

      <LayerCard className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold">测活与并入</div>
          {status ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <StatusChip>池 {status.summary.total}</StatusChip>
              <StatusChip tone="green">可用 {status.summary.ok}</StatusChip>
              <StatusChip tone="red">失败 {status.summary.fail}</StatusChip>
              <StatusChip tone="amber">未测 {status.summary.untested}</StatusChip>
            </div>
          ) : null}
        </div>

        {run?.running ? (
          <div className="space-y-2">
            <div
              className="h-2 w-full overflow-hidden rounded-full"
              style={{ background: "var(--ark-surface-2)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: "var(--ark-accent)",
                }}
              />
            </div>
            <div className="text-xs" style={{ color: "var(--ark-muted)" }}>
              测活中 {run.done}/{run.total}({pct}%)· 成功 {run.ok} · 失败 {run.fail}
              · 100 并发
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={LightningIcon}
            loading={busy === "test"}
            disabled={run?.running || (status?.summary.untested ?? 0) === 0}
            onClick={doTest}
          >
            {run?.running ? "测活中…" : "开始测活"}
          </Button>
          <Button
            variant="primary"
            icon={MergeIcon}
            loading={busy === "merge"}
            disabled={run?.running || (status?.summary.ok ?? 0) === 0}
            onClick={doMerge}
          >
            挑 30 个并入今日批次
          </Button>
        </div>
        <p className="text-xs" style={{ color: "var(--ark-muted)" }}>
          并入会生成新批次(原节点保留 + SOCKS5 追加),**同日期**内已拉过的用户再刷新
          不扣更新额度——福利加量免费。
        </p>
      </LayerCard>

      {status && status.top.length > 0 ? (
        <LayerCard className="overflow-x-auto p-0">
          <table className="ark-table">
            <thead>
              <tr>
                <th>节点名(并入后)</th>
                <th>地址</th>
                <th>地区</th>
                <th>标签</th>
                <th>延迟</th>
              </tr>
            </thead>
            <tbody>
              {status.top.map((t) => (
                <tr key={`${t.host}:${t.port}`}>
                  <td>{t.name}</td>
                  <td className="ark-mono text-xs">
                    {t.host}:{t.port}
                  </td>
                  <td>
                    {t.country}
                    {t.provider ? ` · ${t.provider}` : ""}
                  </td>
                  <td className="text-xs">{t.tags.join("/")}</td>
                  <td className="ark-mono">
                    {t.latencyMs != null ? `${t.latencyMs}ms` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </LayerCard>
      ) : null}
    </div>
  );
}
