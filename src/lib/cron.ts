import { reconcilePendingOrders } from "@/lib/reconcile";

let started = false;

/** 服务启动后开启后台对账循环(instrumentation 调用) */
export function startBackgroundJobs() {
  if (started) return;
  started = true;

  // 订单超时 5 分钟关闭 → 每分钟扫一次,超时后最迟 1 分钟内关闭
  const RECONCILE_INTERVAL_MS = 60_000;

  const tick = async () => {
    try {
      await reconcilePendingOrders();
    } catch (err) {
      console.error("[cron] reconcile failed", err);
    }
  };

  // 启动后延迟 20s 再跑第一轮,避开冷启动
  setTimeout(tick, 20_000).unref?.();
  setInterval(tick, RECONCILE_INTERVAL_MS).unref?.();
}
