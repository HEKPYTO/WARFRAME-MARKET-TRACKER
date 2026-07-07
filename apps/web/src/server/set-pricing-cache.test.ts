import { describe, expect, it } from "bun:test";

import type { SetPricingBreakdown } from "./set-pricing";
import { createSetPricingCache } from "./set-pricing-cache";

function createBreakdown(totalEstimatedPrice: number): SetPricingBreakdown {
  return {
    parts: [],
    totalEstimatedPrice,
    totalVariance: 0,
  };
}

describe("createSetPricingCache", () => {
  it("caches a successful set pricing lookup by item slug", async () => {
    let now = 0;
    let loads = 0;
    const cache = createSetPricingCache({
      loadSetPricing: async () => {
        loads += 1;
        return createBreakdown(40);
      },
      now: () => now,
      ttlMs: 30_000,
    });

    await expect(cache.getSetPricing("mesa_prime_set")).resolves.toEqual(
      createBreakdown(40),
    );
    await expect(cache.getSetPricing("mesa_prime_set")).resolves.toEqual(
      createBreakdown(40),
    );

    expect(loads).toBe(1);

    now = 30_001;

    await expect(cache.getSetPricing("mesa_prime_set")).resolves.toEqual(
      createBreakdown(40),
    );

    expect(loads).toBe(2);
  });

  it("serves stale cached data when a refresh fails after warmup", async () => {
    let shouldFail = false;
    const cache = createSetPricingCache({
      loadSetPricing: async () => {
        if (shouldFail) {
          throw new Error("upstream unavailable");
        }

        return createBreakdown(30);
      },
      now: (() => {
        let current = 0;
        return () => {
          current += 31_000;
          return current;
        };
      })(),
      ttlMs: 30_000,
    });

    await expect(cache.getSetPricing("mesa_prime_set")).resolves.toEqual(
      createBreakdown(30),
    );

    shouldFail = true;

    await expect(cache.getSetPricing("mesa_prime_set")).resolves.toEqual(
      createBreakdown(30),
    );
  });
});
