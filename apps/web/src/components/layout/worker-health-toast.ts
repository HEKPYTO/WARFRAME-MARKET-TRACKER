import type { WorkerHealthState } from "@warframe-market-tracker/worker-health";

export type DashboardRefreshState = "error" | "idle" | "refreshing";

function getDatabaseWarningMessage(input: {
  refreshError: string | undefined;
  refreshState: DashboardRefreshState;
}) {
  if (input.refreshState !== "error") {
    return null;
  }

  const refreshError = input.refreshError?.toLowerCase() ?? "";

  if (
    refreshError.includes("database unavailable") ||
    refreshError.includes("postgres") ||
    refreshError.includes("database")
  ) {
    return "Database unavailable. Dashboard may be stale.";
  }

  return null;
}

export function getWorkerHealthToastPresentation(input: {
  hasPendingRuleCreation: boolean;
  refreshError: string | undefined;
  refreshState: DashboardRefreshState;
  trackedItems: number;
  trackingPaused: boolean;
  workerHealthState: WorkerHealthState;
}) {
  const databaseWarningMessage = getDatabaseWarningMessage({
    refreshError: input.refreshError,
    refreshState: input.refreshState,
  });

  if (databaseWarningMessage !== null) {
    return {
      message: databaseWarningMessage,
      visible: true,
    };
  }

  if (
    input.trackingPaused ||
    input.trackedItems <= 0 ||
    input.hasPendingRuleCreation
  ) {
    return {
      message: null,
      visible: false,
    };
  }

  if (
    input.workerHealthState === "healthy" ||
    input.workerHealthState === "unknown"
  ) {
    return {
      message: null,
      visible: false,
    };
  }

  if (input.workerHealthState === "stale") {
    return {
      message: "Worker activity looks stale. Alerts may be delayed.",
      visible: true,
    };
  }

  return {
    message: "Worker health check failing. Alerts may be delayed.",
    visible: true,
  };
}
