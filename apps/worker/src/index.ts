import { evaluateWatchRule } from "@warframe-market-tracker/alert-engine";
import type {
  MarketOrder,
  WatchAlert,
} from "@warframe-market-tracker/alert-engine";
import type { WorkerHealthSnapshot } from "@warframe-market-tracker/worker-health";
import {
  createAlerts,
  getSellerObservations,
  getSellerObservationsByRuleIds,
  getUserSettings,
  listEnabledWatchRules,
  replaceSellerObservations,
  syncRuleEvaluation,
  syncItemEvaluationBatch,
  updateUserSettings,
} from "@warframe-market-tracker/db";
import {
  getRuntimeConfig,
  getTrackedItemPollingIntervalMs,
  type RuntimeConfig,
  MarketClient,
} from "@warframe-market-tracker/market-client";
import type { WatchRuleRecord } from "@warframe-market-tracker/db";
import {
  createDiscordNotificationQueue,
  type DiscordNotificationQueue,
  sendDiscordNotifications,
} from "./discord-notifications";
import { createCachedUserSettingsLoader } from "./user-settings-loader";

const runtimeConfig = getRuntimeConfig(process.env);
const RATE_LIMIT_DELAY_MS = runtimeConfig.safeRequestSpacingMs;
const MAX_CONCURRENT_MARKET_REQUESTS =
  runtimeConfig.maxConcurrentMarketRequests;
const MAX_CONSECUTIVE_DATABASE_FAILURES = 3;
const DISCORD_NOTIFICATION_WARNING_DEPTH = 4;
const MAX_PENDING_DISCORD_NOTIFICATIONS = 6;
const DISCORD_NOTIFICATION_DRAIN_TIMEOUT_MS = 250;
const DEFAULT_WORKER_HEALTH_PORT = 8788;
const MIN_HEALTHY_FETCH_DURATION_BUDGET_MS = 1_500;

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getMarketClient() {
  return new MarketClient({
    baseUrl: runtimeConfig.marketBaseUrl,
    crossplay: runtimeConfig.marketCrossplay,
    language: runtimeConfig.marketLanguage,
    platform: runtimeConfig.marketPlatform,
  });
}

type MarketClientLike = {
  getItemOrders: (itemSlug: string) => Promise<MarketOrder[]>;
};

type PollOnceDependencies = {
  createAlerts: typeof createAlerts;
  evaluateWatchRule: typeof evaluateWatchRule;
  getMarketClient: () => MarketClientLike;
  getSellerObservations: typeof getSellerObservations;
  getSellerObservationsByRuleIds?: typeof getSellerObservationsByRuleIds;
  getUserSettings: typeof getUserSettings;
  listEnabledWatchRules: () => Promise<WatchRuleRecord[]>;
  onProgress?: (() => void) | undefined;
  notificationQueue?: DiscordNotificationQueue<{
    alerts: WatchAlert[];
    settings: Awaited<ReturnType<typeof getUserSettings>>;
    watchRulesById: Record<string, WatchRuleRecord>;
  }>;
  replaceSellerObservations: typeof replaceSellerObservations;
  sendDiscordNotifications: (input: {
    alerts: WatchAlert[];
    settings: Awaited<ReturnType<typeof getUserSettings>>;
    watchRulesById: Record<string, WatchRuleRecord>;
  }) => Promise<void>;
  schedulerMode?: Partial<SchedulerMode>;
  schedulerNow?: () => number;
  sleep: (ms: number) => Promise<unknown>;
  syncRuleEvaluation?: typeof syncRuleEvaluation;
  syncItemEvaluationBatch?: typeof syncItemEvaluationBatch;
  updateUserSettings?: typeof updateUserSettings;
};

type SchedulerMode = Pick<RuntimeConfig, "adaptiveConcurrencyMode">;

function getSchedulerMode(input?: Partial<SchedulerMode>): SchedulerMode {
  return {
    adaptiveConcurrencyMode:
      input?.adaptiveConcurrencyMode ?? runtimeConfig.adaptiveConcurrencyMode,
  };
}

export function getWorkerIdleDelayMs(input: {
  polledItems: number;
  safeRequestSpacingMs: number;
}) {
  const cycleIntervalMs = getTrackedItemPollingIntervalMs({
    safeRequestSpacingMs: input.safeRequestSpacingMs,
    trackedItems: input.polledItems,
  });

  if (cycleIntervalMs === null) {
    return null;
  }

  return Math.max(
    0,
    cycleIntervalMs - input.polledItems * input.safeRequestSpacingMs,
  );
}

