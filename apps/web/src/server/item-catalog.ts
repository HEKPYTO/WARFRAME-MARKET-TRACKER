import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";

import { createWebMarketClient } from "./market-client";

export type { ItemCatalogEntry };

export interface ItemCatalogCache {
  getItems(): Promise<ItemCatalogEntry[]>;
}

export function createItemCatalogCache(options: {
  loadItems: () => Promise<ItemCatalogEntry[]>;
  now?: () => number;
  ttlMs: number;
}): ItemCatalogCache {
  let cachedItems: ItemCatalogEntry[] | undefined;
  let expiresAt = 0;
  let inFlightLoad: Promise<ItemCatalogEntry[]> | undefined;

  const now = options.now ?? Date.now;

  async function refreshItems() {
    if (inFlightLoad) {
      return inFlightLoad;
    }

    inFlightLoad = options
      .loadItems()
      .then((items) => {
        cachedItems = items;
        expiresAt = now() + options.ttlMs;
        return items;
      })
      .finally(() => {
        inFlightLoad = undefined;
      });

    return inFlightLoad;
  }

  return {
    async getItems() {
      if (cachedItems === undefined) {
        return refreshItems();
      }

      if (now() < expiresAt) {
        return cachedItems;
      }

      try {
        return await refreshItems();
      } catch {
        return cachedItems;
      }
    },
  };
}

const ITEM_CATALOG_TTL_MS = 15 * 60 * 1_000;

const itemCatalogCache = createItemCatalogCache({
  loadItems: async () => createWebMarketClient().listItems(),
  ttlMs: ITEM_CATALOG_TTL_MS,
});

export function getItemCatalog(): Promise<ItemCatalogEntry[]> {
  return itemCatalogCache.getItems();
}
