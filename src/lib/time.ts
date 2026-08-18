export const TZ = "Asia/Shanghai";

/** 当前 Asia/Shanghai 日期(YYYY-MM-DD) */
export function shanghaiToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** Asia/Shanghai 今天 00:00 对应的 UTC 时刻 */
export function shanghaiDayStart(): Date {
  const today = shanghaiToday();
  return new Date(`${today}T00:00:00+08:00`);
}

export function formatDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("zh-CN", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function daysLeft(paidUntil: Date | null | undefined): number {
  if (!paidUntil) return 0;
  const diff = paidUntil.getTime() - Date.now();
  return diff <= 0 ? 0 : Math.ceil(diff / 86_400_000);
}
