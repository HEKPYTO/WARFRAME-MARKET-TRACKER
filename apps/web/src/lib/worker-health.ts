import { type WorkerHealthSnapshot } from "@warframe-market-tracker/worker-health";

export const UNHEALTHY_WORKER_FETCH_ERROR =
  "Worker health unavailable from worker endpoint";
export const WORKER_HEALTH_PROBE_TIMEOUT_MS = 250;

export const UNAVAILABLE_WORKER_HEALTH_SNAPSHOT: WorkerHealthSnapshot = {
  consecutiveFailures: 1,
  expectedCycleIntervalMs: null,
  lastActivityAt: null,
  lastCycleStartedAt: null,
  lastErrorMessage: UNHEALTHY_WORKER_FETCH_ERROR,
  lastSuccessfulCycleAt: null,
  observedCycleIntervalMs: null,
  trackingPaused: false,
};

export const UNKNOWN_WORKER_HEALTH_SNAPSHOT: WorkerHealthSnapshot = {
  consecutiveFailures: 0,
  expectedCycleIntervalMs: null,
  lastActivityAt: null,
  lastCycleStartedAt: null,
  lastErrorMessage: null,
  lastSuccessfulCycleAt: null,
  observedCycleIntervalMs: null,
  trackingPaused: false,
};

function getWorkerHealthUrl(env: Record<string, string | undefined>) {
  return env.WORKER_HEALTH_URL ?? "http://worker:8788/health";
}

function isWorkerHealthSnapshot(value: unknown): value is WorkerHealthSnapshot {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const snapshot = value as Record<string, unknown>;

  return (
    typeof snapshot.consecutiveFailures === "number" &&
    (typeof snapshot.expectedCycleIntervalMs === "number" ||
      snapshot.expectedCycleIntervalMs === null) &&
    (typeof snapshot.lastActivityAt === "string" ||
      snapshot.lastActivityAt === null) &&
    (typeof snapshot.lastCycleStartedAt === "string" ||
      snapshot.lastCycleStartedAt === null) &&
    (typeof snapshot.lastErrorMessage === "string" ||
      snapshot.lastErrorMessage === null) &&
    (typeof snapshot.lastSuccessfulCycleAt === "string" ||
      snapshot.lastSuccessfulCycleAt === null) &&
    (typeof snapshot.observedCycleIntervalMs === "number" ||
      snapshot.observedCycleIntervalMs === null) &&
    typeof snapshot.trackingPaused === "boolean"
  );
}

export async function fetchWorkerHealth(input?: {
  env?: Record<string, string | undefined>;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number;
  url?: string;
}): Promise<WorkerHealthSnapshot> {
  const fetchImpl = input?.fetch ?? fetch;
  const timeoutMs = input?.timeoutMs ?? WORKER_HEALTH_PROBE_TIMEOUT_MS;
  const url = input?.url ?? getWorkerHealthUrl(input?.env ?? process.env);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Worker health failed: ${response.status}`);
    }

    const payload = (await response.json()) as unknown;

    if (!isWorkerHealthSnapshot(payload)) {
      throw new Error("Worker health payload was invalid");
    }

    return payload;
  } catch {
    return UNAVAILABLE_WORKER_HEALTH_SNAPSHOT;
  } finally {
    clearTimeout(timeout);
  }
}
