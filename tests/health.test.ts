import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/db/client", () => ({ db: { execute } }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  beforeEach(() => {
    execute.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok only when the database is reachable", async () => {
    execute.mockResolvedValueOnce([]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 503 without exposing database errors", async () => {
    execute.mockRejectedValueOnce(new Error("database credentials leaked here"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unhealthy" });
  });
});
