import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import type {
  CreateWatchRuleInput,
  WatchRuleRecord,
} from "@warframe-market-tracker/db";
import { z } from "zod";

import { getLowestVisibleSellPrice } from "~/lib/market-orders";
import { createMarketUpstreamErrorResponse } from "~/lib/market-upstream-response";
import { RuleValidationError } from "~/lib/rule-validation";

const createWatchRuleSchema = z.object({
  itemSlug: z.string().trim().min(1),
  maxPlatinum: z.number().int().nonnegative().optional(),
});

export function createCreateWatchRuleHandler(dependencies: {
  createWatchRule: (input: CreateWatchRuleInput) => Promise<WatchRuleRecord>;
  listItemOrders: (itemSlug: string) => Promise<MarketOrder[]>;
  validateTrackableItemSlug: (
    itemSlug: string,
  ) => Promise<MarketOrder[] | undefined>;
}) {
  return async function POST(event: { request: Request }) {
    const body = createWatchRuleSchema.parse(await event.request.json());
    let validatedOrders: MarketOrder[] | undefined;

    try {
      validatedOrders = await dependencies.validateTrackableItemSlug(
        body.itemSlug,
      );
    } catch (error) {
      if (error instanceof RuleValidationError) {
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }

      throw error;
    }

    let resolvedMaxPlatinum = body.maxPlatinum;

    if (resolvedMaxPlatinum === undefined) {
      try {
        resolvedMaxPlatinum = getLowestVisibleSellPrice(
          validatedOrders ?? (await dependencies.listItemOrders(body.itemSlug)),
        );
      } catch (error) {
        const response = createMarketUpstreamErrorResponse(error);

        if (response) {
          return response;
        }

        throw error;
      }
    }

    const rule = await dependencies.createWatchRule({
      crossplay: true,
      itemSlug: body.itemSlug,
      maxPlatinum: resolvedMaxPlatinum,
      platform: "pc",
    });

    return Response.json(rule, {
      status: 201,
    });
  };
}
