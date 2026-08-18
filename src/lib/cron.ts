import { reconcilePendingOrders } from "@/lib/reconcile";

let started = false;

/** 服务启动后开启后台对账循环(instrumentation 调用) */
export function startBackgroundJobs() {
  if (started) return;
  started = true;

  const RECONCILE_INTERVAL_MS = 5 * 60_000;

  const tick = async () => {
    try {
      await reconcilePendingOrders();
    } catch (err) {
      console.error("[cron] reconcile failed", err);
    }
  };

  // 启动后延迟 30s 再跑第一轮,避开冷启动
  setTimeout(tick, 30_000).unref?.();
  setInterval(tick, RECONCILE_INTERVAL_MS).unref?.();
}