export function createPollScheduler(input: {
  now?: () => number;
  mode?: Partial<SchedulerMode>;
  safeRequestSpacingMs: number;
}) {
  const now = input.now ?? Date.now;
  const mode = getSchedulerMode(input.mode);
  const recentFetchHealth: boolean[] = [];
  let lastFetchStartedAtMs: number | null = null;

  function getHealthyConcurrencyLimit() {
    if (recentFetchHealth.length === 0) {
      return 1;
    }

    return recentFetchHealth.every(Boolean)
      ? MAX_CONCURRENT_MARKET_REQUESTS
      : 1;
  }

  function getHealthyFetchDurationBudgetMs() {
    return Math.max(
      MIN_HEALTHY_FETCH_DURATION_BUDGET_MS,
      input.safeRequestSpacingMs * 3,
    );
  }

  return {
    getMode() {
      return mode;
    },
    getMaxConcurrentRequests() {
      if (mode.adaptiveConcurrencyMode !== "adaptive") {
        return MAX_CONCURRENT_MARKET_REQUESTS;
      }

      return getHealthyConcurrencyLimit();
    },
    getNextFetchDelayMs() {
      if (lastFetchStartedAtMs === null) {
        return 0;
      }

      return Math.max(
        0,
        input.safeRequestSpacingMs - (now() - lastFetchStartedAtMs),
      );
    },
    orderItemSlugs(itemSlugs: string[]) {
      return [...itemSlugs];
    },
    recordFetchStart() {
      lastFetchStartedAtMs = now();
    },
    recordFetchResult(result: { durationMs: number; succeeded: boolean }) {
      const isHealthy =
        result.succeeded &&
        result.durationMs <= getHealthyFetchDurationBudgetMs();

      recentFetchHealth.push(isHealthy);

      if (recentFetchHealth.length > 2) {
        recentFetchHealth.shift();
      }
    },
  };
}

