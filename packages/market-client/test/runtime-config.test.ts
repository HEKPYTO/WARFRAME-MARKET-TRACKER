import { describe, expect, it } from "bun:test";

import {
  getRuntimeConfig,
  getTrackedItemPollingIntervalMs,
} from "../src/runtime-config";

describe("getRuntimeConfig", () => {
  it("derives a safe default polling budget below the upstream ceiling", () => {
    expect(getRuntimeConfig({})).toEqual({
      marketBaseUrl: "https://api.warframe.market/v2",
      maxConcurrentMarketRequests: 2,
      marketCrossplay: true,
      marketLanguage: "en",
      marketPlatform: "pc",
      adaptiveConcurrencyMode: "adaptive",
      safeRequestSpacingMs: 500,
      safeRequestsPerSecond: 2,
      theoreticalRequestsPerSecond: 3,
    });
  });

  it("respects explicit market env overrides while keeping the safe request spacing", () => {
    expect(
      getRuntimeConfig({
        MARKET_API_BASE_URL: "https://example.test",
        MARKET_CROSSPLAY: "false",
        MARKET_LANGUAGE: "fr",
        MARKET_PLATFORM: "switch",
        WORKER_ADAPTIVE_CONCURRENCY_MODE: "adaptive",
      }),
    ).toEqual({
      marketBaseUrl: "https://example.test",
      maxConcurrentMarketRequests: 2,
      marketCrossplay: false,
      marketLanguage: "fr",
      marketPlatform: "switch",
      adaptiveConcurrencyMode: "adaptive",
      safeRequestSpacingMs: 500,
      safeRequestsPerSecond: 2,
      theoreticalRequestsPerSecond: 3,
    });
  });
});

describe("getTrackedItemPollingIntervalMs", () => {
  it("falls back to the configured poll interval when no items are tracked", () => {
    expect(
      getTrackedItemPollingIntervalMs({
        safeRequestSpacingMs: 500,
        trackedItems: 0,
      }),
    ).toBeNull();
  });

  it("uses round-robin spacing when items are actively tracked", () => {
    expect(
      getTrackedItemPollingIntervalMs({
        safeRequestSpacingMs: 500,
        trackedItems: 10,
      }),
    ).toBe(5_000);
  });
});
