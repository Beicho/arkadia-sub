import { afterEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db/client", () => ({ db: dbMock }));

import { ldcRefund, queryLdcOrder } from "@/lib/ldc";
import { canDeliverPaidOrder, markOrderPaid } from "@/lib/payment-core";

function createTx(selectionRows: unknown[][]) {
  const updates: Array<{ values: Record<string, unknown> }> = [];
  const tx = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(),
        where: vi.fn(),
        for: vi.fn(),
        limit: vi.fn(),
      };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      chain.for.mockReturnValue(chain);
      chain.limit.mockImplementation(async () => selectionRows.shift() ?? []);
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          updates.push({ values });
        }),
      })),
    })),
    execute: vi.fn().mockResolvedValue({ count: 1 }),
  };
  return { tx, updates };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("payment state transitions", () => {
  it("allows pending and expired orders to be delivered exactly once", () => {
    expect(canDeliverPaidOrder("pending")).toBe(true);
    expect(canDeliverPaidOrder("expired")).toBe(true);
    expect(canDeliverPaidOrder("paid")).toBe(false);
    expect(canDeliverPaidOrder("refund_pending")).toBe(false);
    expect(canDeliverPaidOrder("refunded")).toBe(false);
  });

  it("restores an expired activation order once and ignores a duplicate", async () => {
    const first = createTx([
      [
        {
          id: 7,
          outTradeNo: "ORDER-LATE",
          status: "expired",
          orderType: "activation",
          codeId: 9,
          userId: null,
          quantity: 5,
        },
      ],
      [{ id: 9, status: "void", revealed: false }],
    ]);
    const duplicate = createTx([
      [
        {
          id: 7,
          outTradeNo: "ORDER-LATE",
          status: "paid",
          orderType: "activation",
          codeId: 9,
          userId: null,
          quantity: 5,
        },
      ],
    ]);
    dbMock.transaction
      .mockImplementationOnce(
        (callback: (tx: typeof first.tx) => Promise<unknown>) => callback(first.tx),
      )
      .mockImplementationOnce(
        (callback: (tx: typeof duplicate.tx) => Promise<unknown>) =>
          callback(duplicate.tx),
      );

    await expect(markOrderPaid("ORDER-LATE", "LDC-LATE", {})).resolves.toBe("ok");
    await expect(markOrderPaid("ORDER-LATE", "LDC-LATE", {})).resolves.toBe(
      "already_paid",
    );

    expect(first.tx.execute).toHaveBeenCalledOnce();
    expect(first.updates.map((entry) => entry.values)).toEqual(
      expect.arrayContaining([
        { status: "issued", revealed: true },
        expect.objectContaining({ status: "paid", tradeNo: "LDC-LATE" }),
      ]),
    );
    expect(duplicate.tx.update).not.toHaveBeenCalled();
  });
});

describe("queryLdcOrder failure classification", () => {
  it("throws on provider HTTP errors instead of treating them as unpaid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));

    await expect(queryLdcOrder("ORDER-HTTP-ERROR")).rejects.toThrow(
      "LDC order query HTTP 503",
    );
  });

  it("throws on malformed provider responses instead of treating them as unpaid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ message: "unexpected response" })),
    );

    await expect(queryLdcOrder("ORDER-BAD-JSON")).rejects.toThrow(
      "LDC order query returned an invalid response",
    );
  });

  it("throws when a successful provider response omits payment status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ code: 1, money: "100.00" })),
    );

    await expect(queryLdcOrder("ORDER-NO-STATUS")).rejects.toThrow(
      "LDC order query returned an invalid status",
    );
  });

  it("preserves paid status and amount for reconciliation validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          code: 1,
          status: 1,
          trade_no: "LDC-123",
          money: "100.00",
        }),
      ),
    );

    await expect(queryLdcOrder("ORDER-PAID")).resolves.toMatchObject({
      found: true,
      paid: true,
      tradeNo: "LDC-123",
      money: "100.00",
    });
  });

  it("accepts an explicit provider not-found response as unpaid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ code: -1, msg: "not found" })),
    );

    await expect(queryLdcOrder("ORDER-MISSING")).resolves.toMatchObject({
      found: false,
      paid: false,
    });
  });

  it("rejects unknown provider business codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ code: 0, msg: "temporary error" })),
    );

    await expect(queryLdcOrder("ORDER-UNKNOWN")).rejects.toThrow(
      "LDC order query returned unexpected code 0",
    );
  });
});

describe("ldcRefund failure classification", () => {
  it("does not accept a success-shaped body from an HTTP error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ code: 1, msg: "unexpected" }, { status: 503 }),
      ),
    );

    await expect(ldcRefund("LDC-REFUND", 100)).resolves.toEqual({
      ok: false,
      msg: "HTTP 503",
      uncertain: true,
    });
  });

  it("distinguishes an explicit provider rejection from an unknown outcome", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ code: -1, msg: "not refundable" })),
    );

    await expect(ldcRefund("LDC-REFUND", 100)).resolves.toEqual({
      ok: false,
      msg: "not refundable",
      uncertain: false,
    });
  });
});
