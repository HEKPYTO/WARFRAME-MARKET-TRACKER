import { describe, expect, it } from "bun:test";

import type { DashboardResponse } from "~/lib/api";
import {
  createDashboardSlices,
  removeAlertFromSlices,
  removeRuleFromSlices,
  reorderRulesInSlices,
  replaceRuleInSlices,
  updateRuleInSlices,
  upsertRuleInSlices,
} from "./dashboard-state";

const snapshot: DashboardResponse = {
  alerts: [
    {
      createdAt: "2026-03-21T00:00:00.000Z",
      id: "alert-1",
      itemSlug: "arcane_barrier",
      lastSeen: "2026-03-21T00:00:00.000Z",
      observedAt: "2026-03-21T00:00:00.000Z",
      platinum: 9,
      readAt: null,
      ruleId: "rule-1",
      sellerId: "seller-1",
      sellerName: "vash2000",
      sellerSlug: "vash2000",
      status: "online",
      userId: "local-demo-user",
    },
  ],
  meta: {
    marketCrossplay: true,
    marketPlatform: "pc",
    safeRequestSpacingMs: 500,
    safeRequestsPerSecond: 2,
    trackingPaused: false,
    theoreticalRequestsPerSecond: 3,
    workerHealth: {
      consecutiveFailures: 0,
      expectedCycleIntervalMs: 5_000,
      lastActivityAt: "2026-03-23T00:00:05.000Z",
      lastCycleStartedAt: "2026-03-23T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: "2026-03-23T00:00:05.000Z",
      observedCycleIntervalMs: 5_000,
      trackingPaused: false,
    },
    workerHealthState: "healthy",
  },
  rules: [
    {
      createdAt: "2026-03-21T00:00:00.000Z",
      crossplay: true,
      enabled: true,
      id: "rule-1",
      itemSlug: "arcane_barrier",
      maxPlatinum: 10,
      platform: "pc",
      sortOrder: 1,
      updatedAt: "2026-03-21T00:00:00.000Z",
      userId: "local-demo-user",
    },
  ],
};

describe("createDashboardSlices", () => {
  it("normalizes rules and alerts into ordered ids and records", () => {
    expect(createDashboardSlices(snapshot)).toEqual({
      alertIds: ["alert-1"],
      alertsById: {
        "alert-1": snapshot.alerts[0]!,
      },
      ruleIds: ["rule-1"],
      rulesById: {
        "rule-1": snapshot.rules[0]!,
      },
    });
  });
});

describe("upsertRuleInSlices", () => {
  it("appends a newly created rule without disturbing existing ids", () => {
    const next = upsertRuleInSlices(createDashboardSlices(snapshot), {
      ...snapshot.rules[0]!,
      id: "rule-2",
      itemSlug: "arcane_energize",
      sortOrder: 2,
    });

    expect(next.ruleIds).toEqual(["rule-1", "rule-2"]);
    expect(next.rulesById["rule-2"]?.itemSlug).toBe("arcane_energize");
  });
});

describe("replaceRuleInSlices", () => {
  it("replaces a temporary rule id with the persisted rule id", () => {
    const withTemp = upsertRuleInSlices(createDashboardSlices(snapshot), {
      ...snapshot.rules[0]!,
      id: "temp-rule",
      itemSlug: "temp_item",
    });

    const next = replaceRuleInSlices(withTemp, "temp-rule", {
      ...snapshot.rules[0]!,
      id: "rule-2",
      itemSlug: "arcane_energize",
      sortOrder: 2,
    });

    expect(next.ruleIds).toEqual(["rule-1", "rule-2"]);
    expect(next.rulesById["temp-rule"]).toBeUndefined();
    expect(next.rulesById["rule-2"]?.itemSlug).toBe("arcane_energize");
  });
});

describe("removeRuleFromSlices", () => {
  it("removes a temporary rule and its related alerts cleanly on rollback", () => {
    const withTemp = upsertRuleInSlices(createDashboardSlices(snapshot), {
      ...snapshot.rules[0]!,
      id: "temp-rule",
      itemSlug: "temp_item",
    });
    const withTempAlert = {
      ...withTemp,
      alertIds: [...withTemp.alertIds, "alert-2"],
      alertsById: {
        ...withTemp.alertsById,
        "alert-2": {
          ...snapshot.alerts[0]!,
          id: "alert-2",
          ruleId: "temp-rule",
        },
      },
    };

    const next = removeRuleFromSlices(withTempAlert, "temp-rule");

    expect(next.ruleIds).toEqual(["rule-1"]);
    expect(next.rulesById["temp-rule"]).toBeUndefined();
    expect(next.alertIds).toEqual(["alert-1"]);
    expect(next.alertsById["alert-2"]).toBeUndefined();
  });
});

describe("updateRuleInSlices", () => {
  it("updates an existing rule threshold without disturbing order", () => {
    const next = updateRuleInSlices(createDashboardSlices(snapshot), "rule-1", {
      maxPlatinum: 42,
    });

    expect(next.ruleIds).toEqual(["rule-1"]);
    expect(next.rulesById["rule-1"]?.maxPlatinum).toBe(42);
  });
});

describe("reorderRulesInSlices", () => {
  it("reorders rule ids without disturbing rule records or alerts", () => {
    const baseSlices = upsertRuleInSlices(createDashboardSlices(snapshot), {
      ...snapshot.rules[0]!,
      id: "rule-2",
      itemSlug: "arcane_energize",
      sortOrder: 2,
    });

    const next = reorderRulesInSlices(baseSlices, ["rule-1", "rule-2"]);

    expect(next.ruleIds).toEqual(["rule-1", "rule-2"]);
    expect(next.rulesById["rule-1"]?.itemSlug).toBe("arcane_barrier");
    expect(next.rulesById["rule-2"]?.itemSlug).toBe("arcane_energize");
    expect(next.alertIds).toEqual(["alert-1"]);
  });
});

describe("removeAlertFromSlices", () => {
  it("removes a single alert without disturbing rules", () => {
    const next = removeAlertFromSlices(
      createDashboardSlices(snapshot),
      "alert-1",
    );

    expect(next.ruleIds).toEqual(["rule-1"]);
    expect(next.alertIds).toEqual([]);
    expect(next.alertsById["alert-1"]).toBeUndefined();
  });
});
