import { describe, expect, it } from "bun:test";

import {
  fetchWorkerHealth,
  UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
} from "~/lib/worker-health";
import { createDashboardHandler } from "~/lib/dashboard-route";

function createDatabaseConnectionError(
  message = "connect ECONNREFUSED 172.24.0.4:5432",
) {
  const error = new Error(message) as Error & { code?: string };
  error.code = "ECONNREFUSED";
  return error;
}

describe("createDashboardHandler", () => {
  it("includes worker health in dashboard meta when the worker responds", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => ({
        consecutiveFailures: 0,
        expectedCycleIntervalMs: 5_000,
        lastActivityAt: "2026-03-30T00:00:05.000Z",
        lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
        lastErrorMessage: null,
        lastSuccessfulCycleAt: "2026-03-30T00:00:05.000Z",
        observedCycleIntervalMs: 5_000,
        trackingPaused: false,
      }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
      now: () => Date.parse("2026-03-30T00:00:08.000Z"),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        trackingPaused: false,
        workerHealth: {
          consecutiveFailures: 0,
          expectedCycleIntervalMs: 5_000,
          lastActivityAt: "2026-03-30T00:00:05.000Z",
          lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
          lastErrorMessage: null,
          lastSuccessfulCycleAt: "2026-03-30T00:00:05.000Z",
          observedCycleIntervalMs: 5_000,
          trackingPaused: false,
        },
        workerHealthState: "healthy",
      },
    });
  });

  it("returns degraded worker health without failing the dashboard route", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => ({
        consecutiveFailures: 1,
        expectedCycleIntervalMs: null,
        lastActivityAt: null,
        lastCycleStartedAt: null,
        lastErrorMessage: "Worker health unavailable from worker endpoint",
        lastSuccessfulCycleAt: null,
        observedCycleIntervalMs: null,
        trackingPaused: false,
      }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
      now: () => Date.parse("2026-03-30T00:00:08.000Z"),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealth: {
          consecutiveFailures: 1,
          expectedCycleIntervalMs: null,
          lastActivityAt: null,
          lastCycleStartedAt: null,
          lastErrorMessage: "Worker health unavailable from worker endpoint",
          lastSuccessfulCycleAt: null,
          observedCycleIntervalMs: null,
          trackingPaused: false,
        },
        workerHealthState: "unhealthy",
      },
    });
  });

  it("marks the worker stale after it misses a single expected cycle interval", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => ({
        consecutiveFailures: 0,
        expectedCycleIntervalMs: 5_000,
        lastActivityAt: "2026-03-30T00:00:10.000Z",
        lastCycleStartedAt: "2026-03-30T00:00:10.000Z",
        lastErrorMessage: null,
        lastSuccessfulCycleAt: "2026-03-30T00:00:09.500Z",
        observedCycleIntervalMs: 5_000,
        trackingPaused: false,
      }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
      now: () => Date.parse("2026-03-30T00:00:16.500Z"),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealthState: "stale",
      },
    });
  });

  it("keeps the worker healthy during the expected interval jitter budget", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => ({
        consecutiveFailures: 0,
        expectedCycleIntervalMs: 5_000,
        lastActivityAt: "2026-03-30T00:00:10.000Z",
        lastCycleStartedAt: "2026-03-30T00:00:10.000Z",
        lastErrorMessage: null,
        lastSuccessfulCycleAt: "2026-03-30T00:00:09.500Z",
        observedCycleIntervalMs: 5_000,
        trackingPaused: false,
      }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
      now: () => Date.parse("2026-03-30T00:00:15.900Z"),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealthState: "healthy",
      },
    });
  });

  it("uses the slower observed worker cadence when it exceeds the theoretical poll interval", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => ({
        consecutiveFailures: 0,
        expectedCycleIntervalMs: 2_000,
        lastActivityAt: "2026-03-30T00:00:10.000Z",
        lastCycleStartedAt: "2026-03-30T00:00:10.000Z",
        lastErrorMessage: null,
        lastSuccessfulCycleAt: "2026-03-30T00:00:10.000Z",
        observedCycleIntervalMs: 4_153,
        trackingPaused: false,
      }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
      now: () => Date.parse("2026-03-30T00:00:13.000Z"),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealthState: "healthy",
      },
    });
  });

  it("returns degraded worker health when the worker health fetch path errors", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: () =>
        fetchWorkerHealth({
          fetch: async () => {
            throw new Error("connect ECONNREFUSED");
          },
          timeoutMs: 25,
          url: "http://worker:8788/health",
        }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealth: UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
      },
    });
  });

  it("returns degraded worker health when the worker health fetch path times out", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: () =>
        fetchWorkerHealth({
          fetch: async (_input, init) => {
            init?.signal?.throwIfAborted?.();
            await new Promise((resolve) => setTimeout(resolve, 10));
            init?.signal?.throwIfAborted?.();
            return new Response(null, { status: 200 });
          },
          timeoutMs: 1,
          url: "http://worker:8788/health",
        }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealth: UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
      },
    });
  });

  it("returns degraded worker health when getWorkerHealth throws directly", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => {
        throw new Error("worker health route unavailable");
      },
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealth: UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
      },
    });
  });

  it("keeps the worker healthy while the scan heartbeat is fresh", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => ({
        consecutiveFailures: 0,
        expectedCycleIntervalMs: 5_000,
        lastActivityAt: "2026-03-30T00:00:02.000Z",
        lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
        lastErrorMessage: null,
        lastSuccessfulCycleAt: "2026-03-30T00:00:02.000Z",
        observedCycleIntervalMs: 5_000,
        trackingPaused: false,
      }),
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
      now: () => Date.parse("2026-03-30T00:00:03.000Z"),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      meta: {
        workerHealth: {
          lastActivityAt: "2026-03-30T00:00:02.000Z",
        },
        workerHealthState: "healthy",
      },
    });
  });

  it("returns a structured 503 when the dashboard snapshot hits a database connection failure", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => ({
        discordChannelId: null,
        discordEnabled: false,
        hasDiscordBotToken: false,
        trackingPaused: false,
      }),
      getWorkerHealth: async () => UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
      listDashboardSnapshot: async () => {
        throw createDatabaseConnectionError();
      },
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
    })();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Database unavailable",
    });
  });

  it("returns a structured 503 when settings loading hits a database connection failure", async () => {
    const response = await createDashboardHandler({
      getUserSettingsState: async () => {
        throw createDatabaseConnectionError();
      },
      getWorkerHealth: async () => UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
      listDashboardSnapshot: async () => ({
        alerts: [],
        rules: [],
      }),
      runtimeConfig: {
        marketCrossplay: true,
        marketPlatform: "pc",
        safeRequestSpacingMs: 500,
        safeRequestsPerSecond: 2,
        theoreticalRequestsPerSecond: 3,
      },
    })();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Database unavailable",
    });
  });
});
