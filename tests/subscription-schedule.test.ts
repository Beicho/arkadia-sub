import { describe, expect, it } from "vitest";
import {
  buildDailyAutoSyncSchedule,
  claimDueAutoSyncSlot,
  ensureDailyAutoSyncSchedule,
  nextPendingAutoSyncAt,
  shanghaiDateAt,
} from "@/lib/subscription-schedule";

describe("subscription randomized daily schedule", () => {
  it("在早晚两个时间窗各生成一个持久化槽位", () => {
    const offsets = [61, 125];
    const schedule = buildDailyAutoSyncSchedule(
      "2026-08-25",
      () => offsets.shift() ?? 0,
    );

    expect(schedule.slots.map((slot) => slot.scheduledAt)).toEqual([
      "2026-08-25T00:01:00.000Z",
      "2026-08-25T08:05:00.000Z",
    ]);
    expect(schedule.slots.every((slot) => slot.status === "pending")).toBe(true);
  });

  it("同一上海日期复用原计划，跨日才重新生成", () => {
    const existing = buildDailyAutoSyncSchedule("2026-08-25", () => 10);
    expect(
      ensureDailyAutoSyncSchedule(
        existing,
        new Date("2026-08-25T12:00:00.000Z"),
      ),
    ).toBe(existing);

    const next = ensureDailyAutoSyncSchedule(
      existing,
      new Date("2026-08-25T16:01:00.000Z"),
      () => 20,
    );
    expect(next.date).toBe("2026-08-26");
    expect(next).not.toBe(existing);
  });

  it("一个槽位只能认领一次且每天最多两个", () => {
    const schedule = buildDailyAutoSyncSchedule("2026-08-25", () => 0);
    const first = claimDueAutoSyncSlot(
      schedule,
      new Date("2026-08-24T23:01:00.000Z"),
    );
    expect(first.claimedSlot?.id).toBe(0);
    expect(
      claimDueAutoSyncSlot(
        first.schedule,
        new Date("2026-08-25T01:00:00.000Z"),
      ).claimedSlot,
    ).toBeNull();

    const second = claimDueAutoSyncSlot(
      first.schedule,
      new Date("2026-08-25T06:01:00.000Z"),
    );
    expect(second.claimedSlot?.id).toBe(1);
    expect(
      claimDueAutoSyncSlot(
        second.schedule,
        new Date("2026-08-25T15:00:00.000Z"),
      ).claimedSlot,
    ).toBeNull();
  });

  it("停机积压两个槽位时只补最新一个", () => {
    const schedule = buildDailyAutoSyncSchedule("2026-08-25", () => 0);
    const decision = claimDueAutoSyncSlot(
      schedule,
      new Date("2026-08-25T15:00:00.000Z"),
    );

    expect(decision.claimedSlot?.id).toBe(1);
    expect(decision.schedule.slots.map((slot) => slot.status)).toEqual([
      "skipped",
      "claimed",
    ]);
    expect(nextPendingAutoSyncAt(decision.schedule)).toBeNull();
  });

  it("上海日期不受运行机器时区影响", () => {
    expect(shanghaiDateAt(new Date("2026-08-25T15:59:59.000Z"))).toBe(
      "2026-08-25",
    );
    expect(shanghaiDateAt(new Date("2026-08-25T16:00:00.000Z"))).toBe(
      "2026-08-26",
    );
  });

  it("当天首次启动不补拉已错过窗口", () => {
    const schedule = ensureDailyAutoSyncSchedule(
      null,
      new Date("2026-08-25T03:00:00.000Z"), // 上海 11:00
      () => 0,
    );

    expect(schedule.slots[0].status).toBe("skipped");
    expect(schedule.slots[1].status).toBe("pending");
    expect(schedule.slots[1].scheduledAt).toBe("2026-08-25T06:00:00.000Z");
  });

  it("当天首次启动落在窗口内时至少延迟十五分钟", () => {
    const schedule = ensureDailyAutoSyncSchedule(
      null,
      new Date("2026-08-25T00:00:00.000Z"), // 上海 08:00
      () => 0,
    );

    expect(schedule.slots[0].status).toBe("pending");
    expect(schedule.slots[0].scheduledAt).toBe("2026-08-25T00:15:00.000Z");
  });
});
