import { describe, expect, it } from "bun:test";
import type { WatchAlert } from "@warframe-market-tracker/alert-engine";

import {
  buildAlertNotificationFingerprint,
  dedupeAlertNotifications,
} from "../src/alert-notification-fingerprint";

const baseAlert: WatchAlert = {
  itemSlug: "arcane_barrier",
  lastSeen: "2026-03-25T00:00:00.000Z",
  observedAt: "2026-03-25T00:00:00.000Z",
  platinum: 10,
  ruleId: "rule-1",
  sellerId: "seller-1",
  sellerName: "vash2000",
  sellerSlug: "vash2000",
  status: "online",
};

describe("buildAlertNotificationFingerprint", () => {
  it("uses the item, seller, price, and last-seen session so new sessions can alert again", () => {
    expect(buildAlertNotificationFingerprint(baseAlert)).toBe(
      "arcane_barrier::seller-1::10::2026-03-25T00:00:00.000Z",
    );
  });
});

describe("dedupeAlertNotifications", () => {
  it("collapses duplicate seller-price pairs for the same item", () => {
    expect(
      dedupeAlertNotifications([baseAlert, { ...baseAlert, ruleId: "rule-2" }]),
    ).toEqual([baseAlert]);
  });

  it("keeps the same seller and price when the seller last-seen session changes", () => {
    expect(
      dedupeAlertNotifications([
        baseAlert,
        {
          ...baseAlert,
          lastSeen: "2026-03-25T00:05:00.000Z",
          observedAt: "2026-03-25T00:05:00.000Z",
        },
      ]),
    ).toHaveLength(2);
  });

  it("keeps distinct sellers at the same price", () => {
    expect(
      dedupeAlertNotifications([
        baseAlert,
        {
          ...baseAlert,
          sellerId: "seller-2",
          sellerName: "cephalon-suda",
          sellerSlug: "cephalon-suda",
        },
      ]),
    ).toHaveLength(2);
  });

  it("keeps the same seller when the price changes", () => {
    expect(
      dedupeAlertNotifications([
        baseAlert,
        {
          ...baseAlert,
          lastSeen: "2026-03-25T00:05:00.000Z",
          observedAt: "2026-03-25T00:05:00.000Z",
          platinum: 9,
        },
      ]),
    ).toHaveLength(2);
  });
});
