import { describe, expect, it } from "bun:test";

import type { DashboardResponse, WorkspaceResponse } from "~/lib/api";
import {
  DASHBOARD_BOOTSTRAP_ATTRIBUTE,
  createDashboardBootstrapState,
  createDashboardSessionCacheWriter,
  getDashboardBootstrapScript,
  persistDashboardSessionCache,
  readSelectedRuleIdFromSearch,
  readDashboardSessionCache,
  resolveDashboardBootstrapPayload,
  withSelectedRuleIdInSearch,
} from "./dashboard-bootstrap";
import { UNKNOWN_WORKER_HEALTH_SNAPSHOT } from "./worker-health";

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
      createdAt: "2026-03-21T00:01:00.000Z",
      crossplay: true,
      enabled: true,
      id: "rule-1",
      itemSlug: "arcane_barrier",
      maxPlatinum: 10,
      platform: "pc",
      sortOrder: 1,
      updatedAt: "2026-03-21T00:01:00.000Z",
      userId: "local-demo-user",
    },
    {
      createdAt: "2026-03-21T00:02:00.000Z",
      crossplay: true,
      enabled: true,
      id: "rule-2",
      itemSlug: "arcane_energize",
      maxPlatinum: 90,
      platform: "pc",
      sortOrder: 2,
      updatedAt: "2026-03-21T00:02:00.000Z",
      userId: "local-demo-user",
    },
  ],
};

const workspace: WorkspaceResponse = {
  marketTop: [],
  offlineOrders: [],
  onlineOrders: [],
  rule: dashboard.rules[0]!,
  setPricing: null,
};

function createMemoryStorage() {
  const entries = new Map<string, string>();

  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };
}

describe("createDashboardBootstrapState", () => {
  it("builds provider-ready state from an SSR payload", () => {
    const state = createDashboardBootstrapState({
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-1",
      workspaceByRuleId: {
        "rule-1": workspace,
      },
    });

    expect(state.dashboardMeta).toEqual(dashboard.meta);
    expect(state.dashboardSlices.ruleIds).toEqual(["rule-1", "rule-2"]);
    expect(state.selectedRuleId).toBe("rule-1");
    expect(state.workspaceByRuleId["rule-1"]).toEqual(workspace);
    expect(state.lastRefreshAt).toBe(1_710_000_000_000);
  });

  it("falls back to the first available rule when the selected id is missing", () => {
    const state = createDashboardBootstrapState({
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "missing-rule",
      workspaceByRuleId: {},
    });

    expect(state.selectedRuleId).toBe("rule-1");
  });

  it("defaults missing worker health state to unknown", () => {
    const state = createDashboardBootstrapState({
      cachedAt: 1_710_000_000_000,
      dashboard: {
        ...dashboard,
        meta: {
          ...dashboard.meta,
          workerHealthState: undefined as never,
        },
      },
      selectedRuleId: "rule-1",
      workspaceByRuleId: {},
    });

    expect(state.dashboardMeta.workerHealthState).toBe("unknown");
  });

  it("derives an unhealthy worker state when the payload omits it but failures are present", () => {
    const state = createDashboardBootstrapState({
      cachedAt: 1_710_000_000_000,
      dashboard: {
        ...dashboard,
        meta: {
          ...dashboard.meta,
          workerHealth: {
            ...dashboard.meta.workerHealth,
            consecutiveFailures: 1,
            lastActivityAt: null,
            lastErrorMessage: "Worker health unavailable from worker endpoint",
            lastSuccessfulCycleAt: null,
          },
          workerHealthState: undefined as never,
        },
      },
      selectedRuleId: "rule-1",
      workspaceByRuleId: {},
    });

    expect(state.dashboardMeta.workerHealthState).toBe("unhealthy");
  });
});

describe("readSelectedRuleIdFromSearch", () => {
  it("reads ruleId from a dashboard deep-link query string", () => {
    expect(readSelectedRuleIdFromSearch("?ruleId=rule-2")).toBe("rule-2");
  });

  it("ignores missing or blank rule ids", () => {
    expect(readSelectedRuleIdFromSearch("")).toBeUndefined();
    expect(readSelectedRuleIdFromSearch("?ruleId=")).toBeUndefined();
    expect(readSelectedRuleIdFromSearch("?ruleId=   ")).toBeUndefined();
  });
});

describe("withSelectedRuleIdInSearch", () => {
  it("stores the selected rule id in the search string", () => {
    expect(withSelectedRuleIdInSearch("", "rule-2")).toBe("?ruleId=rule-2");
  });

  it("preserves unrelated query params when updating the rule id", () => {
    expect(withSelectedRuleIdInSearch("?view=compact", "rule-2")).toBe(
      "?view=compact&ruleId=rule-2",
    );
  });

  it("removes the selected rule id when cleared", () => {
    expect(
      withSelectedRuleIdInSearch("?view=compact&ruleId=rule-2", undefined),
    ).toBe("?view=compact");
  });
});

