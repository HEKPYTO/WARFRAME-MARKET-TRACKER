import {
  createDashboardSlices,
  type DashboardSlices,
} from "~/store/dashboard-state";
import { UNKNOWN_WORKER_HEALTH_SNAPSHOT } from "./worker-health";
import type {
  DashboardMeta,
  DashboardResponse,
  WorkspaceResponse,
} from "./api";

const DASHBOARD_SESSION_CACHE_KEY = "wmt-dashboard-session-cache:v1";
export const DASHBOARD_BOOTSTRAP_ATTRIBUTE = "data-dashboard-bootstrapping";
const DASHBOARD_BOOTSTRAP_SCRIPT_MAX_AGE_MS = 60_000;

export interface DashboardBootstrapPayload {
  cachedAt: number;
  dashboard: DashboardResponse;
  selectedRuleId?: string | undefined;
  workspaceByRuleId: Record<string, WorkspaceResponse>;
}

export interface DashboardBootstrapState {
  dashboardMeta: DashboardMeta;
  dashboardSlices: DashboardSlices;
  lastRefreshAt: number;
  selectedRuleId: string | undefined;
  workspaceByRuleId: Record<string, WorkspaceResponse>;
}

export interface SessionStorageLike {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
  setItem: (key: string, value: string) => void;
}

export function readSelectedRuleIdFromSearch(search: string) {
  const ruleId = new URLSearchParams(search).get("ruleId")?.trim();
  return ruleId ? ruleId : undefined;
}

