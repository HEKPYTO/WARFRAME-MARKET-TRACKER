import { describe, expect, it } from "bun:test";

import { getFooterStatusPresentation } from "./footer-status";

describe("getFooterStatusPresentation", () => {
  it("reports freshness and estimated revisit time based on tracked items", () => {
    expect(
      getFooterStatusPresentation({
        lastRefreshAt: 10_000,
        now: 18_000,
        refreshState: "idle",
        safeRequestSpacingMs: 500,
        trackedItems: 10,
        trackingPaused: false,
      }),
    ).toEqual({
      detail: "updated 8s ago · interval 5s",
      label: "live",
      progress: 1,
      tone: "live",
    });
  });

  it("reports syncing while a refresh is in flight", () => {
    expect(
      getFooterStatusPresentation({
        lastRefreshAt: undefined,
        now: 18_000,
        refreshState: "refreshing",
        safeRequestSpacingMs: 500,
        trackedItems: 10,
        trackingPaused: false,
      }),
    ).toEqual({
      detail: "syncing market feed",
      label: "syncing",
      progress: 0,
      tone: "syncing",
    });
  });

  it("keeps paused status stable even if a refresh is in flight", () => {
    expect(
      getFooterStatusPresentation({
        lastRefreshAt: 10_000,
        now: 18_000,
        refreshState: "refreshing",
        safeRequestSpacingMs: 500,
        trackedItems: 10,
        trackingPaused: true,
      }),
    ).toEqual({
      detail: "tracking paused globally",
      label: "paused",
      progress: 0,
      tone: "paused",
    });
  });

  it("surfaces a warning state when refresh fails", () => {
    expect(
      getFooterStatusPresentation({
        lastRefreshAt: 10_000,
        now: 18_000,
        refreshState: "error",
        safeRequestSpacingMs: 500,
        trackedItems: 10,
        trackingPaused: false,
      }),
    ).toEqual({
      detail: "market sync failed · last sync 8s ago",
      label: "warning",
      progress: 1,
      tone: "error",
    });
  });

  it("reports idle when no items are being tracked", () => {
    expect(
      getFooterStatusPresentation({
        lastRefreshAt: undefined,
        now: 18_000,
        refreshState: "idle",
        safeRequestSpacingMs: 500,
        trackedItems: 0,
        trackingPaused: false,
      }),
    ).toEqual({
      detail: "waiting for tracked items",
      label: "idle",
      progress: 0,
      tone: "live",
    });
  });

  it("reports paused when global tracking is disabled", () => {
    expect(
      getFooterStatusPresentation({
        lastRefreshAt: 10_000,
        now: 18_000,
        refreshState: "idle",
        safeRequestSpacingMs: 500,
        trackedItems: 10,
        trackingPaused: true,
      }),
    ).toEqual({
      detail: "tracking paused globally",
      label: "paused",
      progress: 0,
      tone: "paused",
    });
  });
});
