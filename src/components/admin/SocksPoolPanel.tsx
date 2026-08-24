"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, LayerCard } from "@/components/kumo";
import StatusChip from "@/components/admin/StatusChip";
import {
  UploadSimpleIcon,
  LightningIcon,
  PlusIcon,
  ArrowsClockwiseIcon,
} from "@phosphor-icons/react";
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
  run: {
    running: boolean;
    scope: TestScope | null;
    total: number;
    done: number;
    ok: number;
    fail: number;
  };
  summary: {
    total: number;
    ok: number;
    fail: number;
    untested: number;
    preferred: number;
    other: number;
  };
  mergedToday?: number;
  top: Top[];
};

type TestScope = "untested" | "failed" | "all";

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
      const r = await apiPost<{ message: string; badSamples?: string[] }>(
        "/api/admin/socks",
        { action: "import", text },
      );
      setMsg(
        r.badSamples?.length
          ? `${r.message}\n\n未识别样本(发给开发者可修解析):\n${r.badSamples.join("\n")}`
          : r.message,
      );
      setText("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(null);
    }
  };

  const doTest = async (scope: TestScope) => {
    if (
      scope === "all" &&
      !confirm("重新测试代理池里的全部节点?旧的可用状态和延迟会被本轮结果覆盖。")
    ) {
      return;
    }
    setBusy(`test-${scope}`);
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string }>("/api/admin/socks", {
        action: "test",
        scope,
      });
      setMsg(r.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "启动失败");
    } finally {
      setBusy(null);
    }
  };

  const doMerge = async (force = false) => {
    const n = status?.summary.ok ?? 0;
    if (n === 0) return setErr("没有可用代理");
    if (
      !confirm(
        force
          ? `⚠ 二次确认:今日批次已有福利代理,将再追加最多 60 个(重复自动跳过)。真的要追加吗?`
          : `把 30 个原生/家宽优选 + 30 个实测高速代理并入当前激活批次(不足时自动回填,最多 60 个)。确定?`,
      )
    )
      return;
    setBusy("merge");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string; added: string[] }>(
        "/api/admin/socks",
        { action: "merge", count: 60, force },
      );
      setMsg(`${r.message}\n并入节点:\n${r.added.join("\n")}`);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "合并失败";
      if (msg.includes("确认要再追加")) {
        // 服务端要求二次确认:再点一次确定才真正 force
        if (confirm(`${msg}\n\n(二次确认,防止手滑重复并入)`)) {
          setBusy(null);
          return void doMerge(true);
        }
        setErr("已取消(今日批次已有福利代理,未重复并入)");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(null);
    }
  };

  const doSocksBatch = async (force = false) => {
    if ((status?.summary.ok ?? 0) === 0) return setErr("没有可用代理,先测活");
    if (
      !confirm(
        force
          ? `⚠ 确认:将创建纯代理批次(最多 60 个)替换当前全部下发内容。`
          : `创建纯代理批次(30 个原生/家宽优选 + 30 个实测高速,最多 60 个)作为唯一下发批次?`,
      )
    )
      return;
    setBusy("socksbatch");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string; added: string[] }>(
        "/api/admin/socks",
        { action: "create_batch", count: 60, force },
      );
      setMsg(`${r.message}\n节点:\n${r.added.join("\n")}`);
      await refresh();
    } catch (e) {
      const m = e instanceof Error ? e.message : "操作失败";
      if (m.includes("确认继续")) {
        if (confirm(`${m}\n\n(二次确认,将替换全部下发内容)`)) {
          setBusy(null);
          return void doSocksBatch(true);
        }
        setErr("已取消(未替换)");
      } else {
        setErr(m);
      }
    } finally {
      setBusy(null);
    }
  };

  const doReplace = async () => {
    const existing = status?.mergedToday ?? 0;
    if ((status?.summary.ok ?? 0) === 0) return setErr("没有可用代理");
    if (
      !confirm(
        `将移除今日批次现有的 ${existing} 个福利代理,重新挑选最多 60 个(30 个原生/家宽优选 + 30 个实测高速)。确定?`,
      )
    )
      return;
    setBusy("replace");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string; added: string[] }>(
        "/api/admin/socks",
        { action: "replace_merge", count: 60 },
      );
      setMsg(`${r.message}\n新节点:\n${r.added.join("\n")}`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "替换失败");
    } finally {
      setBusy(null);
    }
  };

  const doRemove = async () => {
    if (!confirm("从今日批次移除全部 SOCKS5/HTTP 福利代理(原付费节点保留)。确定?"))
      return;
    setBusy("remove");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string }>("/api/admin/socks", {
        action: "remove_socks",
      });
      setMsg(r.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(null);
    }
  };

  const doClearPool = async () => {
    if (!confirm("清空整个代理池(所有已导入的 SOCKS5/HTTP 记录,不影响已并入批次)。确定?"))
      return;
    if (!confirm("二次确认:真的清空代理池?此操作不可恢复。")) return;
    setBusy("clear");
    setErr(null);
    setMsg(null);
    try {
      const r = await apiPost<{ message: string }>("/api/admin/socks", {
        action: "clear_pool",
      });
      setMsg(r.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "操作失败");
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
          每行一条 SOCKS5 或 HTTP 代理;风险分 &lt;10 即可入池,原生/家宽会优先入选,
          其他类型按实测速度竞争;同 host:port 自动去重。支持直接粘贴或上传 txt。
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
              <StatusChip>原生/家宽 {status.summary.preferred}</StatusChip>
              <StatusChip>其他类型 {status.summary.other}</StatusChip>
              <StatusChip tone="accent">已并入今日 {status.mergedToday ?? 0}</StatusChip>
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
              {run.scope === "all"
                ? "全部重测"
                : run.scope === "failed"
                  ? "失败复测"
                  : "新代理测速"}
              中 {run.done}/{run.total}({pct}%)· 成功 {run.ok} · 失败 {run.fail} · 100
              并发
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            icon={LightningIcon}
            loading={busy === "test-untested"}
            disabled={run?.running || (status?.summary.untested ?? 0) === 0}
            onClick={() => doTest("untested")}
          >
            测试未测节点
          </Button>
          <Button
            variant="secondary"
            icon={ArrowsClockwiseIcon}
            loading={busy === "test-failed"}
            disabled={run?.running || (status?.summary.fail ?? 0) === 0}
            onClick={() => doTest("failed")}
          >
            重测失败节点
          </Button>
          <Button
            variant="ghost"
            icon={ArrowsClockwiseIcon}
            loading={busy === "test-all"}
            disabled={run?.running || (status?.summary.total ?? 0) === 0}
            onClick={() => doTest("all")}
          >
            重新测速全部
          </Button>
          <Button
            variant="primary"
            icon={PlusIcon}
            loading={busy === "merge"}
            disabled={run?.running || (status?.summary.ok ?? 0) === 0}
            onClick={() => doMerge()}
          >
            挑 60 个并入今日批次
          </Button>
          <Button
            variant="secondary"
            loading={busy === "socksbatch"}
            disabled={run?.running || (status?.summary.ok ?? 0) === 0}
            onClick={() => doSocksBatch()}
          >
            创建纯代理批次
          </Button>
          <Button
            variant="secondary"
            loading={busy === "replace"}
            disabled={run?.running || (status?.summary.ok ?? 0) === 0}
            onClick={doReplace}
          >
            替换今日福利代理
          </Button>
          <Button
            variant="ghost"
            loading={busy === "remove"}
            disabled={run?.running || (status?.mergedToday ?? 0) === 0}
            onClick={doRemove}
          >
            移除今日福利代理
          </Button>
          <Button
            variant="ghost"
            loading={busy === "clear"}
            disabled={run?.running || (status?.summary.total ?? 0) === 0}
            onClick={doClearPool}
          >
            清空代理池
          </Button>
        </div>
        <p className="text-xs" style={{ color: "var(--ark-muted)" }}>
          每次最多选 60 个:前 30 个优先原生/家宽,后 30 个按实测延迟从全部类型择优;
          数量不足自动回填。并入会生成同日期新批次,已拉取用户刷新不重复扣额度。
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
