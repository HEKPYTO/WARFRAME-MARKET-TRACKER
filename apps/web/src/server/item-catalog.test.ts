import { describe, expect, it } from "bun:test";

import { createItemCatalogCache, type ItemCatalogEntry } from "./item-catalog";

const catalog: ItemCatalogEntry[] = [
  {
    name: "Primed Continuity",
    slug: "primed_continuity",
    thumb: "primed_continuity.png",
  },
];

describe("createItemCatalogCache", () => {
  it("serves the loaded catalog", async () => {
    const cache = createItemCatalogCache({
      loadItems: async () => catalog,
      now: () => 1_000,
      ttlMs: 60_000,
    });

    await expect(cache.getItems()).resolves.toEqual(catalog);
  });

  it("serves stale data when a refresh fails after a successful warmup", async () => {
    let shouldFail = false;

    const cache = createItemCatalogCache({
      loadItems: async () => {
        if (shouldFail) {
          throw new Error("market temporarily unavailable");
        }

        return catalog;
      },
      now: (() => {
        let current = 1_000;
        return () => current++;
      })(),
      ttlMs: 0,
    });

    await expect(cache.getItems()).resolves.toEqual(catalog);
    shouldFail = true;
    await expect(cache.getItems()).resolves.toEqual(catalog);
  });
});
