import { describe, expect, it, mock } from "bun:test";

import type { WatchAlert } from "@warframe-market-tracker/alert-engine";
import {
  createPollOnce,
  createPollScheduler,
  createWorkerHealthMonitor,
  createWorkerLoop,
  getWorkerIdleDelayMs,
} from "./index";

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve,
  };
}

function createMissingRulePersistenceError(constraintName: string) {
  return Object.assign(
    new Error(
      `insert or update on table violates foreign key constraint "${constraintName}"`,
    ),
    {
      code: "23503",
      constraint_name: constraintName,
    },
  );
}

describe("getWorkerIdleDelayMs", () => {
  it("returns no additional delay once the active cycle already covered the shared interval", () => {
    expect(
      getWorkerIdleDelayMs({
        polledItems: 10,
        safeRequestSpacingMs: 500,
      }),
    ).toBe(0);
  });

  it("returns no polling delay when there are no tracked items", () => {
    expect(
      getWorkerIdleDelayMs({
        polledItems: 0,
        safeRequestSpacingMs: 500,
      }),
    ).toBeNull();
  });
});

describe("poll scheduler", () => {
  it("respects the minimum request spacing between fetch starts", () => {
    let now = 0;
    const scheduler = createPollScheduler({
      now: () => now,
      safeRequestSpacingMs: 500,
    });

    expect(scheduler.getNextFetchDelayMs()).toBe(0);
    scheduler.recordFetchStart();

    now = 250;
    expect(scheduler.getNextFetchDelayMs()).toBe(250);

    now = 500;
    expect(scheduler.getNextFetchDelayMs()).toBe(0);
  });

  it("exposes the configured adaptive concurrency mode without changing safe spacing", () => {
    let now = 0;
    const scheduler = createPollScheduler({
      now: () => now,
      safeRequestSpacingMs: 500,
      mode: {
        adaptiveConcurrencyMode: "adaptive",
      },
    });

    expect(scheduler.getMode()).toEqual({
      adaptiveConcurrencyMode: "adaptive",
    });
    expect(scheduler.getNextFetchDelayMs()).toBe(0);

    scheduler.recordFetchStart();
    now = 250;
    expect(scheduler.getNextFetchDelayMs()).toBe(250);

    now = 500;
    expect(scheduler.getNextFetchDelayMs()).toBe(0);
  });

  it("keeps request spacing within the same safe budget for both adaptive modes", () => {
    for (const adaptiveConcurrencyMode of ["baseline", "adaptive"] as const) {
      let now = 0;
      const scheduler = createPollScheduler({
        now: () => now,
        safeRequestSpacingMs: 500,
        mode: {
          adaptiveConcurrencyMode,
        },
      });

      expect(scheduler.getMode()).toEqual({
        adaptiveConcurrencyMode,
      });
      expect(scheduler.getNextFetchDelayMs()).toBe(0);

      scheduler.recordFetchStart();
      now = 250;
      expect(scheduler.getNextFetchDelayMs()).toBe(250);

      now = 500;
      expect(scheduler.getNextFetchDelayMs()).toBe(0);
    }
  });

  it("preserves the conservative request cadence during pollOnce", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    const fetchStarts: number[] = [];
    const firstFetchReleased = createDeferred<[]>();
    const secondFetchStarted = createDeferred<void>();

    Date.now = () => now;

    try {
      const pollOnce = createPollOnce({
        createAlerts: async () => [],
        evaluateWatchRule: () => ({ alerts: [], observations: [] }),
        getMarketClient: () => ({
          getItemOrders: async (itemSlug: string) => {
            fetchStarts.push(now);
            if (itemSlug === "hot_item") {
              secondFetchStarted.resolve();
              return [];
            }

            return firstFetchReleased.promise;
          },
        }),
        getSellerObservations: async () => [],
        getUserSettings: async () => ({
          discordBotToken: "bot-token",
          discordChannelId: "channel-id",
          discordEnabled: true,
          trackingPaused: false,
        }),
        listEnabledWatchRules: async () => [
          {
            createdAt: "2026-03-30T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: "rule-1",
            itemSlug: "cold_item",
            maxPlatinum: 10,
            platform: "pc",
            sortOrder: 0,
            updatedAt: "2026-03-30T00:00:00.000Z",
            userId: "user-1",
          },
          {
            createdAt: "2026-03-30T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: "rule-2",
            itemSlug: "hot_item",
            maxPlatinum: 10,
            platform: "pc",
            sortOrder: 1,
            updatedAt: "2026-03-30T00:00:00.000Z",
            userId: "user-1",
          },
        ],
        replaceSellerObservations: async () => undefined,
        schedulerMode: {
          adaptiveConcurrencyMode: "baseline",
        },
        sendDiscordNotifications: async () => undefined,
        sleep: async (ms: number) => {
          now += ms;
        },
      });

      const pollPromise = pollOnce();
      await secondFetchStarted.promise;

      expect(fetchStarts).toEqual([0, 500]);
      firstFetchReleased.resolve([]);
      await pollPromise;
    } finally {
      Date.now = originalDateNow;
    }
  });
});

