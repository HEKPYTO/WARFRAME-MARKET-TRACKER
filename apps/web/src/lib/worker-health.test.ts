import { describe, expect, it } from "bun:test";

import {
  fetchWorkerHealth,
  UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
  WORKER_HEALTH_PROBE_TIMEOUT_MS,
} from "./worker-health";

describe("fetchWorkerHealth", () => {
  it("returns the worker snapshot when the internal health endpoint responds", async () => {
    const result = await fetchWorkerHealth({
      fetch: async () =>
        new Response(
          JSON.stringify({
            consecutiveFailures: 0,
            expectedCycleIntervalMs: 5_000,
            lastActivityAt: "2026-03-30T00:00:05.000Z",
            lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
            lastErrorMessage: null,
            lastSuccessfulCycleAt: "2026-03-30T00:00:05.000Z",
            observedCycleIntervalMs: 5_000,
            trackingPaused: false,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 200,
          },
        ),
      timeoutMs: 25,
      url: "http://worker:8788/health",
    });

    expect(result).toEqual({
      consecutiveFailures: 0,
      expectedCycleIntervalMs: 5_000,
      lastActivityAt: "2026-03-30T00:00:05.000Z",
      lastCycleStartedAt: "2026-03-30T00:00:00.000Z",
      lastErrorMessage: null,
      lastSuccessfulCycleAt: "2026-03-30T00:00:05.000Z",
      observedCycleIntervalMs: 5_000,
      trackingPaused: false,
    });
  });

  it("returns a degraded snapshot when the health endpoint errors", async () => {
    const result = await fetchWorkerHealth({
      fetch: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      timeoutMs: 25,
      url: "http://worker:8788/health",
    });

    expect(result).toEqual(UNAVAILABLE_WORKER_HEALTH_SNAPSHOT);
  });

  it("returns a degraded snapshot when the health endpoint responds with a non-ok status", async () => {
    const result = await fetchWorkerHealth({
      fetch: async () =>
        new Response(null, {
          status: 503,
        }),
      timeoutMs: 25,
      url: "http://worker:8788/health",
    });

    expect(result).toEqual(UNAVAILABLE_WORKER_HEALTH_SNAPSHOT);
  });

  it("returns a degraded snapshot when the health endpoint responds with malformed json", async () => {
    const result = await fetchWorkerHealth({
      fetch: async () =>
        new Response("not-json", {
          headers: {
            "content-type": "application/json",
          },
          status: 200,
        }),
      timeoutMs: 25,
      url: "http://worker:8788/health",
    });

    expect(result).toEqual(UNAVAILABLE_WORKER_HEALTH_SNAPSHOT);
  });

  it("uses a short explicit probe timeout by default", () => {
    expect(WORKER_HEALTH_PROBE_TIMEOUT_MS).toBe(250);
  });
});
