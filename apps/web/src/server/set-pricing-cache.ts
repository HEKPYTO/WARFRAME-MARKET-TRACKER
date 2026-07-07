import type { SetPricingBreakdown } from "./set-pricing";

export interface SetPricingCache {
  getSetPricing(itemSlug: string): Promise<SetPricingBreakdown | null>;
}

export function createSetPricingCache(options: {
  loadSetPricing: (itemSlug: string) => Promise<SetPricingBreakdown | null>;
  now?: () => number;
  ttlMs: number;
}): SetPricingCache {
  const cache = new Map<
    string,
    {
      expiresAt: number;
      value: SetPricingBreakdown | null;
    }
  >();
  const inFlightLoads = new Map<string, Promise<SetPricingBreakdown | null>>();
  const now = options.now ?? Date.now;

  async function refreshSetPricing(itemSlug: string) {
    const inFlightLoad = inFlightLoads.get(itemSlug);

    if (inFlightLoad) {
      return inFlightLoad;
    }

    const load = options
      .loadSetPricing(itemSlug)
      .then((value) => {
        cache.set(itemSlug, {
          expiresAt: now() + options.ttlMs,
          value,
        });
        return value;
      })
      .finally(() => {
        inFlightLoads.delete(itemSlug);
      });

    inFlightLoads.set(itemSlug, load);
    return load;
  }

  return {
    async getSetPricing(itemSlug) {
      const cachedEntry = cache.get(itemSlug);

      if (!cachedEntry) {
        return refreshSetPricing(itemSlug);
      }

      if (now() < cachedEntry.expiresAt) {
        return cachedEntry.value;
      }

      try {
        return await refreshSetPricing(itemSlug);
      } catch {
        return cachedEntry.value;
      }
    },
  };
}
