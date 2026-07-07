import type {
  UserSettingsState,
  getUserSettingsState,
  listDashboardSnapshot,
} from "@warframe-market-tracker/db";
import type {
  WorkerHealthSnapshot,
  WorkerHealthState,
} from "@warframe-market-tracker/worker-health";
import type { fetchWorkerHealth } from "~/lib/worker-health";
import { UNAVAILABLE_WORKER_HEALTH_SNAPSHOT } from "~/lib/worker-health";

function isDatabaseConnectionFailure(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    typeof (error as Error & { code?: unknown }).code === "string"
      ? (error as Error & { code: string }).code
      : null;

  if (
    code !== null &&
    ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"].includes(code)
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("database") ||
    message.includes("postgres") ||
    message.includes("econnrefused") ||
    message.includes("connection terminated")
  );
}

function parseTimestamp(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getWorkerHealthJitterBudgetMs(expectedCycleIntervalMs: number) {
  return Math.min(
    Math.max(Math.round(expectedCycleIntervalMs * 0.2), 250),
    1_500,
  );
}

export function resolveWorkerHealthState(input: {
  now: number;
  trackingPaused: boolean;
  workerHealth: WorkerHealthSnapshot;
}): WorkerHealthState {
  if (input.trackingPaused || input.workerHealth.trackingPaused) {
    return "healthy";
  }

  if (input.workerHealth.consecutiveFailures > 0) {
    return "unhealthy";
  }

  const lastActivityAt =
    parseTimestamp(input.workerHealth.lastActivityAt) ??
    parseTimestamp(input.workerHealth.lastSuccessfulCycleAt);

  if (lastActivityAt === null) {
    return "unknown";
  }

  const observedCycleIntervalMs = input.workerHealth.observedCycleIntervalMs;
  const expectedCycleIntervalMs = [
    input.workerHealth.expectedCycleIntervalMs,
    observedCycleIntervalMs,
  ].reduce<number | null>((resolvedIntervalMs, candidateIntervalMs) => {
    if (
      typeof candidateIntervalMs !== "number" ||
      !Number.isFinite(candidateIntervalMs) ||
      candidateIntervalMs <= 0
    ) {
      return resolvedIntervalMs;
    }

    return resolvedIntervalMs === null
      ? candidateIntervalMs
      : Math.max(resolvedIntervalMs, candidateIntervalMs);
  }, null);

  if (
    expectedCycleIntervalMs === null ||
    !Number.isFinite(expectedCycleIntervalMs) ||
    expectedCycleIntervalMs <= 0
  ) {
    return "unknown";
  }

  return input.now - lastActivityAt >
    expectedCycleIntervalMs +
      getWorkerHealthJitterBudgetMs(expectedCycleIntervalMs)
    ? "stale"
    : "healthy";
}

export function createDashboardHandler(dependencies: {
  getUserSettingsState: typeof getUserSettingsState;
  getWorkerHealth: typeof fetchWorkerHealth;
  listDashboardSnapshot: typeof listDashboardSnapshot;
  now?: () => number;
  runtimeConfig: {
    marketCrossplay: boolean;
    marketPlatform: string;
    safeRequestSpacingMs: number;
    safeRequestsPerSecond: number;
    theoreticalRequestsPerSecond: number;
  };
}) {
  return async function GET() {
    let snapshot: Awaited<ReturnType<typeof listDashboardSnapshot>>;
    let settings: Awaited<ReturnType<typeof getUserSettingsState>>;

    try {
      [snapshot, settings] = await Promise.all([
        dependencies.listDashboardSnapshot(),
        dependencies.getUserSettingsState(),
      ]);
    } catch (error) {
      if (isDatabaseConnectionFailure(error)) {
        return Response.json(
          {
            error: "Database unavailable",
          },
          {
            status: 503,
          },
        );
      }

      throw error;
    }

    const workerHealth = await dependencies
      .getWorkerHealth()
      .catch(() => UNAVAILABLE_WORKER_HEALTH_SNAPSHOT);
    const trackingPaused =
      (settings as UserSettingsState | null)?.trackingPaused ?? false;
    const workerHealthState = resolveWorkerHealthState({
      now: dependencies.now?.() ?? Date.now(),
      trackingPaused,
      workerHealth,
    });

    return Response.json({
      ...snapshot,
      meta: {
        marketCrossplay: dependencies.runtimeConfig.marketCrossplay,
        marketPlatform: dependencies.runtimeConfig.marketPlatform,
        safeRequestSpacingMs: dependencies.runtimeConfig.safeRequestSpacingMs,
        safeRequestsPerSecond: dependencies.runtimeConfig.safeRequestsPerSecond,
        trackingPaused,
        theoreticalRequestsPerSecond:
          dependencies.runtimeConfig.theoreticalRequestsPerSecond,
        workerHealth,
        workerHealthState,
      },
    });
  };
}