export function createPollOnce(dependencies: PollOnceDependencies) {
  const notificationQueue =
    dependencies.notificationQueue ??
    createDiscordNotificationQueue(dependencies.sendDiscordNotifications);
  const scheduler = createPollScheduler({
    safeRequestSpacingMs: RATE_LIMIT_DELAY_MS,
    ...(dependencies.schedulerMode
      ? {
          mode: dependencies.schedulerMode,
        }
      : {}),
    ...(dependencies.schedulerNow
      ? {
          now: dependencies.schedulerNow,
        }
      : {}),
  });

  return async function pollOnce() {
    const getCachedUserSettings = createCachedUserSettingsLoader(
      dependencies.getUserSettings,
    );
    const settings = await getCachedUserSettings();
    if (settings?.trackingPaused) {
      return {
        polledItems: 0,
        polledRules: 0,
        trackingPaused: true,
      };
    }

    const rules = await dependencies.listEnabledWatchRules();
    const rulesByItemSlug = new Map<string, typeof rules>();

    for (const rule of rules) {
      const current = rulesByItemSlug.get(rule.itemSlug);

      if (current) {
        current.push(rule);
      } else {
        rulesByItemSlug.set(rule.itemSlug, [rule]);
      }
    }

    const client = dependencies.getMarketClient();
    const cycleStartedAt = new Date().toISOString();
    const orderedEntries = scheduler
      .orderItemSlugs([...rulesByItemSlug.keys()])
      .map(
        (itemSlug) => [itemSlug, rulesByItemSlug.get(itemSlug) ?? []] as const,
      );

    async function processTrackedItem(
      itemSlug: string,
      itemRules: WatchRuleRecord[],
    ) {
      let orders;
      const fetchStartedAtMs = Date.now();

      try {
        orders = await client.getItemOrders(itemSlug);
      } catch (error) {
        console.error(`[worker] failed item=${itemSlug}`, error);
      }

      const fetchDurationMs = Date.now() - fetchStartedAtMs;
      scheduler.recordFetchResult({
        durationMs: fetchDurationMs,
        succeeded: Boolean(orders),
      });

      if (orders) {
        const previousByRuleId = await loadSellerObservationsForRules(
          dependencies,
          itemRules,
        );
        const evaluations = itemRules.map((rule) => ({
          result: dependencies.evaluateWatchRule({
            now: cycleStartedAt,
            orders,
            previous: previousByRuleId[rule.id] ?? [],
            rule,
          }),
          rule,
        }));
        const newAlertsByRuleId = new Map<string, WatchAlert[]>();

        if (dependencies.syncItemEvaluationBatch) {
          try {
            const newAlerts = await dependencies.syncItemEvaluationBatch(
              evaluations.map(({ result, rule }) => ({
                alerts: result.alerts,
                observations: result.observations,
                ruleId: rule.id,
              })),
            );

            for (const alert of newAlerts) {
              const currentAlerts = newAlertsByRuleId.get(alert.ruleId);

              if (currentAlerts) {
                currentAlerts.push(alert);
              } else {
                newAlertsByRuleId.set(alert.ruleId, [alert]);
              }
            }
          } catch (error) {
            if (!isMissingRulePersistenceError(error)) {
              throw error;
            }

            console.warn(
              `[worker] falling back to per-rule persistence item=${itemSlug}`,
            );

            for (const { result, rule } of evaluations) {
              try {
                const newAlerts = dependencies.syncRuleEvaluation
                  ? await dependencies.syncRuleEvaluation(rule.id, {
                      alerts: result.alerts,
                      observations: result.observations,
                    })
                  : await dependencies.createAlerts(result.alerts);

                if (!dependencies.syncRuleEvaluation) {
                  await dependencies.replaceSellerObservations(
                    rule.id,
                    result.observations,
                  );
                }

                if (newAlerts.length > 0) {
                  newAlertsByRuleId.set(rule.id, newAlerts);
                }
              } catch (fallbackError) {
                if (isMissingRulePersistenceError(fallbackError)) {
                  console.warn(
                    `[worker] skipping stale rule=${rule.id} item=${rule.itemSlug}`,
                  );
                  continue;
                }

                throw fallbackError;
              }
            }
          }
        } else {
          for (const { result, rule } of evaluations) {
            try {
              const newAlerts = dependencies.syncRuleEvaluation
                ? await dependencies.syncRuleEvaluation(rule.id, {
                    alerts: result.alerts,
                    observations: result.observations,
                  })
                : await dependencies.createAlerts(result.alerts);

              if (!dependencies.syncRuleEvaluation) {
                await dependencies.replaceSellerObservations(
                  rule.id,
                  result.observations,
                );
              }

              if (newAlerts.length > 0) {
                newAlertsByRuleId.set(rule.id, newAlerts);
              }
            } catch (error) {
              if (isMissingRulePersistenceError(error)) {
                console.warn(
                  `[worker] skipping stale rule=${rule.id} item=${rule.itemSlug}`,
                );
                continue;
              }

              throw error;
            }
          }
        }

        for (const rule of itemRules) {
          const newAlerts = newAlertsByRuleId.get(rule.id) ?? [];

          if (newAlerts.length === 0) {
            continue;
          }

          const queueDepth = notificationQueue.pendingDepth();

          if (queueDepth >= DISCORD_NOTIFICATION_WARNING_DEPTH) {
            console.warn(
              `[worker] discord backlog depth=${queueDepth} item=${itemSlug}`,
            );
          }

          if (queueDepth >= MAX_PENDING_DISCORD_NOTIFICATIONS) {
            await notificationQueue.whenIdle();
          }

          void notificationQueue.enqueue({
            alerts: newAlerts,
            settings,
            watchRulesById: {
              [rule.id]: rule,
            },
          });
        }
      }
      dependencies.onProgress?.();
    }

    const inFlightItems = new Set<Promise<void>>();

    for (const [itemSlug, itemRules] of orderedEntries) {
      while (inFlightItems.size >= scheduler.getMaxConcurrentRequests()) {
        await Promise.race(inFlightItems);
      }

      const waitBeforeFetchMs = scheduler.getNextFetchDelayMs();

      if (waitBeforeFetchMs > 0) {
        await dependencies.sleep(waitBeforeFetchMs);
      }

      scheduler.recordFetchStart();
      let task!: Promise<void>;
      task = processTrackedItem(itemSlug, itemRules).finally(() => {
        inFlightItems.delete(task);
      });
      inFlightItems.add(task);
    }

    await Promise.all(inFlightItems);

    return {
      polledItems: rulesByItemSlug.size,
      polledRules: rules.length,
    };
  };
}

