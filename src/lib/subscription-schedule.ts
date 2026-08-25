import { randomInt } from "node:crypto";

export const AUTO_SYNC_WINDOWS = [
  { startMinute: 7 * 60, endMinute: 10 * 60 },
  { startMinute: 14 * 60, endMinute: 23 * 60 },
] as const;

const MIN_INITIAL_DELAY_MINUTES = 15;

export type AutoSyncSlotStatus = "pending" | "claimed" | "skipped";

export type AutoSyncSlot = {
  id: number;
  scheduledAt: string;
  status: AutoSyncSlotStatus;
  handledAt: string | null;
};

export type SubscriptionSyncSchedule = {
  date: string;
  slots: AutoSyncSlot[];
};

export type AutoSyncClaimDecision = {
  schedule: SubscriptionSyncSchedule;
  claimedSlot: AutoSyncSlot | null;
};

type OffsetPicker = (maxExclusive: number) => number;

/** 取得指定时刻对应的上海日期，测试和补偿逻辑不依赖机器本地时区。 */
export function shanghaiDateAt(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
}

/** 生成当天两个随机时间窗；结果必须持久化，不能在每次 tick 时重新生成。 */
export function buildDailyAutoSyncSchedule(
  date: string,
  pickOffset: OffsetPicker = (maxExclusive) => randomInt(maxExclusive),
  notBefore?: Date,
): SubscriptionSyncSchedule {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("自动同步计划日期格式错误");
  }
  const currentMinute =
    notBefore && shanghaiDateAt(notBefore) === date
      ? shanghaiMinuteAt(notBefore)
      : null;
  return {
    date,
    slots: AUTO_SYNC_WINDOWS.map((window, id) => {
      if (
        currentMinute !== null &&
        currentMinute >= window.endMinute - MIN_INITIAL_DELAY_MINUTES
      ) {
        return {
          id,
          scheduledAt: shanghaiMinuteToIso(date, window.endMinute - 1),
          status: "skipped" as const,
          handledAt: notBefore?.toISOString() ?? null,
        };
      }
      const effectiveStart =
        currentMinute !== null && currentMinute >= window.startMinute
          ? currentMinute + MIN_INITIAL_DELAY_MINUTES
          : window.startMinute;
      const span = window.endMinute - effectiveStart;
      const sampled = Math.trunc(pickOffset(span));
      const offset = Math.min(Math.max(0, sampled), span - 1);
      return {
        id,
        scheduledAt: shanghaiMinuteToIso(date, effectiveStart + offset),
        status: "pending" as const,
        handledAt: null,
      };
    }),
  };
}

/** 当天已有合法计划时原样复用；跨日或旧数据损坏时才生成新计划。 */
export function ensureDailyAutoSyncSchedule(
  stored: SubscriptionSyncSchedule | null,
  now: Date,
  pickOffset?: OffsetPicker,
): SubscriptionSyncSchedule {
  const date = shanghaiDateAt(now);
  if (stored?.date === date && isValidSubscriptionSyncSchedule(stored)) {
    return stored;
  }
  return buildDailyAutoSyncSchedule(date, pickOffset, now);
}

/**
 * 认领一个到期槽位。若停机导致多个槽位同时积压，只执行最新槽位，旧槽跳过，
 * 避免服务恢复时在几分钟内连续请求上游。
 */
export function claimDueAutoSyncSlot(
  current: SubscriptionSyncSchedule,
  now: Date,
): AutoSyncClaimDecision {
  const nowMs = now.getTime();
  const due = current.slots
    .filter(
      (slot) =>
        slot.status === "pending" &&
        new Date(slot.scheduledAt).getTime() <= nowMs,
    )
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  if (due.length === 0) return { schedule: current, claimedSlot: null };

  const claimedId = due[due.length - 1].id;
  const overdueIds = new Set(due.map((slot) => slot.id));
  const handledAt = now.toISOString();
  const slots = current.slots.map((slot): AutoSyncSlot => {
    if (!overdueIds.has(slot.id)) return slot;
    return {
      ...slot,
      status: slot.id === claimedId ? "claimed" : "skipped",
      handledAt,
    };
  });
  return {
    schedule: { ...current, slots },
    claimedSlot: slots.find((slot) => slot.id === claimedId) ?? null,
  };
}

export function nextPendingAutoSyncAt(
  schedule: SubscriptionSyncSchedule,
): string | null {
  return (
    schedule.slots
      .filter((slot) => slot.status === "pending")
      .map((slot) => slot.scheduledAt)
      .sort()[0] ?? null
  );
}

export function autoSyncSelectionSeed(
  schedule: SubscriptionSyncSchedule,
  slot: AutoSyncSlot,
): string {
  return `${schedule.date}:${slot.id}:${slot.scheduledAt}`;
}

function shanghaiMinuteToIso(date: string, minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`,
  ).toISOString();
}

function shanghaiMinuteAt(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function isValidSubscriptionSyncSchedule(
  value: SubscriptionSyncSchedule,
): boolean {
  if (!Array.isArray(value.slots) || value.slots.length !== AUTO_SYNC_WINDOWS.length) {
    return false;
  }
  return value.slots.every((slot, index) => {
    const scheduledMs = new Date(slot.scheduledAt).getTime();
    return (
      slot.id === index &&
      Number.isFinite(scheduledMs) &&
      ["pending", "claimed", "skipped"].includes(slot.status) &&
      (slot.handledAt === null || Number.isFinite(new Date(slot.handledAt).getTime()))
    );
  });
}