describe("createPollOnce", () => {
  it("loads user settings once per cycle even when multiple rules alert", async () => {
    const loadUserSettings = mock(async () => ({
      discordBotToken: "bot-token",
      discordChannelId: "channel-id",
      discordEnabled: true,
      trackingPaused: false,
    }));
    const sendDiscordNotifications = mock(async () => undefined);
    const evaluateWatchRule = mock(({ rule }) => ({
      alerts: [
        {
          itemSlug: rule.itemSlug,
          lastSeen: "2026-03-27T00:00:00.000Z",
          observedAt: "2026-03-27T00:00:00.000Z",
          platinum: 9,
          sellerName: `seller-${rule.id}`,
          sellerId: `seller-${rule.id}`,
          sellerSlug: `seller-${rule.id}`,
          status: "ingame" as const,
          ruleId: rule.id,
        },
      ],
      observations: [],
    }));

    const pollOnce = createPollOnce({
      createAlerts: async (alerts) =>
        alerts.map((alert, index) => ({
          createdAt: "2026-03-27T00:00:00.000Z",
          id: `alert-${index}`,
          itemSlug: alert.itemSlug,
          lastSeen: alert.lastSeen,
          observedAt: alert.observedAt,
          platinum: alert.platinum,
          readAt: null,
          ruleId: alert.ruleId,
          sellerId: alert.sellerId,
          sellerName: alert.sellerName,
          sellerSlug: alert.sellerSlug,
          status: alert.status,
          userId: "user-1",
        })),
      evaluateWatchRule,
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: loadUserSettings,
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-27T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-27T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-27T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "arcane_barrier",
          maxPlatinum: 12,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-27T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications,
      sleep: async () => undefined,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 1,
      polledRules: 2,
    });
    expect(loadUserSettings).toHaveBeenCalledTimes(1);
    expect(sendDiscordNotifications).toHaveBeenCalledTimes(2);
    expect(evaluateWatchRule).toHaveBeenCalledTimes(2);
  });

  it("keeps request starts within the safe budget for both adaptive modes", async () => {
    for (const adaptiveConcurrencyMode of ["baseline", "adaptive"] as const) {
      const originalDateNow = Date.now;
      let now = 0;
      const itemFetchStarts: number[] = [];
      const secondFetchStarted = createDeferred<void>();
      Date.now = () => now;

      try {
        const pollOnce = createPollOnce({
          createAlerts: async () => [],
          evaluateWatchRule: () => ({ alerts: [], observations: [] }),
          getMarketClient: () => ({
            getItemOrders: async (itemSlug: string) => {
              itemFetchStarts.push(now);

              if (itemSlug === "hot_item") {
                secondFetchStarted.resolve();
              }

              return [];
            },
          }),
          getSellerObservations: async () => [],
          getUserSettings: async () => ({
            discordBotToken: "bot-token",
            discordChannelId: "channel-id",
            discordEnabled: true,
            trackingPaused: false,
          }),
          listEnabledWatchRules: async () => [
            {
              createdAt: "2026-03-30T00:00:00.000Z",
              crossplay: true,
              enabled: true,
              id: "rule-cold",
              itemSlug: "cold_item",
              maxPlatinum: 10,
              platform: "pc",
              sortOrder: 0,
              updatedAt: "2026-03-30T00:00:00.000Z",
              userId: "user-1",
            },
            {
              createdAt: "2026-03-30T00:00:00.000Z",
              crossplay: true,
              enabled: true,
              id: "rule-hot",
              itemSlug: "hot_item",
              maxPlatinum: 10,
              platform: "pc",
              sortOrder: 1,
              updatedAt: "2026-03-30T00:00:00.000Z",
              userId: "user-1",
            },
          ],
          replaceSellerObservations: async () => undefined,
          schedulerMode: {
            adaptiveConcurrencyMode,
          },
          sendDiscordNotifications: async () => undefined,
          sleep: async (ms: number) => {
            now += ms;
          },
        });

        const pollPromise = pollOnce();
        await secondFetchStarted.promise;

        expect(itemFetchStarts).toEqual([0, 500]);
        await pollPromise;
      } finally {
        Date.now = originalDateNow;
      }
    }
  });

  it("skips polling entirely when tracking is paused", async () => {
    const listEnabledWatchRules = mock(async () => {
      throw new Error("should not load rules while paused");
    });
    const getMarketClient = mock(() => ({
      getItemOrders: async () => {
        throw new Error("should not fetch orders while paused");
      },
    }));
    const evaluateWatchRule = mock(() => {
      throw new Error("should not evaluate while paused");
    });
    const createAlerts = mock(async () => {
      throw new Error("should not create alerts while paused");
    });
    const replaceSellerObservations = mock(async () => {
      throw new Error("should not replace observations while paused");
    });
    const sendDiscordNotifications = mock(async () => {
      throw new Error("should not send notifications while paused");
    });
    const getUserSettings = mock(async () => ({
      discordBotToken: "bot-token",
      discordChannelId: "channel-id",
      discordEnabled: true,
      trackingPaused: true,
    }));

    const pollOnce = createPollOnce({
      createAlerts,
      evaluateWatchRule,
      getMarketClient,
      getSellerObservations: async () => [],
      getUserSettings,
      listEnabledWatchRules,
      replaceSellerObservations,
      sendDiscordNotifications,
      sleep: async () => undefined,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 0,
      polledRules: 0,
      trackingPaused: true,
    });
    expect(getUserSettings).toHaveBeenCalledTimes(1);
    expect(listEnabledWatchRules).not.toHaveBeenCalled();
    expect(getMarketClient).not.toHaveBeenCalled();
    expect(evaluateWatchRule).not.toHaveBeenCalled();
    expect(createAlerts).not.toHaveBeenCalled();
    expect(replaceSellerObservations).not.toHaveBeenCalled();
    expect(sendDiscordNotifications).not.toHaveBeenCalled();
  });

  it("loads seller observations for all item rules in one batched read", async () => {
    const getSellerObservations = mock(async () => {
      throw new Error("per-rule observation reads should be bypassed");
    });
    const getSellerObservationsByRuleIds = mock(async (_ruleIds: string[]) => ({
      "rule-1": [],
      "rule-2": [],
    }));

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations,
      getSellerObservationsByRuleIds,
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "arcane_barrier",
          maxPlatinum: 12,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "baseline",
      },
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 1,
      polledRules: 2,
    });
    expect(getSellerObservationsByRuleIds).toHaveBeenCalledTimes(1);
    expect(getSellerObservationsByRuleIds).toHaveBeenCalledWith([
      "rule-1",
      "rule-2",
    ]);
    expect(getSellerObservations).not.toHaveBeenCalled();
  });

  it("persists all evaluated rules for one item through one batched write", async () => {
    const createAlerts = mock(async () => {
      throw new Error("per-rule alert writes should be bypassed");
    });
    const replaceSellerObservations = mock(async () => {
      throw new Error("per-rule observation writes should be bypassed");
    });
    const syncItemEvaluationBatch = mock(
      async (entries: Array<{ alerts: WatchAlert[] }>) =>
        entries.flatMap((entry) => entry.alerts),
    );

    const pollOnce = createPollOnce({
      createAlerts,
      evaluateWatchRule: ({ rule }) => ({
        alerts: [
          {
            itemSlug: rule.itemSlug,
            lastSeen: "2026-03-30T00:00:00.000Z",
            observedAt: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            ruleId: rule.id,
            sellerId: "seller-1",
            sellerName: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
        observations: [],
      }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "arcane_barrier",
          maxPlatinum: 12,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
      syncItemEvaluationBatch,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 1,
      polledRules: 2,
    });
    expect(syncItemEvaluationBatch).toHaveBeenCalledTimes(1);
    expect(createAlerts).not.toHaveBeenCalled();
    expect(replaceSellerObservations).not.toHaveBeenCalled();
  });

  it("uses syncRuleEvaluation for per-rule persistence when available", async () => {
    const createAlerts = mock(async () => {
      throw new Error("per-rule alert writes should be bypassed");
    });
    const replaceSellerObservations = mock(async () => {
      throw new Error("per-rule observation writes should be bypassed");
    });
    const syncRuleEvaluation = mock(
      async (
        _ruleId: string,
        entry: { alerts: WatchAlert[]; observations: unknown[] },
      ) =>
        entry.alerts.map((alert, index) => ({
          createdAt: "2026-03-30T00:00:00.000Z",
          id: `alert-${index}`,
          itemSlug: alert.itemSlug,
          lastSeen: alert.lastSeen,
          observedAt: alert.observedAt,
          platinum: alert.platinum,
          readAt: null,
          ruleId: alert.ruleId,
          sellerId: alert.sellerId,
          sellerName: alert.sellerName,
          sellerSlug: alert.sellerSlug,
          status: alert.status,
          userId: "user-1",
        })),
    );

    const pollOnce = createPollOnce({
      createAlerts,
      evaluateWatchRule: ({ rule }) => ({
        alerts: [
          {
            itemSlug: rule.itemSlug,
            lastSeen: "2026-03-30T00:00:00.000Z",
            observedAt: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            ruleId: rule.id,
            sellerId: "seller-1",
            sellerName: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
        observations: [
          {
            alertState: "sent" as const,
            lastSeen: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            sellerId: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
      }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
      syncRuleEvaluation,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 1,
      polledRules: 2,
    });
    expect(syncRuleEvaluation).toHaveBeenCalledTimes(2);
    expect(createAlerts).not.toHaveBeenCalled();
    expect(replaceSellerObservations).not.toHaveBeenCalled();
  });

  it("falls back to syncRuleEvaluation after a stale batched persistence error", async () => {
    const createAlerts = mock(async () => {
      throw new Error("per-rule alert writes should be bypassed");
    });
    const replaceSellerObservations = mock(async () => {
      throw new Error("per-rule observation writes should be bypassed");
    });
    const syncItemEvaluationBatch = mock(async () => {
      throw createMissingRulePersistenceError(
        "seller_observations_rule_id_fkey",
      );
    });
    const syncRuleEvaluation = mock(
      async (
        ruleId: string,
        entry: { alerts: WatchAlert[]; observations: unknown[] },
      ) =>
        ruleId === "rule-1"
          ? []
          : entry.alerts.map((alert, index) => ({
              createdAt: "2026-03-30T00:00:00.000Z",
              id: `alert-${index}`,
              itemSlug: alert.itemSlug,
              lastSeen: alert.lastSeen,
              observedAt: alert.observedAt,
              platinum: alert.platinum,
              readAt: null,
              ruleId: alert.ruleId,
              sellerId: alert.sellerId,
              sellerName: alert.sellerName,
              sellerSlug: alert.sellerSlug,
              status: alert.status,
              userId: "user-1",
            })),
    );

    const pollOnce = createPollOnce({
      createAlerts,
      evaluateWatchRule: ({ rule }) => ({
        alerts: [
          {
            itemSlug: rule.itemSlug,
            lastSeen: "2026-03-30T00:00:00.000Z",
            observedAt: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            ruleId: rule.id,
            sellerId: "seller-1",
            sellerName: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
        observations: [
          {
            alertState: "sent" as const,
            lastSeen: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            sellerId: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
      }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
      syncItemEvaluationBatch,
      syncRuleEvaluation,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 1,
      polledRules: 2,
    });
    expect(syncItemEvaluationBatch).toHaveBeenCalledTimes(1);
    expect(syncRuleEvaluation).toHaveBeenCalledTimes(2);
    expect(createAlerts).not.toHaveBeenCalled();
    expect(replaceSellerObservations).not.toHaveBeenCalled();
  });

  it("keeps pacing after a failed item fetch before moving to the next item", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    const fetchStarts: number[] = [];
    const getMarketClient = mock(() => ({
      getItemOrders: async (itemSlug: string) => {
        fetchStarts.push(now);

        if (itemSlug === "arcane_barrier") {
          throw new Error("market unavailable");
        }

        return [];
      },
    }));

    Date.now = () => now;

    try {
      const pollOnce = createPollOnce({
        createAlerts: async () => [],
        evaluateWatchRule: () => ({ alerts: [], observations: [] }),
        getMarketClient,
        getSellerObservations: async () => [],
        getUserSettings: async () => ({
          discordBotToken: "bot-token",
          discordChannelId: "channel-id",
          discordEnabled: true,
          trackingPaused: false,
        }),
        listEnabledWatchRules: async () => [
          {
            createdAt: "2026-03-30T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: "rule-1",
            itemSlug: "arcane_barrier",
            maxPlatinum: 10,
            platform: "pc",
            sortOrder: 0,
            updatedAt: "2026-03-30T00:00:00.000Z",
            userId: "user-1",
          },
          {
            createdAt: "2026-03-30T00:00:00.000Z",
            crossplay: true,
            enabled: true,
            id: "rule-2",
            itemSlug: "another_item",
            maxPlatinum: 10,
            platform: "pc",
            sortOrder: 1,
            updatedAt: "2026-03-30T00:00:00.000Z",
            userId: "user-1",
          },
        ],
        replaceSellerObservations: async () => undefined,
        sendDiscordNotifications: async () => undefined,
        sleep: async (ms: number) => {
          now += ms;
        },
      });

      await pollOnce();

      expect(getMarketClient).toHaveBeenCalledTimes(1);
      expect(fetchStarts).toEqual([0, 500]);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("skips a rule that disappears before alert persistence completes", async () => {
    const createAlerts = mock(async (alerts) => {
      if (alerts[0]?.ruleId === "rule-1") {
        throw createMissingRulePersistenceError("alerts_rule_id_fkey");
      }

      return [];
    });
    const replaceSellerObservations = mock(async () => undefined);
    const itemFetches: string[] = [];

    const pollOnce = createPollOnce({
      createAlerts,
      evaluateWatchRule: ({ rule }) => ({
        alerts: [
          {
            itemSlug: rule.itemSlug,
            lastSeen: "2026-03-30T00:00:00.000Z",
            observedAt: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            ruleId: rule.id,
            sellerId: "seller-1",
            sellerName: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
        observations: [],
      }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetches.push(itemSlug);
          return [];
        },
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "another_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 2,
      polledRules: 2,
    });
    expect(itemFetches).toEqual(["arcane_barrier", "another_item"]);
    expect(replaceSellerObservations).toHaveBeenCalledTimes(1);
  });

  it("skips a rule that disappears before observation persistence completes", async () => {
    const createAlerts = mock(async () => []);
    const replaceSellerObservations = mock(async (ruleId: string) => {
      if (ruleId === "rule-1") {
        throw createMissingRulePersistenceError(
          "seller_observations_rule_id_fkey",
        );
      }
    });
    const itemFetches: string[] = [];

    const pollOnce = createPollOnce({
      createAlerts,
      evaluateWatchRule: () => ({
        alerts: [],
        observations: [
          {
            alertState: "pending",
            lastSeen: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            sellerId: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
      }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetches.push(itemSlug);
          return [];
        },
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "another_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    await expect(pollOnce()).resolves.toEqual({
      polledItems: 2,
      polledRules: 2,
    });
    expect(itemFetches).toEqual(["arcane_barrier", "another_item"]);
    expect(createAlerts).toHaveBeenCalledTimes(2);
    expect(replaceSellerObservations).toHaveBeenCalledTimes(2);
  });

  it("reports progress after each tracked item so long cycles stay fresh", async () => {
    const onProgress = mock(() => undefined);
    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "another_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      onProgress,
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    await pollOnce();

    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it("keeps polling the next item while Discord notifications are still sending", async () => {
    const sendDeferred = createDeferred<void>();
    const sendDiscordNotifications = mock(async () => sendDeferred.promise);
    const itemFetches: string[] = [];
    const hotFetchStarted = createDeferred<void>();

    const pollOnce = createPollOnce({
      createAlerts: async (alerts) =>
        alerts.map((alert, index) => ({
          createdAt: "2026-03-30T00:00:00.000Z",
          id: `alert-${index}`,
          itemSlug: alert.itemSlug,
          lastSeen: alert.lastSeen,
          observedAt: alert.observedAt,
          platinum: alert.platinum,
          readAt: null,
          ruleId: alert.ruleId,
          sellerId: alert.sellerId,
          sellerName: alert.sellerName,
          sellerSlug: alert.sellerSlug,
          status: alert.status,
          userId: "user-1",
        })),
      evaluateWatchRule: ({ rule }) =>
        rule.itemSlug === "hot_item"
          ? {
              alerts: [
                {
                  itemSlug: rule.itemSlug,
                  lastSeen: "2026-03-30T00:00:00.000Z",
                  observedAt: "2026-03-30T00:00:00.000Z",
                  platinum: 9,
                  ruleId: rule.id,
                  sellerId: "seller-1",
                  sellerName: "seller-1",
                  sellerSlug: "seller-1",
                  status: "online" as const,
                },
              ],
              observations: [],
            }
          : { alerts: [], observations: [] },
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetches.push(itemSlug);
          if (itemSlug === "hot_item") {
            hotFetchStarted.resolve();
          }

          return [];
        },
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-cold",
          itemSlug: "cold_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-hot",
          itemSlug: "hot_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications,
      sleep: async () => undefined,
    });

    const pollPromise = pollOnce();
    await hotFetchStarted.promise;

    try {
      expect(itemFetches).toEqual(["cold_item", "hot_item"]);
    } finally {
      sendDeferred.resolve();
    }

    await pollPromise;
    expect(sendDiscordNotifications).toHaveBeenCalledTimes(1);
  });

  it("advances the health heartbeat while Discord notifications remain queued", async () => {
    const sendDeferred = createDeferred<void>();
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );
    const itemFetches: string[] = [];
    const firstProgressObserved = createDeferred<void>();
    let now = Date.parse("2026-03-30T00:00:00.000Z");
    let progressCount = 0;

    const pollOnce = createPollOnce({
      createAlerts: async (alerts) =>
        alerts.map((alert, index) => ({
          createdAt: "2026-03-30T00:00:00.000Z",
          id: `alert-${index}`,
          itemSlug: alert.itemSlug,
          lastSeen: alert.lastSeen,
          observedAt: alert.observedAt,
          platinum: alert.platinum,
          readAt: null,
          ruleId: alert.ruleId,
          sellerId: alert.sellerId,
          sellerName: alert.sellerName,
          sellerSlug: alert.sellerSlug,
          status: alert.status,
          userId: "user-1",
        })),
      evaluateWatchRule: ({ rule }) =>
        rule.itemSlug === "hot_item"
          ? {
              alerts: [
                {
                  itemSlug: rule.itemSlug,
                  lastSeen: "2026-03-30T00:00:00.000Z",
                  observedAt: "2026-03-30T00:00:00.000Z",
                  platinum: 9,
                  ruleId: rule.id,
                  sellerId: "seller-1",
                  sellerName: "seller-1",
                  sellerSlug: "seller-1",
                  status: "online" as const,
                },
              ],
              observations: [],
            }
          : { alerts: [], observations: [] },
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetches.push(itemSlug);
          return [];
        },
      }),
      getSellerObservations: async () => {
        now += 1_000;
        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-cold",
          itemSlug: "cold_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-hot",
          itemSlug: "hot_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      onProgress: () => {
        monitor.recordActivity();
        progressCount += 1;

        if (progressCount === 1) {
          firstProgressObserved.resolve();
        }
      },
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications: async () => sendDeferred.promise,
      sleep: async () => undefined,
    });

    const pollPromise = pollOnce();
    await firstProgressObserved.promise;

    try {
      expect(itemFetches).toContain("cold_item");
      expect(
        Date.parse(monitor.getSnapshot().lastActivityAt ?? "invalid"),
      ).toBeGreaterThanOrEqual(Date.parse("2026-03-30T00:00:01.000Z"));
    } finally {
      sendDeferred.resolve();
    }

    await pollPromise;
  });

  it("backs off when the Discord notification backlog reaches the threshold", async () => {
    const backlogDrain = createDeferred<void>();
    const whenIdle = mock(async () => backlogDrain.promise);
    const enqueue = mock(async () => undefined);

    const pollOnce = createPollOnce({
      createAlerts: async () => [
        {
          itemSlug: "arcane_barrier",
          lastSeen: "2026-03-30T00:00:00.000Z",
          observedAt: "2026-03-30T00:00:00.000Z",
          platinum: 9,
          ruleId: "rule-1",
          sellerId: "seller-1",
          sellerName: "seller-1",
          sellerSlug: "seller-1",
          status: "online" as const,
        },
      ],
      evaluateWatchRule: () => ({
        alerts: [
          {
            itemSlug: "arcane_barrier",
            lastSeen: "2026-03-30T00:00:00.000Z",
            observedAt: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            ruleId: "rule-1",
            sellerId: "seller-1",
            sellerName: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
        observations: [],
      }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      notificationQueue: {
        enqueue,
        pendingDepth: () => 6,
        whenIdle,
      },
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    const pollPromise = pollOnce();
    await Promise.resolve();
    expect(enqueue).not.toHaveBeenCalled();

    backlogDrain.resolve();
    await pollPromise;

    expect(whenIdle).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("allows alert bursts to queue below the hard backlog cap without waiting", async () => {
    const whenIdle = mock(async () => undefined);
    const enqueue = mock(async () => undefined);

    const pollOnce = createPollOnce({
      createAlerts: async () => [
        {
          itemSlug: "arcane_barrier",
          lastSeen: "2026-03-30T00:00:00.000Z",
          observedAt: "2026-03-30T00:00:00.000Z",
          platinum: 9,
          ruleId: "rule-1",
          sellerId: "seller-1",
          sellerName: "seller-1",
          sellerSlug: "seller-1",
          status: "online" as const,
        },
      ],
      evaluateWatchRule: () => ({
        alerts: [
          {
            itemSlug: "arcane_barrier",
            lastSeen: "2026-03-30T00:00:00.000Z",
            observedAt: "2026-03-30T00:00:00.000Z",
            platinum: 9,
            ruleId: "rule-1",
            sellerId: "seller-1",
            sellerName: "seller-1",
            sellerSlug: "seller-1",
            status: "online" as const,
          },
        ],
        observations: [],
      }),
      getMarketClient: () => ({
        getItemOrders: async () => [],
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      notificationQueue: {
        enqueue,
        pendingDepth: () => 5,
        whenIdle,
      },
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    await pollOnce();

    expect(whenIdle).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("never starts item requests closer together than safeRequestSpacingMs", async () => {
    const sendDeferred = createDeferred<void>();
    const sendDiscordNotifications = mock(async () => sendDeferred.promise);
    const itemFetchStarts: Array<{ itemSlug: string; startedAt: number }> = [];
    let now = 0;
    const hotFetchStarted = createDeferred<void>();

    const pollOnce = createPollOnce({
      createAlerts: async (alerts) =>
        alerts.map((alert, index) => ({
          createdAt: "2026-03-30T00:00:00.000Z",
          id: `alert-${index}`,
          itemSlug: alert.itemSlug,
          lastSeen: alert.lastSeen,
          observedAt: alert.observedAt,
          platinum: alert.platinum,
          readAt: null,
          ruleId: alert.ruleId,
          sellerId: alert.sellerId,
          sellerName: alert.sellerName,
          sellerSlug: alert.sellerSlug,
          status: alert.status,
          userId: "user-1",
        })),
      evaluateWatchRule: ({ rule }) =>
        rule.itemSlug === "hot_item"
          ? {
              alerts: [
                {
                  itemSlug: rule.itemSlug,
                  lastSeen: "2026-03-30T00:00:00.000Z",
                  observedAt: "2026-03-30T00:00:00.000Z",
                  platinum: 9,
                  ruleId: rule.id,
                  sellerId: "seller-1",
                  sellerName: "seller-1",
                  sellerSlug: "seller-1",
                  status: "online" as const,
                },
              ],
              observations: [],
            }
          : { alerts: [], observations: [] },
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetchStarts.push({ itemSlug, startedAt: now });
          if (itemSlug === "hot_item") {
            hotFetchStarted.resolve();
          }

          return [];
        },
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-cold",
          itemSlug: "cold_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-hot",
          itemSlug: "hot_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      sendDiscordNotifications,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    const pollPromise = pollOnce();
    await hotFetchStarted.promise;

    try {
      expect(itemFetchStarts[0]).toEqual({
        itemSlug: "cold_item",
        startedAt: 0,
      });
      expect(itemFetchStarts[1]!.itemSlug).toBe("hot_item");
      expect(itemFetchStarts[1]!.startedAt).toBeGreaterThanOrEqual(499);
    } finally {
      sendDeferred.resolve();
    }

    await pollPromise;
  });

  it("starts the next item fetch while prior item processing is still running once spacing allows", async () => {
    let now = 0;
    const firstItemProcessing = createDeferred<void>();
    const secondFetchStarted = createDeferred<void>();
    const itemFetchStarts: Array<{ itemSlug: string; startedAt: number }> = [];

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetchStarts.push({ itemSlug, startedAt: now });

          if (itemSlug === "hot_item") {
            secondFetchStarted.resolve();
          }

          return [];
        },
      }),
      getSellerObservations: async (ruleId: string) => {
        if (ruleId === "rule-cold") {
          await firstItemProcessing.promise;
        }

        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-cold",
          itemSlug: "cold_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-hot",
          itemSlug: "hot_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "baseline",
      },
      sendDiscordNotifications: async () => undefined,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    const pollPromise = pollOnce();
    await secondFetchStarted.promise;

    expect(itemFetchStarts[0]).toEqual({
      itemSlug: "cold_item",
      startedAt: 0,
    });
    expect(itemFetchStarts[1]!.itemSlug).toBe("hot_item");
    expect(itemFetchStarts[1]!.startedAt).toBeGreaterThanOrEqual(499);

    firstItemProcessing.resolve();
    await pollPromise;
  });

  it("adaptive concurrency allows two overlapping items after a healthy recent fetch", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    let cycle = 0;
    const firstItemProcessing = createDeferred<void>();
    const secondFetchStarted = createDeferred<void>();
    const cycleFetchStarts: string[][] = [];

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          cycleFetchStarts[cycle]?.push(`${itemSlug}@${now}`);

          if (cycle === 1 && itemSlug === "second_item") {
            secondFetchStarted.resolve();
          }

          return [];
        },
      }),
      getSellerObservations: async (ruleId: string) => {
        if (cycle === 1 && ruleId === "rule-first") {
          await firstItemProcessing.promise;
        }

        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () =>
        cycle === 0
          ? [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-warm",
                itemSlug: "warm_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ]
          : [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-first",
                itemSlug: "first_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-second",
                itemSlug: "second_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 1,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "adaptive",
      },
      schedulerNow: () => now,
      sendDiscordNotifications: async () => undefined,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    Date.now = () => now;

    try {
      cycleFetchStarts.push([]);
      await pollOnce();

      cycle = 1;
      now = 1000;
      cycleFetchStarts.push([]);

      const pollPromise = pollOnce();
      await secondFetchStarted.promise;

      expect(cycleFetchStarts[1]).toEqual([
        "first_item@1000",
        "second_item@1500",
      ]);

      firstItemProcessing.resolve();
      await pollPromise;
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("adaptive concurrency defaults to one in-flight item before telemetry is available", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    let secondFetchStarted = false;
    const firstItemProcessing = createDeferred<void>();
    const firstItemBlocked = createDeferred<void>();
    const itemFetchStarts: string[] = [];

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          itemFetchStarts.push(`${itemSlug}@${now}`);

          if (itemSlug === "second_item") {
            secondFetchStarted = true;
          }

          return [];
        },
      }),
      getSellerObservations: async (ruleId: string) => {
        if (ruleId === "rule-first") {
          firstItemBlocked.resolve();
          await firstItemProcessing.promise;
        }

        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-first",
          itemSlug: "first_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-second",
          itemSlug: "second_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "adaptive",
      },
      schedulerNow: () => now,
      sendDiscordNotifications: async () => undefined,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    Date.now = () => now;

    try {
      const pollPromise = pollOnce();
      await firstItemBlocked.promise;
      await Promise.resolve();
      await Promise.resolve();

      expect(itemFetchStarts).toEqual(["first_item@0"]);
      expect(secondFetchStarted).toBe(false);

      firstItemProcessing.resolve();
      await pollPromise;

      expect(itemFetchStarts).toEqual(["first_item@0", "second_item@500"]);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("adaptive concurrency keeps two in-flight items after ordinary prod-latency fetches", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    let cycle = 0;
    const firstItemProcessing = createDeferred<void>();
    const firstItemBlocked = createDeferred<void>();
    const secondFetchStarted = createDeferred<void>();
    const cycleFetchStarts: string[][] = [];

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          cycleFetchStarts[cycle]?.push(`${itemSlug}@${now}`);

          if (cycle === 0 && itemSlug === "warm_item") {
            now += 900;
            return [];
          }

          if (cycle === 1 && itemSlug === "second_item") {
            secondFetchStarted.resolve();
          }

          return [];
        },
      }),
      getSellerObservations: async (ruleId: string) => {
        if (cycle === 1 && ruleId === "rule-first") {
          firstItemBlocked.resolve();
          await firstItemProcessing.promise;
        }

        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () =>
        cycle === 0
          ? [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-warm",
                itemSlug: "warm_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ]
          : [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-first",
                itemSlug: "first_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-second",
                itemSlug: "second_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 1,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "adaptive",
      },
      schedulerNow: () => now,
      sendDiscordNotifications: async () => undefined,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    Date.now = () => now;

    try {
      cycleFetchStarts.push([]);
      await pollOnce();

      cycle = 1;
      now = 2000;
      cycleFetchStarts.push([]);

      const pollPromise = pollOnce();
      await firstItemBlocked.promise;
      await Promise.resolve();
      await Promise.resolve();
      await secondFetchStarted.promise;

      expect(cycleFetchStarts[1]).toEqual([
        "first_item@2000",
        "second_item@2500",
      ]);

      firstItemProcessing.resolve();
      await pollPromise;
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("adaptive concurrency clamps back to one in-flight item after a severely slow fetch", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    let cycle = 0;
    let secondFetchStarted = false;
    const firstItemProcessing = createDeferred<void>();
    const firstItemBlocked = createDeferred<void>();
    const cycleFetchStarts: string[][] = [];

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          cycleFetchStarts[cycle]?.push(`${itemSlug}@${now}`);

          if (cycle === 0 && itemSlug === "warm_item") {
            now += 2000;
            return [];
          }

          if (cycle === 1 && itemSlug === "second_item") {
            secondFetchStarted = true;
          }

          return [];
        },
      }),
      getSellerObservations: async (ruleId: string) => {
        if (cycle === 1 && ruleId === "rule-first") {
          firstItemBlocked.resolve();
          await firstItemProcessing.promise;
        }

        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () =>
        cycle === 0
          ? [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-warm",
                itemSlug: "warm_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ]
          : [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-first",
                itemSlug: "first_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-second",
                itemSlug: "second_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 1,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "adaptive",
      },
      schedulerNow: () => now,
      sendDiscordNotifications: async () => undefined,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    Date.now = () => now;

    try {
      cycleFetchStarts.push([]);
      await pollOnce();

      cycle = 1;
      now = 2000;
      cycleFetchStarts.push([]);

      const pollPromise = pollOnce();
      await firstItemBlocked.promise;
      await Promise.resolve();
      await Promise.resolve();

      expect(cycleFetchStarts[1]).toEqual(["first_item@2000"]);
      expect(secondFetchStarted).toBe(false);

      firstItemProcessing.resolve();
      await pollPromise;

      expect(cycleFetchStarts[1]).toEqual([
        "first_item@2000",
        "second_item@2500",
      ]);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("adaptive concurrency clamps back to one in-flight item after a failed fetch", async () => {
    const originalDateNow = Date.now;
    let now = 0;
    let cycle = 0;
    let secondFetchStarted = false;
    const firstItemProcessing = createDeferred<void>();
    const firstItemBlocked = createDeferred<void>();
    const cycleFetchStarts: string[][] = [];

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          cycleFetchStarts[cycle]?.push(`${itemSlug}@${now}`);

          if (cycle === 0 && itemSlug === "warm_item") {
            throw new Error("market unavailable");
          }

          if (cycle === 1 && itemSlug === "second_item") {
            secondFetchStarted = true;
          }

          return [];
        },
      }),
      getSellerObservations: async (ruleId: string) => {
        if (cycle === 1 && ruleId === "rule-first") {
          firstItemBlocked.resolve();
          await firstItemProcessing.promise;
        }

        return [];
      },
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () =>
        cycle === 0
          ? [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-warm",
                itemSlug: "warm_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ]
          : [
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-first",
                itemSlug: "first_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 0,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
              {
                createdAt: "2026-03-30T00:00:00.000Z",
                crossplay: true,
                enabled: true,
                id: "rule-second",
                itemSlug: "second_item",
                maxPlatinum: 10,
                platform: "pc",
                sortOrder: 1,
                updatedAt: "2026-03-30T00:00:00.000Z",
                userId: "user-1",
              },
            ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "adaptive",
      },
      schedulerNow: () => now,
      sendDiscordNotifications: async () => undefined,
      sleep: async (ms: number) => {
        now += ms;
      },
    });

    Date.now = () => now;

    try {
      cycleFetchStarts.push([]);
      await pollOnce();

      cycle = 1;
      now = 2000;
      cycleFetchStarts.push([]);

      const pollPromise = pollOnce();
      await firstItemBlocked.promise;
      await Promise.resolve();
      await Promise.resolve();

      expect(cycleFetchStarts[1]).toEqual(["first_item@2000"]);
      expect(secondFetchStarted).toBe(false);

      firstItemProcessing.resolve();
      await pollPromise;

      expect(cycleFetchStarts[1]).toEqual([
        "first_item@2000",
        "second_item@2500",
      ]);
    } finally {
      Date.now = originalDateNow;
    }
  });

  it("caps overlapping item work at the safe concurrency limit", async () => {
    let inFlightFetches = 0;
    let peakInFlightFetches = 0;
    const firstFetchDone = createDeferred<[]>();
    const secondFetchDone = createDeferred<[]>();
    const secondFetchStarted = createDeferred<void>();
    const thirdFetchStarted = createDeferred<void>();

    const pollOnce = createPollOnce({
      createAlerts: async () => [],
      evaluateWatchRule: () => ({ alerts: [], observations: [] }),
      getMarketClient: () => ({
        getItemOrders: async (itemSlug: string) => {
          try {
            inFlightFetches += 1;
            peakInFlightFetches = Math.max(
              peakInFlightFetches,
              inFlightFetches,
            );

            if (itemSlug === "third_item") {
              thirdFetchStarted.resolve();
              return [];
            }

            if (itemSlug === "first_item") {
              return await firstFetchDone.promise;
            }

            if (itemSlug === "second_item") {
              secondFetchStarted.resolve();
              return await secondFetchDone.promise;
            }

            return [];
          } finally {
            inFlightFetches -= 1;
          }
        },
      }),
      getSellerObservations: async () => [],
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "channel-id",
        discordEnabled: true,
        trackingPaused: false,
      }),
      listEnabledWatchRules: async () => [
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-1",
          itemSlug: "first_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 0,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-2",
          itemSlug: "second_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
        {
          createdAt: "2026-03-30T00:00:00.000Z",
          crossplay: true,
          enabled: true,
          id: "rule-3",
          itemSlug: "third_item",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 2,
          updatedAt: "2026-03-30T00:00:00.000Z",
          userId: "user-1",
        },
      ],
      replaceSellerObservations: async () => undefined,
      schedulerMode: {
        adaptiveConcurrencyMode: "baseline",
      },
      sendDiscordNotifications: async () => undefined,
      sleep: async () => undefined,
    });

    const pollPromise = pollOnce();
    await secondFetchStarted.promise;
    expect(peakInFlightFetches).toBe(2);

    firstFetchDone.resolve([]);
    secondFetchDone.resolve([]);
    await thirdFetchStarted.promise;
    await pollPromise;
    expect(peakInFlightFetches).toBe(2);
  });
});

describe("createWorkerHealthMonitor", () => {
  it("records a successful cycle snapshot", () => {
    let now = 0;
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    now = Date.parse("2026-03-30T00:00:00.000Z");
    monitor.recordCycleStart();
    now = Date.parse("2026-03-30T00:00:05.000Z");
    monitor.recordCycleSuccess();

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:05.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: "2026-03-30T00:00:05.000Z",
      observedCycleIntervalMs: null,
      trackingPaused: false,
    });
  });

  it("captures the observed interval between successful cycles", () => {
    let now = 0;
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    now = Date.parse("2026-03-30T00:00:00.000Z");
    monitor.recordCycleStart();
    now = Date.parse("2026-03-30T00:00:05.000Z");
    monitor.recordCycleSuccess();
    now = Date.parse("2026-03-30T00:00:09.500Z");
    monitor.recordCycleStart();
    now = Date.parse("2026-03-30T00:00:10.000Z");
    monitor.recordCycleSuccess();

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:10.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:09.500Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: "2026-03-30T00:00:10.000Z",
      observedCycleIntervalMs: 5_000,
      trackingPaused: false,
    });
  });

  it("records the expected cycle interval from the latest successful poll result", () => {
    let now = 0;
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    now = Date.parse("2026-03-30T00:00:00.000Z");
    monitor.recordCycleStart();
    now = Date.parse("2026-03-30T00:00:05.000Z");
    monitor.recordCycleSuccess({
      expectedCycleIntervalMs: 4_500,
    });

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: 4_500,
      lastActivityAt: "2026-03-30T00:00:05.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: "2026-03-30T00:00:05.000Z",
      observedCycleIntervalMs: null,
      trackingPaused: false,
    });
  });

  it("records progress without changing failure counters or cycle markers", () => {
    let now = Date.parse("2026-03-30T00:00:00.000Z");
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    monitor.recordCycleStart();
    now = Date.parse("2026-03-30T00:00:02.000Z");
    monitor.recordActivity();

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:02.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: null,
      observedCycleIntervalMs: null,
      trackingPaused: false,
    });
  });

  it("records a failed cycle snapshot", () => {
    let now = Date.parse("2026-03-30T00:00:00.000Z");
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    monitor.recordCycleStart();
    const error = new Error("database unavailable");
    monitor.recordFailure(error);

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 1,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:00.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: "database unavailable",
      lastSuccessfulCycleAt: null,
      observedCycleIntervalMs: null,
      trackingPaused: false,
    });
  });

  it("increments repeated failures and keeps the latest error message", () => {
    let now = Date.parse("2026-03-30T00:00:00.000Z");
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    monitor.recordCycleStart();
    monitor.recordFailure(new Error("database unavailable"));
    monitor.recordFailure(new Error("connection reset"));

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 2,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:00.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: "connection reset",
      lastSuccessfulCycleAt: null,
      observedCycleIntervalMs: null,
      trackingPaused: false,
    });
  });

  it("clears failure noise when tracking is paused", () => {
    let now = Date.parse("2026-03-30T00:00:00.000Z");
    const monitor = createWorkerHealthMonitor(() =>
      new Date(now).toISOString(),
    );

    monitor.recordCycleStart();
    monitor.recordFailure(new Error("database unavailable"));
    monitor.setTrackingPaused(true);

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:00.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: null,
      observedCycleIntervalMs: null,
      trackingPaused: true,
    });
  });

  it("keeps tracking paused through cycle start until the next poll result re-applies it", () => {
    const monitor = createWorkerHealthMonitor(() => "2026-03-30T00:00:00.000Z");

    monitor.setTrackingPaused(true);
    monitor.recordCycleStart();

    expect(monitor.getSnapshot()).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: null,
      lastActivityAt: "2026-03-30T00:00:00.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: null,
      observedCycleIntervalMs: null,
      trackingPaused: true,
    });
  });
});

describe("createWorkerLoop", () => {
  it("keeps cycle-level completion logs available", async () => {
    const originalConsoleInfo = console.info;
    const completionLogs: string[] = [];
    const stopError = new Error("stop loop");

    console.info = (...args: unknown[]) => {
      completionLogs.push(args.join(" "));
    };

    const runWorkerLoop = createWorkerLoop({
      healthMonitor: createWorkerHealthMonitor(
        () => "2026-03-30T00:00:00.000Z",
      ),
      maxConsecutiveDatabaseFailures: 3,
      onFatalDatabaseFailure: async () => undefined,
      pollOnce: async () => ({
        polledItems: 2,
        polledRules: 2,
        trackingPaused: false,
      }),
      safeRequestSpacingMs: 500,
      sleep: async () => {
        throw stopError;
      },
    });

    try {
      await expect(runWorkerLoop()).rejects.toThrow("stop loop");
    } finally {
      console.info = originalConsoleInfo;
    }

    expect(
      completionLogs.some((entry) =>
        entry.includes("[worker] cycle complete items=2 rules=2 durationMs="),
      ),
    ).toBe(true);
  });

  it("exits after repeated database connection failures so the container can recover", async () => {
    const pollOnce = mock(async () => {
      const error = new Error(
        "connect ECONNREFUSED 172.24.0.4:5432",
      ) as Error & {
        code?: string;
      };
      error.code = "ECONNREFUSED";
      throw error;
    });
    const onFatalDatabaseFailure = mock(() => {
      throw new Error("fatal restart");
    });

    const runWorkerLoop = createWorkerLoop({
      healthMonitor: createWorkerHealthMonitor(
        () => "2026-03-30T00:00:00.000Z",
      ),
      maxConsecutiveDatabaseFailures: 3,
      onFatalDatabaseFailure,
      pollOnce,
      safeRequestSpacingMs: 500,
      sleep: async () => undefined,
    });

    await expect(runWorkerLoop()).rejects.toThrow("fatal restart");
    expect(pollOnce).toHaveBeenCalledTimes(3);
    expect(onFatalDatabaseFailure).toHaveBeenCalledTimes(1);
    expect(onFatalDatabaseFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ECONNREFUSED",
      }),
      3,
    );
  });

  it("drains queued Discord notifications briefly before fatal shutdown", async () => {
    const pollOnce = mock(async () => {
      const error = new Error(
        "connect ECONNREFUSED 172.24.0.4:5432",
      ) as Error & { code?: string };
      error.code = "ECONNREFUSED";
      throw error;
    });
    const drainDeferred = createDeferred<void>();
    const notificationQueue = {
      enqueue: mock(async () => undefined),
      pendingDepth: mock(() => 1),
      whenIdle: mock(async () => drainDeferred.promise),
    };
    const onFatalDatabaseFailure = mock(async () => undefined);
    const sleep = mock(async () => undefined);

    const runWorkerLoop = createWorkerLoop({
      healthMonitor: createWorkerHealthMonitor(
        () => "2026-03-30T00:00:00.000Z",
      ),
      maxConsecutiveDatabaseFailures: 1,
      notificationQueue,
      onFatalDatabaseFailure,
      pollOnce,
      safeRequestSpacingMs: 500,
      sleep,
    });

    const loopPromise = runWorkerLoop();
    await Promise.resolve();
    expect(notificationQueue.whenIdle).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(onFatalDatabaseFailure).not.toHaveBeenCalled();

    drainDeferred.resolve();
    await loopPromise;

    expect(onFatalDatabaseFailure).toHaveBeenCalledTimes(1);
  });
});
