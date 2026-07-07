export type WorkerHealthState = "healthy" | "stale" | "unhealthy" | "unknown";

export interface WorkerHealthSnapshot {
  consecutiveFailures: number;
  expectedCycleIntervalMs: number | null;
  lastActivityAt: string | null;
  lastCycleStartedAt: string | null;
  lastErrorMessage: string | null;
  lastSuccessfulCycleAt: string | null;
  observedCycleIntervalMs: number | null;
  trackingPaused: boolean;
}
