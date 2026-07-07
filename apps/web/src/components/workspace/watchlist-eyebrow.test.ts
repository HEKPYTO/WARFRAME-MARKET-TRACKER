import { describe, expect, it } from "bun:test";

import { getWatchlistEyebrowPresentation } from "./watchlist-eyebrow";

describe("getWatchlistEyebrowPresentation", () => {
  it("returns the product label and beta badge copy", () => {
    expect(getWatchlistEyebrowPresentation()).toEqual({
      badgeClassName:
        "rounded-sm border border-accent-gold bg-accent-gold px-1.5 py-[1px] text-[9px] leading-none text-white",
      badgeLabel: "beta",
      label: "warframe-market-tracker",
    });
  });
});
