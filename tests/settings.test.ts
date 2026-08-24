import { describe, expect, it } from "vitest";
import { parseAdminUsernames } from "@/lib/settings";

describe("parseAdminUsernames", () => {
  it("解析逗号、中文逗号和空白并去重", () => {
    expect(parseAdminUsernames("alice, bob，alice\ncarol")).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
  });

  it("未配置时返回空名单", () => {
    expect(parseAdminUsernames(undefined)).toEqual([]);
  });
});
