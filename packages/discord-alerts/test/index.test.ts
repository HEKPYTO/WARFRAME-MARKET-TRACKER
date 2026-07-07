import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  buildDiscordAlertMessagePayload,
  buildTradeMessage,
  buildDiscordTestMessagePresentation,
  DISCORD_ALERT_COLOR,
  getTrackerItemUrl,
} from "../src/index";

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

describe("buildDiscordAlertMessagePayload", () => {
  it("builds a stable presentation model for an alert card", () => {
    expect(
      buildDiscordAlertMessagePayload({
        appBaseUrl: "https://tracker.example",
        itemSlug: "arcane_barrier",
        lastSeen: "2026-03-24T00:00:00.000Z",
        observedAt: "2026-03-24T00:03:00.000Z",
        platinum: 9,
        ruleId: "rule-1",
        sellerName: "vash2000",
        status: "online",
        targetPlatinum: 10,
      }),
    ).toEqual({
      actions: [
        {
          label: "Open Market",
          url: "https://warframe.market/items/arcane_barrier",
        },
        {
          label: "Open Tracker",
          url: "https://tracker.example/?ruleId=rule-1",
        },
      ],
      description: "vash2000 sells for 9p",
      fields: [
        {
          label: "Status",
          value: "Online",
        },
        {
          label: "Target",
          value: "10p",
        },
        {
          label: "Delta",
          value: "1p under",
        },
        {
          label: "Alerted",
          value: "07:03 AM MAR 24",
        },
      ],
      tradeMessage:
        '/w vash2000 Hi! Want to buy "Arcane Barrier" for 9 platinum. (warframe.market)',
      title: "Arcane Barrier",
    });
  });
});

describe("buildTradeMessage", () => {
  it("builds a copy-friendly whisper that differs from the site default copy", () => {
    expect(
      buildTradeMessage({
        itemSlug: "arcane_barrier",
        platinum: 9,
        sellerName: "vash2000",
      }),
    ).toBe(
      '/w vash2000 Hi! Want to buy "Arcane Barrier" for 9 platinum. (warframe.market)',
    );
  });
});

describe("getTrackerItemUrl", () => {
  it("builds a rule deep-link on the tracker base URL", () => {
    expect(
      getTrackerItemUrl({
        appBaseUrl: "https://tracker.example",
        ruleId: "rule-1",
      }),
    ).toBe("https://tracker.example/?ruleId=rule-1");

    expect(
      getTrackerItemUrl({
        appBaseUrl: "https://tracker.example/app/",
        ruleId: "rule-1",
      }),
    ).toBe("https://tracker.example/app/?ruleId=rule-1");
  });
});

describe("DISCORD_ALERT_COLOR", () => {
  it("keeps the shared Discord accent color stable", () => {
    expect(DISCORD_ALERT_COLOR).toBe(5793266);
  });
});

describe("buildDiscordTestMessagePresentation", () => {
  it("builds a dedicated verification card for the settings test flow", () => {
    expect(
      buildDiscordTestMessagePresentation({
        checkedAt: "2026-03-25T01:23:45.000Z",
      }),
    ).toEqual({
      description:
        "Signal path is clear. Warframe Market Tracker can post alerts to this channel.",
      fields: [
        {
          label: "Checked",
          value: "08:23 AM MAR 25",
        },
      ],
      title: "Discord connection verified",
    });
  });
});
