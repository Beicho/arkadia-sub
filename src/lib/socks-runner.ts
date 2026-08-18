/**
 * 进程内测活任务(单例):一次只允许一个 run,进度写库 + 内存快照。
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socksPool } from "@/db/schema";
import { checkSocks5, runPool } from "@/lib/socks-test";

export type SocksRunState = {
  running: boolean;
  total: number;
  done: number;
  ok: number;
  fail: number;
  startedAt: string | null;
  finishedAt: string | null;
};

const state: SocksRunState = {
  running: false,
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

/** 启动一轮测活;运行中返回 false */
export async function startSocksRun(limit = 20000): Promise<boolean> {
  if (state.running) return false;

  const targets = await db
    .select({ id: socksPool.id, host: socksPool.host, port: socksPool.port })
    .from(socksPool)
    .limit(limit);

  state.running = true;
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
        const r = await checkSocks5(t.host, t.port, 8000);
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
      console.log(
        "[socks-run] finished: total=%d ok=%d fail=%d",
        state.total,
        state.ok,
        state.fail,
      );
    }
  })();

  return true;
}
