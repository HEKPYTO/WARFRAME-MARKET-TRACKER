import type { ItemCatalogEntry } from "~/server/item-catalog";
import { searchCatalogItems } from "./item-search";
import { createMarketUpstreamErrorResponse } from "./market-upstream-response";

function parseLimit(rawValue: string | null): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return 8;
  }

  return Math.min(parsed, 20);
}

export function createItemSearchHandler(deps: {
  getItems: () => Promise<ItemCatalogEntry[]>;
}) {
  return async function handleItemSearch(event: { request: Request }) {
    const url = new URL(event.request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";

    if (query.length < 2) {
      return Response.json(
        {
          error: "Search query must be at least 2 characters",
        },
        {
          status: 400,
        },
      );
    }

    const limit = parseLimit(url.searchParams.get("limit"));
    let items: ItemCatalogEntry[];

    try {
      items = await deps.getItems();
    } catch (error) {
      const response = createMarketUpstreamErrorResponse(error);

      if (response) {
        return response;
      }

      throw error;
    }

    return Response.json({
      items: searchCatalogItems(items, query, limit),
    });
  };
}
