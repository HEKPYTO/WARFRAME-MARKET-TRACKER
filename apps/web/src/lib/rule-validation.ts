import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import {
  MarketClientError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

export class RuleValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RuleValidationError";
  }
}

export async function assertTrackableItemSlug(
  itemSlug: string,
  marketClient: {
    getItemOrders: (slug: string) => Promise<MarketOrder[]>;
  },
): Promise<MarketOrder[]> {
  try {
    return await marketClient.getItemOrders(itemSlug);
  } catch (error) {
    if (error instanceof MarketClientTimeoutError) {
      throw new RuleValidationError(
        "Market data timed out upstream. Try again shortly.",
        503,
      );
    }

    if (error instanceof MarketClientError && error.status === 404) {
      throw new RuleValidationError("Unknown item slug", 422);
    }

    if (error instanceof MarketClientError && error.status === 429) {
      throw new RuleValidationError(
        "Market data is temporarily rate limited upstream. Try again shortly.",
        503,
      );
    }

    throw new RuleValidationError("Unable to validate item slug", 502);
  }
}
