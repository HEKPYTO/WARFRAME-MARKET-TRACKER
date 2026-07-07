import { describe, expect, it } from "bun:test";

import type { WorkspaceResponse } from "~/lib/api";

import {
  getMissingWorkspaceRuleIds,
  getWorkspaceRefreshPlan,
} from "./workspace-refresh-plan";

const workspace: WorkspaceResponse = {
  marketTop: [],
  offlineOrders: [],
  onlineOrders: [],
  rule: {
    createdAt: "2026-03-25T00:00:00.000Z",
    crossplay: true,
    enabled: true,
    id: "rule-1",
    itemSlug: "arcane_barrier",
    maxPlatinum: 10,
    platform: "pc",
    sortOrder: 1,
    updatedAt: "2026-03-25T00:00:00.000Z",
    userId: "local-demo-user",
  },
  setPricing: null,
};

describe("getWorkspaceRefreshPlan", () => {
  it("refreshes the selected rule and only warms uncached non-selected workspaces", () => {
    expect(
      getWorkspaceRefreshPlan({
        maxBackgroundRuleIds: 1,
        preferredRuleId: "rule-2",
        ruleIds: ["rule-1", "rule-2", "rule-3"],
        workspaceByRuleId: {
          "rule-1": workspace,
          "rule-2": {
            ...workspace,
            rule: {
              ...workspace.rule,
              id: "rule-2",
            },
          },
        },
      }),
    ).toEqual({
      backgroundRuleIds: ["rule-3"],
      primaryRuleId: "rule-2",
    });
  });

  it("limits background warmup to one uncached workspace at a time when requested", () => {
    expect(
      getWorkspaceRefreshPlan({
        maxBackgroundRuleIds: 1,
        preferredRuleId: "rule-1",
        ruleIds: ["rule-1", "rule-2", "rule-3", "rule-4"],
        workspaceByRuleId: {},
      }),
    ).toEqual({
      backgroundRuleIds: ["rule-2"],
      primaryRuleId: "rule-1",
    });
  });

  it("falls back to the first rule when the preferred rule is missing", () => {
    expect(
      getWorkspaceRefreshPlan({
        preferredRuleId: "missing",
        ruleIds: ["rule-5", "rule-2"],
        workspaceByRuleId: {},
      }),
    ).toEqual({
      backgroundRuleIds: ["rule-2"],
      primaryRuleId: "rule-5",
    });
  });

  it("returns no targets when there are no rules", () => {
    expect(
      getWorkspaceRefreshPlan({
        preferredRuleId: "rule-1",
        ruleIds: [],
        workspaceByRuleId: {},
      }),
    ).toEqual({
      backgroundRuleIds: [],
      primaryRuleId: undefined,
    });
  });
});

describe("getMissingWorkspaceRuleIds", () => {
  it("returns every missing workspace slice in stable rule order", () => {
    expect(
      getMissingWorkspaceRuleIds({
        ruleIds: ["rule-3", "rule-1", "rule-2", "rule-4"],
        workspaceByRuleId: {
          "rule-1": workspace,
          "rule-4": {
            ...workspace,
            rule: {
              ...workspace.rule,
              id: "rule-4",
            },
          },
        },
      }),
    ).toEqual(["rule-3", "rule-2"]);
  });
});
