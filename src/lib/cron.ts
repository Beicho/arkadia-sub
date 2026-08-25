import { reconcilePendingOrders } from "@/lib/reconcile";
import { runSubscriptionSync } from "@/lib/subscription-sync";

let started = false;

/** 服务启动后开启后台对账循环(instrumentation 调用) */
export function startBackgroundJobs() {
  if (started) return;
  started = true;

  // 订单超时 5 分钟关闭 → 每分钟扫一次,超时后最迟 1 分钟内关闭
  const RECONCILE_INTERVAL_MS = 60_000;
  // 每分钟只检查是否到期；数据库保存每天两个随机槽位并负责跨实例认领。
  const SUBSCRIPTION_CHECK_INTERVAL_MS = 60_000;

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

  let subscriptionTickRunning = false;
  const subscriptionTick = async () => {
    if (subscriptionTickRunning) return;
    subscriptionTickRunning = true;
    try {
      const result = await runSubscriptionSync({ trigger: "automatic" });
      if (result.outcome === "created") {
        console.info(
          `[subscription-sync] activated batch ${result.batchId} (${result.totalNodeCount} nodes)`,
        );
      }
    } catch (err) {
      console.error("[subscription-sync] automatic sync failed", err);
    } finally {
      subscriptionTickRunning = false;
    }
  };

  // 冷启动后稍晚于订单对账启动；数据库 advisory lock 防多容器同时执行。
  setTimeout(subscriptionTick, 45_000).unref?.();
  setInterval(subscriptionTick, SUBSCRIPTION_CHECK_INTERVAL_MS).unref?.();
}
