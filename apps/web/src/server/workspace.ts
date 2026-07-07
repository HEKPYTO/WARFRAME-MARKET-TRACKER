import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import { getWatchRule } from "@warframe-market-tracker/db";
import { listVisibleSellOrders } from "~/lib/market-orders";
import { getItemCatalog } from "./item-catalog";
import { createWebMarketClient } from "./market-client";
import type { SetPricingBreakdown } from "./set-pricing";
import { buildSetPricingBreakdown } from "./set-pricing";
import { createSetPricingCache } from "./set-pricing-cache";

const SET_PRICING_TTL_MS = 30_000;

const setPricingCache = createSetPricingCache({
  loadSetPricing: async (itemSlug) => {
    const marketClient = createWebMarketClient();

    return buildSetPricingBreakdown({
      catalog: await getItemCatalog(),
      itemSlug,
      listItemOrders: (partItemSlug) =>
        marketClient.getItemOrders(partItemSlug),
    });
  },
  ttlMs: SET_PRICING_TTL_MS,
});

export interface WorkspaceSnapshot {
  marketTop: MarketOrder[];
  offlineOrders: MarketOrder[];
  onlineOrders: MarketOrder[];
  rule: NonNullable<Awaited<ReturnType<typeof getWatchRule>>>;
  setPricing: SetPricingBreakdown | null;
}

export async function getWorkspaceSnapshot(
  ruleId: string,
): Promise<WorkspaceSnapshot | null> {
  const rule = await getWatchRule(ruleId);

  if (!rule) {
    return null;
  }

  const marketClient = createWebMarketClient();
  const orders = await marketClient.getItemOrders(rule.itemSlug);
  const visibleSellOrders = listVisibleSellOrders(orders);
  const qualifyingOrders = visibleSellOrders.filter(
    (order) => order.platinum <= rule.maxPlatinum,
  );
  let setPricing: SetPricingBreakdown | null = null;

  try {
    setPricing = await setPricingCache.getSetPricing(rule.itemSlug);
  } catch {
    setPricing = null;
  }

  return {
    marketTop: visibleSellOrders.slice(0, 12),
    offlineOrders: qualifyingOrders.filter(
      (order) => order.user.status === "offline",
    ),
    onlineOrders: qualifyingOrders.filter(
      (order) => order.user.status !== "offline",
    ),
    rule,
    setPricing,
  };
}