describe("dashboard session cache", () => {
  it("round-trips dashboard and workspace snapshots through session storage", () => {
    const storage = createMemoryStorage();

    persistDashboardSessionCache(storage, {
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-2",
      workspaceByRuleId: {
        "rule-1": workspace,
      },
    });

    expect(
      readDashboardSessionCache(storage, {
        maxAgeMs: 60_000,
        now: 1_710_000_030_000,
      }),
    ).toEqual({
      cachedAt: 1_710_000_000_000,
      dashboard: {
        ...dashboard,
        meta: {
          ...dashboard.meta,
          workerHealth: UNKNOWN_WORKER_HEALTH_SNAPSHOT,
          workerHealthState: "unknown",
        },
      },
      selectedRuleId: "rule-2",
      workspaceByRuleId: {
        "rule-1": workspace,
      },
    });
  });

  it("treats cached worker health as unavailable until a live refresh confirms it", () => {
    const storage = createMemoryStorage();

    persistDashboardSessionCache(storage, {
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-1",
      workspaceByRuleId: {},
    });

    expect(
      readDashboardSessionCache(storage, {
        maxAgeMs: 60_000,
        now: 1_710_000_010_000,
      })?.dashboard.meta.workerHealth,
    ).toEqual(UNKNOWN_WORKER_HEALTH_SNAPSHOT);
  });

  it("drops stale cache entries", () => {
    const storage = createMemoryStorage();

    persistDashboardSessionCache(storage, {
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-1",
      workspaceByRuleId: {},
    });

    expect(
      readDashboardSessionCache(storage, {
        maxAgeMs: 15_000,
        now: 1_710_000_030_000,
      }),
    ).toBeNull();
  });

  it("drops malformed cache entries", () => {
    const storage = createMemoryStorage();
    storage.setItem("wmt-dashboard-session-cache:v1", "{ definitely not json");

    expect(
      readDashboardSessionCache(storage, {
        maxAgeMs: 60_000,
        now: 1_710_000_030_000,
      }),
    ).toBeNull();
  });

  it("coalesces repeated cache writes until the debounce window elapses", () => {
    const storage = createMemoryStorage();
    const timers = new Map<number, () => void>();
    let nextTimerId = 0;
    const writer = createDashboardSessionCacheWriter({
      clearTimeout: (timerId) => {
        timers.delete(timerId as number);
      },
      debounceMs: 50,
      setTimeout: (callback: () => void) => {
        const timerId = nextTimerId++;
        timers.set(timerId, callback);
        return timerId;
      },
      storage,
    });
    const payload = {
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-1",
      workspaceByRuleId: {},
    };

    writer.schedule(payload);
    writer.schedule({
      ...payload,
      cachedAt: 1_710_000_001_000,
    });

    expect(storage.getItem("wmt-dashboard-session-cache:v1")).toBeNull();
    expect(timers.size).toBe(1);

    timers.values().next().value?.();

    expect(
      readDashboardSessionCache(storage, {
        maxAgeMs: 60_000,
        now: 1_710_000_030_000,
      })?.cachedAt,
    ).toBe(1_710_000_001_000);
  });

  it("skips storage writes when the pending cache payload is unchanged", () => {
    let writeCount = 0;
    const persistedEntries = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return persistedEntries.get(key) ?? null;
      },
      removeItem(key: string) {
        persistedEntries.delete(key);
      },
      setItem(key: string, value: string) {
        writeCount += 1;
        persistedEntries.set(key, value);
      },
    };

    const timers = new Map<number, () => void>();
    let nextTimerId = 0;
    const writer = createDashboardSessionCacheWriter({
      clearTimeout: (timerId) => {
        timers.delete(timerId as number);
      },
      debounceMs: 50,
      setTimeout: (callback: () => void) => {
        const timerId = nextTimerId++;
        timers.set(timerId, callback);
        return timerId;
      },
      storage,
    });
    const payload = {
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-1",
      workspaceByRuleId: {},
    };

    writer.schedule(payload);
    timers.values().next().value?.();
    writer.schedule(payload);
    timers.values().next().value?.();

    expect(writeCount).toBe(1);
  });
});

describe("resolveDashboardBootstrapPayload", () => {
  it("reuses cached workspace payloads even when the url selects a specific rule", () => {
    expect(
      resolveDashboardBootstrapPayload({
        cachedBootstrapPayload: {
          cachedAt: 1_710_000_000_000,
          dashboard,
          selectedRuleId: "rule-1",
          workspaceByRuleId: {
            "rule-1": workspace,
            "rule-2": {
              ...workspace,
              rule: dashboard.rules[1]!,
            },
          },
        },
        initialBootstrapPayload: null,
        locationSelectedRuleId: "rule-2",
      }),
    ).toEqual({
      cachedAt: 1_710_000_000_000,
      dashboard,
      selectedRuleId: "rule-2",
      workspaceByRuleId: {
        "rule-1": workspace,
        "rule-2": {
          ...workspace,
          rule: dashboard.rules[1]!,
        },
      },
    });
  });
});

describe("getDashboardBootstrapScript", () => {
  it("marks the document as bootstrapping when cached dashboard data exists", () => {
    expect(getDashboardBootstrapScript()).toContain(
      DASHBOARD_BOOTSTRAP_ATTRIBUTE,
    );
    expect(getDashboardBootstrapScript()).toContain(
      "wmt-dashboard-session-cache:v1",
    );
  });
});
