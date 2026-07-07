import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { formatLocalDisplayTimestamp } from "../src/index";

const originalTimeZone = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Asia/Bangkok";
});

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("formatLocalDisplayTimestamp", () => {
  it("formats local timestamps as hh:mm AM/PM MON DD", () => {
    const formatted = formatLocalDisplayTimestamp("2026-03-25T08:45:00.000Z");

    expect(formatted).toBe("03:45 PM MAR 25");
    expect(formatted).not.toContain("GMT");
  });

  it("passes invalid strings through unchanged", () => {
    expect(formatLocalDisplayTimestamp("not-a-date")).toBe("not-a-date");
  });
});
