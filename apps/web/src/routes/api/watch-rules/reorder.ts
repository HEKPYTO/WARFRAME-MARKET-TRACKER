import { listWatchRules, reorderWatchRules } from "@warframe-market-tracker/db";

import { createWatchRuleReorderHandler } from "~/lib/watch-rule-reorder-route";

const handleWatchRuleReorder = createWatchRuleReorderHandler({
  listRuleIds: async () => (await listWatchRules()).map((rule) => rule.id),
  reorderRuleIds: reorderWatchRules,
});

export async function PATCH(event: { request: Request }) {
  return handleWatchRuleReorder(event);
}
