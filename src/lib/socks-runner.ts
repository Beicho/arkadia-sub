/**
 * 进程内测活任务(单例):一次只允许一个 run,进度写库 + 内存快照。
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socksPool } from "@/db/schema";
import { checkProxy, runPool } from "@/lib/socks-test";

export type SocksRunState = {
  running: boolean;
  scope: SocksTestScope | null;
  total: number;
  done: number;
  ok: number;
  fail: number;
  startedAt: string | null;
  finishedAt: string | null;
};

export type SocksTestScope = "untested" | "failed" | "all";

export type SocksRunStartResult =
  | { started: true; total: number }
  | { started: false; reason: "running" | "empty" };

const state: SocksRunState = {
  running: false,
  scope: null,
  total: 0,
  done: 0,
  ok: 0,
  fail: 0,
  startedAt: null,
  finishedAt: null,
};

export function getSocksRunState(): SocksRunState {
  return { ...state };
}

/** 按范围启动一轮测活;支持未测、失败复测与全部重测。 */
export async function startSocksRun(
  scope: SocksTestScope = "untested",
  limit = 20000,
): Promise<SocksRunStartResult> {
  if (state.running) return { started: false, reason: "running" };

  // 必须在第一次 await 前占位，否则两个并发请求都可能越过 running 检查。
  state.running = true;
  state.scope = scope;

  let targets: { id: number; host: string; port: number; protocol: string }[];
  try {
    const baseQuery = db
      .select({
        id: socksPool.id,
        host: socksPool.host,
        port: socksPool.port,
        protocol: socksPool.protocol,
      })
      .from(socksPool);
    targets =
      scope === "all"
        ? await baseQuery.limit(limit)
        : await baseQuery
            .where(eq(socksPool.status, scope === "failed" ? "fail" : "untested"))
            .limit(limit);
  } catch (error) {
    state.running = false;
    state.scope = null;
    throw error;
  }

  if (targets.length === 0) {
    state.running = false;
    state.scope = null;
    return { started: false, reason: "empty" };
  }

  state.total = targets.length;
  state.done = 0;
  state.ok = 0;
  state.fail = 0;
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;

  // 后台执行,不阻塞请求
  void (async () => {
    try {
      await runPool(targets, 100, async (t) => {
        const r = await checkProxy(t.host, t.port, t.protocol === "http" ? "http" : "socks5", 8000);
        if (r.ok) state.ok++;
        else state.fail++;
        state.done++;
        try {
          await db
            .update(socksPool)
            .set({
              status: r.ok ? "ok" : "fail",
              latencyMs: r.ok ? r.latencyMs : null,
              lastCheckedAt: new Date(),
            })
            .where(eq(socksPool.id, t.id));
        } catch {
          // 单条写库失败不影响整体
        }
      });
    } catch (err) {
      console.error("[socks-run] crashed", err);
    } finally {
      state.running = false;
      state.finishedAt = new Date().toISOString();
      console.info(
        "[socks-run] finished: total=%d ok=%d fail=%d",
        state.total,
        state.ok,
        state.fail,
      );
    }
  })();

  return { started: true, total: targets.length };
}
