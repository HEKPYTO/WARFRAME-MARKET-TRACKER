import { describe, expect, it } from "bun:test";

import {
  getAlertsEmptyState,
  getMarketPaneEmptyState,
  getMarketPriceWarning,
  getWatchlistSubmitPresentation,
} from "./presentation";

describe("getWatchlistSubmitPresentation", () => {
  it("describes the idle create-rule action", () => {
    expect(getWatchlistSubmitPresentation(false)).toEqual({
      ariaLabel: "Create watch rule",
      label: "+",
      labelClassName: "text-[color:var(--theme-accent-gold-foreground)]",
      title: "Create watch rule",
    });
  });

  it("describes the in-flight create-rule action", () => {
    expect(getWatchlistSubmitPresentation(true)).toEqual({
      ariaLabel: "Creating watch rule",
      label: "+",
      labelClassName: "text-[color:var(--theme-accent-gold-foreground)]",
      title: "Creating watch rule",
    });
  });
});

describe("getMarketPaneEmptyState", () => {
  it("guides the user to create their first rule", () => {
    expect(getMarketPaneEmptyState(0)).toEqual({
      body: "Create a watch rule from the left panel to start tracking live market orders.",
      title: "No active watch rules",
    });
  });

  it("guides the user to select an existing rule", () => {
    expect(getMarketPaneEmptyState(2)).toEqual({
      body: "Select a tracked rule from the watchlist to inspect live market data.",
      title: "Select a tracked rule",
    });
  });
});

describe("getAlertsEmptyState", () => {
  it("uses setup guidance when no rules exist", () => {
    expect(getAlertsEmptyState(0)).toEqual({
      body: "Create a watch rule to arm alerts for price drops and seller status changes.",
      title: "No watch rules yet",
    });
  });

  it("uses monitoring guidance when rules exist", () => {
    expect(getAlertsEmptyState(3)).toEqual({
      body: "Monitoring is active. Alerts will appear when sellers meet your thresholds.",
      title: "Monitoring active",
    });
  });
});

describe("getMarketPriceWarning", () => {
  it("warns when the target is below the current market floor", () => {
    expect(getMarketPriceWarning(20, 35)).toBe(
      "Your target is below the current market floor.",
    );
  });

  it("stays quiet when the target reaches or exceeds the market floor", () => {
    expect(getMarketPriceWarning(35, 35)).toBeNull();
    expect(getMarketPriceWarning(40, 35)).toBeNull();
    expect(getMarketPriceWarning(35, null)).toBeNull();
  });
});
