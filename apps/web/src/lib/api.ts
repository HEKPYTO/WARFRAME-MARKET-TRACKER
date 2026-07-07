import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import type { AlertRecord, WatchRuleRecord } from "@warframe-market-tracker/db";
import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";
import type {
  WorkerHealthSnapshot,
  WorkerHealthState,
} from "@warframe-market-tracker/worker-health";
import { UNKNOWN_WORKER_HEALTH_SNAPSHOT } from "./worker-health";

import type {
  UpdateUserSettingsPayload,
  UserSettingsResponse,
} from "./settings-contract";

export interface DashboardMeta {
  marketCrossplay: boolean;
  marketPlatform: string;
  safeRequestSpacingMs: number;
  safeRequestsPerSecond: number;
  trackingPaused: boolean;
  theoreticalRequestsPerSecond: number;
  workerHealth: WorkerHealthSnapshot;
  workerHealthState: WorkerHealthState;
}

export interface DashboardResponse {
  alerts: AlertRecord[];
  meta: DashboardMeta;
  rules: WatchRuleRecord[];
}

export interface WorkspaceResponse {
  marketTop: MarketOrder[];
  offlineOrders: MarketOrder[];
  onlineOrders: MarketOrder[];
  rule: WatchRuleRecord;
  setPricing: {
    parts: Array<{
      estimatedPrice: number | null;
      itemSlug: string;
      name: string;
      variance: number | null;
    }>;
    totalEstimatedPrice: number | null;
    totalVariance: number | null;
  } | null;
}

export type ItemSuggestion = ItemCatalogEntry;

function getHttpStatusMessage(status: number, statusText: string) {
  if (statusText.trim().length > 0) {
    return statusText;
  }

  switch (status) {
    case 400:
      return "Bad Request";
    case 401:
      return "Unauthorized";
    case 403:
      return "Forbidden";
    case 404:
      return "Not Found";
    case 422:
      return "Unprocessable Entity";
    case 429:
      return "Too Many Requests";
    case 500:
      return "Internal Server Error";
    case 502:
      return "Bad Gateway";
    case 503:
      return "Service Unavailable";
    case 504:
      return "Gateway Timeout";
    default:
      return `HTTP ${status}`;
  }
}

export function resolveRequestInput(
  input: RequestInfo,
  options?: {
    internalOrigin?: string | undefined;
    isServer?: boolean;
    port?: string | undefined;
  },
): Request | string | URL {
  if (
    options?.isServer === true &&
    typeof input === "string" &&
    input.startsWith("/")
  ) {
    return new URL(
      input,
      options.internalOrigin ?? `http://localhost:${options.port ?? "5173"}`,
    );
  }

  return input;
}

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const resolvedInput = resolveRequestInput(input, {
    internalOrigin: process.env.INTERNAL_ORIGIN,
    isServer: typeof window === "undefined",
    port: process.env.PORT,
  });
  const response = await fetch(resolvedInput, init);

  if (!response.ok) {
    let message = `Request failed: ${response.status} ${getHttpStatusMessage(response.status, response.statusText)}`;
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      try {
        const body = (await response.json()) as {
          error?: unknown;
        };

        if (typeof body.error === "string" && body.error.length > 0) {
          message = body.error;
        }
      } catch {
        // Keep the default HTTP status message when the JSON body is malformed.
      }
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function isWorkerHealthState(value: unknown): value is WorkerHealthState {
  return (
    value === "healthy" ||
    value === "stale" ||
    value === "unhealthy" ||
    value === "unknown"
  );
}

function resolveFallbackWorkerHealthState(input: {
  trackingPaused: boolean;
  workerHealth: WorkerHealthSnapshot;
}): WorkerHealthState {
  if (input.trackingPaused || input.workerHealth.trackingPaused) {
    return "healthy";
  }

  if (input.workerHealth.consecutiveFailures > 0) {
    return "unhealthy";
  }

  return "unknown";
}

function normalizeDashboardResponse(
  payload: DashboardResponse,
): DashboardResponse {
  const workerHealth =
    payload.meta.workerHealth ?? UNKNOWN_WORKER_HEALTH_SNAPSHOT;

  return {
    ...payload,
    meta: {
      ...payload.meta,
      workerHealth,
      workerHealthState: isWorkerHealthState(payload.meta.workerHealthState)
        ? payload.meta.workerHealthState
        : resolveFallbackWorkerHealthState({
            trackingPaused: payload.meta.trackingPaused,
            workerHealth,
          }),
    },
  };
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return readJson<DashboardResponse>("/api/dashboard").then(
    normalizeDashboardResponse,
  );
}

export function fetchWorkspace(ruleId: string): Promise<WorkspaceResponse> {
  return readJson<WorkspaceResponse>(`/api/workspace/${ruleId}`);
}

export async function searchItems(
  query: string,
  limit?: number,
): Promise<ItemSuggestion[]> {
  const url = new URL("/api/item-search", "http://localhost");
  url.searchParams.set("q", query.trim());

  if (limit !== undefined) {
    url.searchParams.set("limit", String(limit));
  }

  const response = await readJson<{ items: ItemSuggestion[] }>(
    `${url.pathname}${url.search}`,
  );

  return response.items;
}

export function createRule(payload: {
  itemSlug: string;
  maxPlatinum?: number;
}): Promise<WatchRuleRecord> {
  return readJson<WatchRuleRecord>("/api/watch-rules", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export function fetchSettings(): Promise<UserSettingsResponse> {
  return readJson<UserSettingsResponse>("/api/settings");
}

export function updateSettings(
  payload: UpdateUserSettingsPayload,
): Promise<void> {
  return readJson<void>("/api/settings", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "PUT",
  });
}

export function sendDiscordSettingsTest(payload: {
  discordBotToken: string;
  discordChannelId: string;
  discordEnabled: boolean;
}): Promise<void> {
  return readJson<void>("/api/settings-test", {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "POST",
  });
}

export async function updateTrackingPaused(
  trackingPaused: boolean,
): Promise<UserSettingsResponse> {
  const currentSettings = await fetchSettings();
  const nextSettings = {
    discordBotToken: currentSettings.discordBotToken,
    discordChannelId: currentSettings.discordChannelId,
    discordEnabled: currentSettings.discordEnabled,
    trackingPaused,
  };

  await updateSettings(nextSettings);
  return {
    ...currentSettings,
    trackingPaused,
  };
}

export function setRuleEnabled(
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  return updateRule(ruleId, { enabled });
}

export function updateRule(
  ruleId: string,
  payload: {
    enabled?: boolean;
    maxPlatinum?: number;
  },
): Promise<void> {
  return readJson<void>(`/api/watch-rules/${ruleId}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
  });
}

export function reorderRules(ruleIds: string[]): Promise<void> {
  return readJson<void>("/api/watch-rules/reorder", {
    body: JSON.stringify({ ruleIds }),
    headers: {
      "content-type": "application/json",
    },
    method: "PATCH",
  });
}

export function deleteRule(ruleId: string): Promise<void> {
  return readJson<void>(`/api/watch-rules/${ruleId}`, {
    method: "DELETE",
  });
}

export function deleteAlert(alertId: string): Promise<void> {
  return readJson<void>(`/api/alerts/${alertId}`, {
    method: "DELETE",
  });
}

export function clearAlerts(): Promise<void> {
  return readJson<void>("/api/alerts", {
    method: "DELETE",
  });
}
