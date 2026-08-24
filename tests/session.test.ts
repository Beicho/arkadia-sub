import { afterEach, describe, expect, it, vi } from "vitest";

describe("session secret", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects signing without SESSION_SECRET in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", "");
    const { signSession } = await import("@/lib/session");

    await expect(signSession({ uid: 1, role: "user" })).rejects.toThrow(
      "SESSION_SECRET is required in production",
    );
  });

  it("keeps the development fallback for local use", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SESSION_SECRET", "");
    const { signSession } = await import("@/lib/session");

    await expect(signSession({ uid: 1, role: "user" })).resolves.toEqual(
      expect.any(String),
    );
  });
});