export const pollOnce = createPollOnce({
  createAlerts,
  evaluateWatchRule,
  getMarketClient,
  getSellerObservations,
  getSellerObservationsByRuleIds,
  getUserSettings,
  listEnabledWatchRules,
  onProgress: undefined,
  replaceSellerObservations,
  sendDiscordNotifications,
  sleep,
  syncRuleEvaluation,
  syncItemEvaluationBatch,
  updateUserSettings,
});

function getCurrentTimestamp() {
  return new Date().toISOString();
}

function parseTimestamp(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isDatabaseConnectionFailure(error: unknown) {
  return (
    error instanceof Error &&
    typeof (error as Error & { code?: unknown }).code === "string" &&
    ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes(
      (error as Error & { code: string }).code,
    )
  );
}

function isMissingRulePersistenceError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    typeof (error as Error & { code?: unknown }).code === "string"
      ? (error as Error & { code: string }).code
      : null;
  const constraintName =
    typeof (error as Error & { constraint_name?: unknown }).constraint_name ===
    "string"
      ? (
          error as Error & {
            constraint_name: string;
          }
        ).constraint_name.toLowerCase()
      : "";
  const message = error.message.toLowerCase();

  if (code !== "23503") {
    return false;
  }

  return (
    constraintName === "alerts_rule_id_fkey" ||
    constraintName === "seller_observations_rule_id_fkey" ||
    (message.includes("foreign key constraint") &&
      message.includes("rule_id") &&
      message.includes("watch_rules"))
  );
}

async function loadSellerObservationsForRules(
  dependencies: PollOnceDependencies,
  itemRules: WatchRuleRecord[],
) {
  if (dependencies.getSellerObservationsByRuleIds) {
    return dependencies.getSellerObservationsByRuleIds(
      itemRules.map((rule) => rule.id),
    );
  }

  const observationEntries = await Promise.all(
    itemRules.map(async (rule) => [
      rule.id,
      await dependencies.getSellerObservations(rule.id),
    ]),
  );

  return Object.fromEntries(observationEntries);
}

export function createWorkerHealthMonitor(now = getCurrentTimestamp) {
  const snapshot: WorkerHealthSnapshot = {
    consecutiveFailures: 0,
    expectedCycleIntervalMs: null,
    lastActivityAt: null,
    lastCycleStartedAt: null,
    lastErrorMessage: null,
    lastSuccessfulCycleAt: null,
    observedCycleIntervalMs: null,
    trackingPaused: false,
  };

  return {
    getSnapshot() {
      return { ...snapshot };
    },
    recordActivity() {
      snapshot.lastActivityAt = now();
    },
    recordCycleStart() {
      const timestamp = now();
      snapshot.lastActivityAt = timestamp;
      snapshot.lastCycleStartedAt = timestamp;
    },
    recordCycleSuccess(input?: { expectedCycleIntervalMs?: number | null }) {
      const timestamp = now();
      const previousSuccessfulCycleAt = parseTimestamp(
        snapshot.lastSuccessfulCycleAt,
      );

      snapshot.lastActivityAt = timestamp;
      snapshot.consecutiveFailures = 0;
      snapshot.expectedCycleIntervalMs =
        typeof input?.expectedCycleIntervalMs === "number" &&
        Number.isFinite(input.expectedCycleIntervalMs) &&
        input.expectedCycleIntervalMs > 0
          ? input.expectedCycleIntervalMs
          : null;
      snapshot.lastErrorMessage = null;
      snapshot.lastSuccessfulCycleAt = timestamp;
      snapshot.observedCycleIntervalMs =
        previousSuccessfulCycleAt === null
          ? null
          : Math.max(0, Date.parse(timestamp) - previousSuccessfulCycleAt);
      snapshot.trackingPaused = false;
    },
    recordFailure(error: unknown) {
      snapshot.lastActivityAt = now();
      snapshot.consecutiveFailures += 1;
      snapshot.lastErrorMessage = toErrorMessage(error);
      snapshot.trackingPaused = false;
    },
    setTrackingPaused(trackingPaused: boolean) {
      snapshot.trackingPaused = trackingPaused;
      snapshot.lastActivityAt = now();

      if (trackingPaused) {
        snapshot.consecutiveFailures = 0;
        snapshot.lastErrorMessage = null;
      }
    },
  };
}

export function createWorkerHealthServer(input: {
  monitor: ReturnType<typeof createWorkerHealthMonitor>;
  port: number;
}) {
  return globalThis.Bun.serve({
    fetch(request) {
      const url = new URL(request.url);

      if (url.pathname !== "/health") {
        return new Response("Not Found", { status: 404 });
      }

      return Response.json(input.monitor.getSnapshot());
    },
    port: input.port,
  });
}

