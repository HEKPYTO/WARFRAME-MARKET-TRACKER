import type { WatchRuleRecord } from "@warframe-market-tracker/db";

export function getWatchlistRuleIds(rules: WatchRuleRecord[]) {
  return rules.map((rule) => rule.id);
}

export function getWatchlistRuleById(rules: WatchRuleRecord[], ruleId: string) {
  return rules.find((rule) => rule.id === ruleId);
}
