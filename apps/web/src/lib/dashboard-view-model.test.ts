import { describe, expect, it } from "bun:test";

import type { DashboardResponse, WorkspaceResponse } from "./api";
import {
  countPolledItems,
  createWorkspaceSummary,
  resolveSelectedRuleId,
} from "./dashboard-view-model";

const dashboard: DashboardResponse = {
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
    {
      createdAt: "2026-03-21T00:01:00.000Z",
      crossplay: true,
      enabled: false,
      id: "rule-2",
      itemSlug: "arcane_energize",
      maxPlatinum: 90,
      platform: "pc",
      sortOrder: 2,
      updatedAt: "2026-03-21T00:01:00.000Z",
      userId: "local-demo-user",
    },
  ],
};

const workspace: WorkspaceResponse = {
  marketTop: [
    {
      id: "order-1",
      itemId: "item-1",
      platinum: 7,
      quantity: 1,
      rank: 0,
      type: "sell",
      updatedAt: "2026-03-21T00:01:00.000Z",
      user: {
        id: "seller-1",
        ingameName: "vash2000",
        lastSeen: "2026-03-21T00:01:00.000Z",
        slug: "vash2000",
        status: "online",
      },
      visible: true,
    },
  ],
  offlineOrders: [
    {
      id: "order-2",
      itemId: "item-1",
      platinum: 6,
      quantity: 1,
      rank: 0,
      type: "sell",
      updatedAt: "2026-03-21T00:02:00.000Z",
      user: {
        id: "seller-2",
        ingameName: "sleepy_leaf",
        lastSeen: "2026-03-21T00:02:00.000Z",
        slug: "sleepy_leaf",
        status: "offline",
      },
      visible: true,
    },
  ],
  onlineOrders: [
    {
      id: "order-3",
      itemId: "item-1",
      platinum: 5,
      quantity: 1,
      rank: 0,
      type: "sell",
      updatedAt: "2026-03-21T00:03:00.000Z",
      user: {
        id: "seller-3",
        ingameName: "embereye",
        lastSeen: "2026-03-21T00:03:00.000Z",
        slug: "embereye",
        status: "ingame",
      },
      visible: true,
    },
  ],
  rule: dashboard.rules[0]!,
  setPricing: null,
};

describe("resolveSelectedRuleId", () => {
  it("keeps the explicit selection when it still exists", () => {
    expect(resolveSelectedRuleId("rule-2", dashboard)).toBe("rule-2");
  });

  it("falls back to the first dashboard rule when selection is missing", () => {
    expect(resolveSelectedRuleId(undefined, dashboard)).toBe("rule-1");
    expect(resolveSelectedRuleId("missing", dashboard)).toBe("rule-1");
  });
});

describe("createWorkspaceSummary", () => {
  it("derives the operator HUD metrics from dashboard and workspace state", () => {
    expect(createWorkspaceSummary(dashboard, workspace)).toEqual({
      lowestVisiblePrice: 7,
      offlineCount: 1,
      onlineCount: 1,
      polledItems: 1,
      trackedItems: 2,
      unreadAlerts: 1,
    });
  });

  it("returns zero-safe metrics when the workspace is not loaded yet", () => {
    expect(createWorkspaceSummary(dashboard, null)).toEqual({
      lowestVisiblePrice: null,
      offlineCount: 0,
      onlineCount: 0,
      polledItems: 1,
      trackedItems: 2,
      unreadAlerts: 1,
    });
  });
});

describe("countPolledItems", () => {
  it("counts unique enabled item slugs only", () => {
    expect(
      countPolledItems({
        ...dashboard,
        rules: [
          dashboard.rules[0]!,
          {
            ...dashboard.rules[0]!,
            id: "rule-3",
            itemSlug: "arcane_barrier",
            sortOrder: 3,
          },
          {
            ...dashboard.rules[0]!,
            enabled: true,
            id: "rule-4",
            itemSlug: "primed_continuity",
            sortOrder: 4,
          },
          dashboard.rules[1]!,
        ],
      }),
    ).toBe(2);
  });
});