type WorkerLoopDependencies = {
  healthMonitor: ReturnType<typeof createWorkerHealthMonitor>;
  maxConsecutiveDatabaseFailures: number;
  notificationQueue?: DiscordNotificationQueue<unknown>;
  onFatalDatabaseFailure: (
    error: unknown,
    consecutiveFailures: number,
  ) => Promise<unknown> | unknown;
  pollOnce: typeof pollOnce;
  safeRequestSpacingMs: number;
  sleep: typeof sleep;
};

export function createWorkerLoop(dependencies: WorkerLoopDependencies) {
  return async function runWorkerLoop() {
    let consecutiveDatabaseFailures = 0;

    for (;;) {
      let idleDelayMs: number | null = null;
      const cycleStartedAtMs = Date.now();
      dependencies.healthMonitor.recordCycleStart();

      try {
        const result = await dependencies.pollOnce();
        dependencies.healthMonitor.setTrackingPaused(
          result.trackingPaused === true,
        );
        consecutiveDatabaseFailures = 0;

        if (result.trackingPaused !== true) {
          dependencies.healthMonitor.recordCycleSuccess({
            expectedCycleIntervalMs:
              getTrackedItemPollingIntervalMs({
                safeRequestSpacingMs: dependencies.safeRequestSpacingMs,
                trackedItems: result.polledItems,
              }) ?? dependencies.safeRequestSpacingMs,
          });
        }

        idleDelayMs = getWorkerIdleDelayMs({
          polledItems: result.polledItems,
          safeRequestSpacingMs: dependencies.safeRequestSpacingMs,
        });
        console.info(
          `[worker] cycle complete items=${result.polledItems} rules=${result.polledRules} durationMs=${
            Date.now() - cycleStartedAtMs
          } queueDepth=${dependencies.notificationQueue?.pendingDepth() ?? 0}`,
        );
      } catch (error) {
        console.error("[worker] cycle failed", error);
        dependencies.healthMonitor.recordFailure(error);

        if (isDatabaseConnectionFailure(error)) {
          consecutiveDatabaseFailures += 1;

          if (
            consecutiveDatabaseFailures >=
            dependencies.maxConsecutiveDatabaseFailures
          ) {
            if (dependencies.notificationQueue) {
              await Promise.race([
                dependencies.notificationQueue.whenIdle(),
                dependencies.sleep(DISCORD_NOTIFICATION_DRAIN_TIMEOUT_MS),
              ]);
            }

            console.error(
              `[worker] exiting after ${consecutiveDatabaseFailures} consecutive database connection failures`,
            );
            await dependencies.onFatalDatabaseFailure(
              error,
              consecutiveDatabaseFailures,
            );
            return;
          }
        } else {
          consecutiveDatabaseFailures = 0;
        }
      }

      if (idleDelayMs !== null) {
        await dependencies.sleep(idleDelayMs);
      } else {
        await dependencies.sleep(dependencies.safeRequestSpacingMs);
      }
    }
  };
}

function getWorkerHealthPort() {
  const parsed = Number.parseInt(process.env.WORKER_HEALTH_PORT ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_WORKER_HEALTH_PORT;
}

async function main() {
  const healthMonitor = createWorkerHealthMonitor();
  createWorkerHealthServer({
    monitor: healthMonitor,
    port: getWorkerHealthPort(),
  });
  const notificationQueue = createDiscordNotificationQueue(
    sendDiscordNotifications,
  );

  const pollOnceWithProgress = createPollOnce({
    createAlerts,
    evaluateWatchRule,
    getMarketClient,
    getSellerObservations,
    getSellerObservationsByRuleIds,
    getUserSettings,
    listEnabledWatchRules,
    onProgress: () => healthMonitor.recordActivity(),
    notificationQueue,
    replaceSellerObservations,
    sendDiscordNotifications,
    sleep,
    syncItemEvaluationBatch,
  });

  return createWorkerLoop({
    healthMonitor,
    maxConsecutiveDatabaseFailures: MAX_CONSECUTIVE_DATABASE_FAILURES,
    notificationQueue,
    onFatalDatabaseFailure: () => process.exit(1),
    pollOnce: pollOnceWithProgress,
    safeRequestSpacingMs: RATE_LIMIT_DELAY_MS,
    sleep,
  })();
}

if (import.meta.main) {
  void main();
}
