import { describe, expect, it } from "bun:test";

import type { WatchRuleRecord } from "@warframe-market-tracker/db";

import { getWatchlistRuleById, getWatchlistRuleIds } from "./watchlist-rules";

function createRule(
  overrides: Partial<WatchRuleRecord> &
    Pick<WatchRuleRecord, "id" | "itemSlug">,
): WatchRuleRecord {
  return {
    createdAt: "2026-03-26T00:00:00.000Z",
    crossplay: true,
    enabled: true,
    id: overrides.id,
    itemSlug: overrides.itemSlug,
    maxPlatinum: overrides.maxPlatinum ?? 10,
    platform: "pc",
    sortOrder: overrides.sortOrder ?? 1,
    updatedAt: overrides.updatedAt ?? "2026-03-26T00:00:00.000Z",
    userId: overrides.userId ?? "local-demo-user",
  };
}

describe("getWatchlistRuleIds", () => {
  it("returns stable rule ids in display order", () => {
    expect(
      getWatchlistRuleIds([
        createRule({ id: "rule-1", itemSlug: "arcane_barrier", sortOrder: 1 }),
        createRule({
          id: "rule-2",
          itemSlug: "primed_continuity",
          sortOrder: 2,
        }),
      ]),
    ).toEqual(["rule-1", "rule-2"]);
  });
});

describe("getWatchlistRuleById", () => {
  it("resolves the latest rule payload from refreshed dashboard data", () => {
    const previousRule = createRule({
      id: "rule-1",
      itemSlug: "arcane_barrier",
      maxPlatinum: 10,
    });
    const refreshedRule = createRule({
      id: "rule-1",
      itemSlug: "arcane_barrier",
      maxPlatinum: 42,
      updatedAt: "2026-03-26T00:00:05.000Z",
    });

    expect(getWatchlistRuleById([refreshedRule], previousRule.id)).toEqual(
      refreshedRule,
    );
  });
});
