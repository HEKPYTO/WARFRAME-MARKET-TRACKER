import { createWatchRule } from "@warframe-market-tracker/db";

import { assertTrackableItemSlug } from "~/lib/rule-validation";
import { createCreateWatchRuleHandler } from "~/lib/watch-rule-create-route";
import { createWebMarketClient } from "~/server/market-client";

export async function POST(event: { request: Request }) {
  return createCreateWatchRuleHandler({
    createWatchRule,
    listItemOrders: async (itemSlug) =>
      createWebMarketClient().getItemOrders(itemSlug),
    validateTrackableItemSlug:
      process.env.SKIP_MARKET_VALIDATION === "true"
        ? async () => undefined
        : async (itemSlug) =>
            assertTrackableItemSlug(itemSlug, createWebMarketClient()),
  })(event);
}