export function withSelectedRuleIdInSearch(
  search: string,
  selectedRuleId: string | undefined,
) {
  const params = new URLSearchParams(search);

  if (selectedRuleId && selectedRuleId.trim().length > 0) {
    params.set("ruleId", selectedRuleId);
  } else {
    params.delete("ruleId");
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function resolveDashboardBootstrapPayload(input: {
  cachedBootstrapPayload: DashboardBootstrapPayload | null;
  initialBootstrapPayload: DashboardBootstrapPayload | null | undefined;
  locationSelectedRuleId: string | undefined;
}) {
  const bootstrapPayload =
    input.initialBootstrapPayload ?? input.cachedBootstrapPayload;

  if (!bootstrapPayload) {
    return null;
  }

  if (!input.locationSelectedRuleId) {
    return bootstrapPayload;
  }

  return {
    ...bootstrapPayload,
    selectedRuleId: input.locationSelectedRuleId,
  };
}

export function clearDashboardBootstrapAttribute(
  documentElement = document.documentElement,
) {
  documentElement.removeAttribute(DASHBOARD_BOOTSTRAP_ATTRIBUTE);
}

function normalizeDashboardMeta(meta: DashboardResponse["meta"]) {
  const workerHealth = meta.workerHealth ?? UNKNOWN_WORKER_HEALTH_SNAPSHOT;
  const workerHealthState =
    meta.workerHealthState === "healthy" ||
    meta.workerHealthState === "stale" ||
    meta.workerHealthState === "unhealthy" ||
    meta.workerHealthState === "unknown"
      ? meta.workerHealthState
      : meta.trackingPaused || workerHealth.trackingPaused
        ? "healthy"
        : workerHealth.consecutiveFailures > 0
          ? "unhealthy"
          : "unknown";

  return {
    ...meta,
    workerHealth,
    workerHealthState,
  };
}

export function createDashboardBootstrapState(
  payload: DashboardBootstrapPayload,
): DashboardBootstrapState {
  const dashboard = {
    ...payload.dashboard,
    meta: normalizeDashboardMeta(payload.dashboard.meta),
  };
  const dashboardSlices = createDashboardSlices(dashboard);
  const selectedRuleId =
    payload.selectedRuleId &&
    dashboardSlices.rulesById[payload.selectedRuleId] !== undefined
      ? payload.selectedRuleId
      : dashboardSlices.ruleIds.at(0);

  return {
    dashboardMeta: dashboard.meta,
    dashboardSlices,
    lastRefreshAt: payload.cachedAt,
    selectedRuleId,
    workspaceByRuleId: payload.workspaceByRuleId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDashboardBootstrapPayload(
  value: unknown,
): value is DashboardBootstrapPayload {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.cachedAt !== "number") {
    return false;
  }

  if (!isRecord(value.dashboard)) {
    return false;
  }

  if (
    !Array.isArray(value.dashboard.alerts) ||
    !Array.isArray(value.dashboard.rules)
  ) {
    return false;
  }

  if (!isRecord(value.dashboard.meta)) {
    return false;
  }

  if (
    value.selectedRuleId !== undefined &&
    typeof value.selectedRuleId !== "string"
  ) {
    return false;
  }

  return isRecord(value.workspaceByRuleId);
}

export function persistDashboardSessionCache(
  storage: SessionStorageLike,
  payload: DashboardBootstrapPayload,
) {
  storage.setItem(DASHBOARD_SESSION_CACHE_KEY, JSON.stringify(payload));
}

export function createDashboardSessionCacheWriter(input: {
  clearTimeout?: (timeoutId: unknown) => void;
  debounceMs: number;
  setTimeout?: (callback: () => void, delayMs: number) => unknown;
  storage: SessionStorageLike;
}) {
  let pendingPayload: DashboardBootstrapPayload | null = null;
  let timeoutId: unknown = null;
  let lastPersistedPayload =
    input.storage.getItem(DASHBOARD_SESSION_CACHE_KEY) ?? null;
  const scheduleTimeout =
    input.setTimeout ??
    ((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs));
  const cancelTimeout =
    input.clearTimeout ??
    ((scheduledTimeoutId: unknown) =>
      globalThis.clearTimeout(
        scheduledTimeoutId as ReturnType<typeof globalThis.setTimeout>,
      ));

  function flush() {
    const payload = pendingPayload;
    pendingPayload = null;

    if (!payload) {
      return;
    }

    const serializedPayload = JSON.stringify(payload);

    if (serializedPayload === lastPersistedPayload) {
      return;
    }

    input.storage.setItem(DASHBOARD_SESSION_CACHE_KEY, serializedPayload);
    lastPersistedPayload = serializedPayload;
  }

  return {
    dispose() {
      if (timeoutId !== null) {
        cancelTimeout(timeoutId);
        timeoutId = null;
      }

      flush();
    },
    flush,
    schedule(payload: DashboardBootstrapPayload) {
      pendingPayload = payload;

      if (timeoutId !== null) {
        cancelTimeout(timeoutId);
      }

      timeoutId = scheduleTimeout(() => {
        timeoutId = null;
        flush();
      }, input.debounceMs);
    },
  };
}

function sanitizeCachedDashboardPayload(
  payload: DashboardBootstrapPayload,
): DashboardBootstrapPayload {
  return {
    ...payload,
    dashboard: {
      ...payload.dashboard,
      meta: {
        ...payload.dashboard.meta,
        workerHealth: UNKNOWN_WORKER_HEALTH_SNAPSHOT,
        workerHealthState: "unknown",
      },
    },
  };
}

export function readDashboardSessionCache(
  storage: SessionStorageLike,
  options: {
    maxAgeMs: number;
    now: number;
  },
): DashboardBootstrapPayload | null {
  const raw = storage.getItem(DASHBOARD_SESSION_CACHE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isDashboardBootstrapPayload(parsed)) {
      storage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
      return null;
    }

    if (options.now - parsed.cachedAt > options.maxAgeMs) {
      storage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
      return null;
    }

    return sanitizeCachedDashboardPayload(parsed);
  } catch {
    storage.removeItem(DASHBOARD_SESSION_CACHE_KEY);
    return null;
  }
}

export function getDashboardBootstrapScript() {
  return `(() => {
    try {
      const rawPayload = window.sessionStorage.getItem("${DASHBOARD_SESSION_CACHE_KEY}");
      if (!rawPayload) {
        return;
      }

      const parsedPayload = JSON.parse(rawPayload);
      if (
        typeof parsedPayload?.cachedAt !== "number" ||
        Date.now() - parsedPayload.cachedAt > ${DASHBOARD_BOOTSTRAP_SCRIPT_MAX_AGE_MS}
      ) {
        return;
      }

      document.documentElement.setAttribute("${DASHBOARD_BOOTSTRAP_ATTRIBUTE}", "true");
    } catch {}
  })();`;
}
