import { describe, expect, it } from "bun:test";

import { isDevResetEnabled, parseResetPayload } from "./dev-reset";

describe("isDevResetEnabled", () => {
  it("only enables the reset path for explicit test environments", () => {
    expect(
      isDevResetEnabled({ APP_ENV: "test", ENABLE_DEV_RESET: "true" }),
    ).toBe(true);
    expect(
      isDevResetEnabled({ APP_ENV: "production", ENABLE_DEV_RESET: "true" }),
    ).toBe(false);
    expect(
      isDevResetEnabled({ APP_ENV: "test", ENABLE_DEV_RESET: "false" }),
    ).toBe(false);
    expect(isDevResetEnabled({ APP_ENV: "test" })).toBe(false);
  });
});

describe("parseResetPayload", () => {
  it("defaults to an empty seed when no body is provided", () => {
    expect(parseResetPayload(undefined)).toEqual({ seed: "empty" });
  });

  it("accepts the named demo seed", () => {
    expect(parseResetPayload({ seed: "demo" })).toEqual({ seed: "demo" });
  });

  it("rejects invalid seed values", () => {
    expect(() => parseResetPayload({ seed: "nope" })).toThrow();
  });
});
