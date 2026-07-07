import { getRuleDisplayLabel } from "./rule-labels";

export function getAlertDisplayLabel(
  itemSlug: string,
  itemLabelsBySlug: Record<string, string>,
) {
  return getRuleDisplayLabel(itemSlug, itemLabelsBySlug);
}
