import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";

import { listVisibleSellOrders } from "~/lib/market-orders";

export interface SetPartPricingEntry {
  estimatedPrice: number | null;
  itemSlug: string;
  name: string;
  variance: number | null;
}

export interface SetPricingBreakdown {
  parts: SetPartPricingEntry[];
  totalEstimatedPrice: number | null;
  totalVariance: number | null;
}

interface PriceCluster {
  count: number;
  maxPrice: number;
  minPrice: number;
}

const MIN_EXACT_PRICE_SUPPORT = 3;

function isSetName(name: string) {
  return /\sset$/i.test(name);
}

function getSetBaseName(name: string) {
  return name.replace(/\s+set$/i, "").trim();
}

function compareCatalogEntriesByName(
  left: ItemCatalogEntry,
  right: ItemCatalogEntry,
) {
  return left.name.localeCompare(right.name);
}

function listSupportedExactPriceClusters(prices: number[]): PriceCluster[] {
  const countsByPrice = new Map<number, number>();

  for (const price of prices) {
    countsByPrice.set(price, (countsByPrice.get(price) ?? 0) + 1);
  }

  return [...countsByPrice.entries()]
    .filter(([, count]) => count >= MIN_EXACT_PRICE_SUPPORT)
    .sort(([leftPrice], [rightPrice]) => leftPrice - rightPrice)
    .map(([price, count]) => ({
      count,
      maxPrice: price,
      minPrice: price,
    }));
}

function getSellPrices(
  orders: MarketOrder[],
  includeOffline: boolean,
): number[] {
  return listVisibleSellOrders(orders)
    .filter((order) => includeOffline || order.user.status !== "offline")
    .map((order) => order.platinum);
}

export function getSetPartCatalogEntries(
  itemSlug: string,
  catalog: ItemCatalogEntry[],
): ItemCatalogEntry[] {
  const trackedItem = catalog.find((entry) => entry.slug === itemSlug);

  if (!trackedItem || !isSetName(trackedItem.name)) {
    return [];
  }

  const setBaseName = getSetBaseName(trackedItem.name);
  const partNamePrefix = `${setBaseName} `;

  return catalog
    .filter(
      (entry) =>
        entry.slug !== itemSlug &&
        entry.name.startsWith(partNamePrefix) &&
        !isSetName(entry.name),
    )
    .sort(compareCatalogEntriesByName);
}

export function estimateSupportedSetPartPrice(orders: MarketOrder[]): {
  estimatedPrice: number;
  variance: number;
} | null {
  const supportedClusters = listSupportedExactPriceClusters(
    getSellPrices(orders, true),
  );
  const visibleCluster = supportedClusters[0];

  if (!visibleCluster) {
    return null;
  }

  const nextComparableCluster = supportedClusters.find(
    (cluster) =>
      cluster.minPrice > visibleCluster.minPrice &&
      cluster.count >= visibleCluster.count,
  );

  return {
    estimatedPrice: visibleCluster.minPrice,
    variance: nextComparableCluster
      ? nextComparableCluster.minPrice - visibleCluster.minPrice
      : 0,
  };
}

export async function buildSetPricingBreakdown(input: {
  catalog: ItemCatalogEntry[];
  itemSlug: string;
  listItemOrders: (itemSlug: string) => Promise<MarketOrder[]>;
}): Promise<SetPricingBreakdown | null> {
  const partEntries = getSetPartCatalogEntries(input.itemSlug, input.catalog);

  if (partEntries.length === 0) {
    return null;
  }

  const pricedParts = await Promise.all(
    partEntries.map(async (entry) => {
      try {
        const estimate = estimateSupportedSetPartPrice(
          await input.listItemOrders(entry.slug),
        );

        return {
          estimatedPrice: estimate?.estimatedPrice ?? null,
          itemSlug: entry.slug,
          name: entry.name,
          variance: estimate?.variance ?? null,
        };
      } catch {
        return {
          estimatedPrice: null,
          itemSlug: entry.slug,
          name: entry.name,
          variance: null,
        };
      }
    }),
  );

  const estimatedParts = pricedParts.filter(
    (
      entry,
    ): entry is SetPartPricingEntry & {
      estimatedPrice: number;
      variance: number;
    } => entry.estimatedPrice !== null && entry.variance !== null,
  );

  return {
    parts: pricedParts,
    totalEstimatedPrice:
      estimatedParts.length === pricedParts.length
        ? estimatedParts.reduce(
            (total, entry) => total + entry.estimatedPrice,
            0,
          )
        : null,
    totalVariance:
      estimatedParts.length === pricedParts.length
        ? estimatedParts.reduce((total, entry) => total + entry.variance, 0)
        : null,
  };
}
