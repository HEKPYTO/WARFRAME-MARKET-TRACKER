import { createItemSearchHandler } from "~/lib/item-search-route";
import { getItemCatalog } from "~/server/item-catalog";

export const GET = createItemSearchHandler({
  getItems: getItemCatalog,
});
