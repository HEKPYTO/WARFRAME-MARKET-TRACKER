import { getTrackedItemPollingIntervalMs } from "@warframe-market-tracker/market-client";

export type FooterStatusTone = "error" | "live" | "paused" | "syncing";
export type DashboardRefreshState = "error" | "idle" | "refreshing";

function formatSeconds(milliseconds: number) {
  return Math.max(0, Math.ceil(milliseconds / 1000));
}

export function getFooterStatusPresentation(input: {
  lastRefreshAt: number | undefined;
  now: number;
  refreshState: DashboardRefreshState;
  safeRequestSpacingMs: number;
  trackedItems: number;
  trackingPaused: boolean;
}) {
  const intervalMs = getTrackedItemPollingIntervalMs({
    safeRequestSpacingMs: input.safeRequestSpacingMs,
    trackedItems: input.trackedItems,
  });
  const elapsed =
    input.lastRefreshAt === undefined
      ? 0
      : Math.max(0, input.now - input.lastRefreshAt);
  const progress =
    input.lastRefreshAt === undefined || intervalMs === null || intervalMs <= 0
      ? 0
      : Math.min(1, elapsed / intervalMs);

  if (input.trackingPaused) {
    return {
      detail: "tracking paused globally",
      label: "paused",
      progress: 0,
      tone: "paused" as FooterStatusTone,
    };
  }

  if (input.refreshState === "refreshing") {
    return {
      detail: "syncing market feed",
      label: "syncing",
      progress,
      tone: "syncing" as FooterStatusTone,
    };
  }

  if (input.refreshState === "error") {
    const lastSyncDetail =
      input.lastRefreshAt === undefined
        ? "awaiting first successful sync"
        : `last sync ${formatSeconds(input.now - input.lastRefreshAt)}s ago`;

    return {
      detail: `market sync failed · ${lastSyncDetail}`,
      label: "warning",
      progress,
      tone: "error" as FooterStatusTone,
    };
  }

  if (intervalMs === null) {
    return {
      detail: "waiting for tracked items",
      label: "idle",
      progress,
      tone: "live" as FooterStatusTone,
    };
  }

  return {
    detail: `updated ${formatSeconds(elapsed)}s ago · interval ${formatSeconds(intervalMs)}s`,
    label: "live",
    progress,
    tone: "live" as FooterStatusTone,
  };
}
