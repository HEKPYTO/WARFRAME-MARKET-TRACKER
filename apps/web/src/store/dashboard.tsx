import {
  batch,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  untrack,
  useContext,
  type ParentComponent,
} from "solid-js";
import { getRequestEvent } from "solid-js/web";
import {
  getRuntimeConfig,
  getTrackedItemPollingIntervalMs,
} from "@warframe-market-tracker/market-client";
import {
  clearAlerts as clearAlertsRequest,
  createRule,
  deleteAlert,
  deleteRule,
  fetchDashboard,
  updateTrackingPaused as updateTrackingPausedRequest,
  fetchWorkspace,
  reorderRules as reorderRulesRequest,
  updateRule,
  type DashboardMeta,
  type DashboardResponse,
  type WorkspaceResponse,
} from "~/lib/api";
import {
  clearDashboardBootstrapAttribute,
  createDashboardBootstrapState,
  createDashboardSessionCacheWriter,
  readSelectedRuleIdFromSearch,
  readDashboardSessionCache,
  resolveDashboardBootstrapPayload,
  withSelectedRuleIdInSearch,
  type DashboardBootstrapPayload,
} from "~/lib/dashboard-bootstrap";
import { UNAVAILABLE_WORKER_HEALTH_SNAPSHOT } from "~/lib/worker-health";
import type { WatchRuleRecord } from "@warframe-market-tracker/db";
import {
  createWorkspaceSummary,
  type WorkspaceSummary,
} from "~/lib/dashboard-view-model";
import {
  applyThemeToDocument,
  parseThemeModeFromCookieHeader,
  persistThemeCookie,
  readThemeModeFromDocument,
  type ThemeMode,
} from "~/lib/theme";
import { query } from "@solidjs/router";
import { getSettingsQuery } from "~/lib/settings-query";
import {
  createDashboardSlices,
  removeAlertFromSlices,
  removeRuleFromSlices,
  reorderRulesInSlices,
  replaceRuleInSlices,
  type DashboardSlices,
  updateRuleInSlices,
  upsertRuleInSlices,
} from "./dashboard-state";
import { getWorkspaceRefreshPlan } from "./workspace-refresh-plan";

export type DashboardRefreshState = "error" | "idle" | "refreshing";
export type { ThemeMode } from "~/lib/theme";

type DashboardContextValue = {
  dashboard: () => DashboardResponse;
  workspace: () => WorkspaceResponse | null;
  workspaceSummary: () => WorkspaceSummary;
  runtimeConfig: () => DashboardMeta;
  hasPendingRuleCreation: () => boolean;
  draggedRuleId: () => string | undefined;
  setDraggedRuleId: (id: string | undefined) => void;
  selectedRuleId: () => string | undefined;
  setSelectedRuleId: (id: string | undefined) => void;
  isLoading: () => boolean;
  lastRefreshAt: () => number | undefined;
  now: () => number;
  refreshError: () => string | undefined;
  refreshState: () => DashboardRefreshState;
  theme: () => ThemeMode;
  actions: {
    addRule: (
      itemSlug: string,
      maxPlatinum?: number,
      options?: {
        preserveSelectedRuleId?: string;
      },
    ) => Promise<void>;
    updateRulePrice: (ruleId: string, maxPlatinum: number) => Promise<void>;
    updateTrackingPaused: (paused: boolean) => Promise<void>;
    reorderRules: (ruleIds: string[]) => Promise<void>;
    removeRule: (ruleId: string) => Promise<void>;
    removeAlert: (alertId: string) => Promise<void>;
    clearAlerts: () => Promise<void>;
    refresh: (preserveRuleId?: string) => Promise<void>;
    toggleTheme: () => void;
  };
};

const EMPTY_SLICES: DashboardSlices = {
  alertIds: [],
  alertsById: {},
  ruleIds: [],
  rulesById: {},
};

const DashboardContext = createContext<DashboardContextValue>();
const defaultRuntimeConfig = getRuntimeConfig({});
const DEFAULT_SESSION_CACHE_MAX_AGE_MS = Math.max(
  defaultRuntimeConfig.safeRequestSpacingMs * 120,
  60_000,
);
const SESSION_CACHE_PERSIST_DEBOUNCE_MS = 150;

function getInitialThemeMode() {
  if (typeof document !== "undefined") {
    return readThemeModeFromDocument();
  }

  const requestEvent = getRequestEvent();
  return (
    parseThemeModeFromCookieHeader(
      requestEvent?.request.headers.get("cookie"),
    ) ?? "system"
  );
}

function removeKey<T>(record: Record<string, T>, key: string) {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function slicesToDashboardResponse(
  slices: DashboardSlices,
  meta: DashboardMeta,
): DashboardResponse {
  return {
    alerts: slices.alertIds
      .map((alertId) => slices.alertsById[alertId])
      .filter(
        (alert): alert is NonNullable<typeof alert> => alert !== undefined,
      ),
    meta,
    rules: slices.ruleIds
      .map((ruleId) => slices.rulesById[ruleId])
      .filter((rule): rule is NonNullable<typeof rule> => rule !== undefined),
  };
}

export const DashboardProvider: ParentComponent<{
  enableWorkspaceFetching?: boolean;
  initialData?: DashboardBootstrapPayload;
}> = (props) => {
  const initialBootstrapPayload = props.initialData;
  const enableWorkspaceFetching = () => props.enableWorkspaceFetching !== false;
  const initialBootstrapState = initialBootstrapPayload
    ? createDashboardBootstrapState(initialBootstrapPayload)
    : undefined;
  const [dashboardSlices, setDashboardSlices] = createSignal<DashboardSlices>(
    initialBootstrapState?.dashboardSlices ?? EMPTY_SLICES,
  );
  const [dashboardMeta, setDashboardMeta] = createSignal<DashboardMeta>({
    marketCrossplay:
      initialBootstrapState?.dashboardMeta.marketCrossplay ??
      defaultRuntimeConfig.marketCrossplay,
    marketPlatform:
      initialBootstrapState?.dashboardMeta.marketPlatform ??
      defaultRuntimeConfig.marketPlatform,
    safeRequestSpacingMs:
      initialBootstrapState?.dashboardMeta.safeRequestSpacingMs ??
      defaultRuntimeConfig.safeRequestSpacingMs,
    safeRequestsPerSecond:
      initialBootstrapState?.dashboardMeta.safeRequestsPerSecond ??
      defaultRuntimeConfig.safeRequestsPerSecond,
    trackingPaused:
      initialBootstrapState?.dashboardMeta.trackingPaused ?? false,
    theoreticalRequestsPerSecond:
      initialBootstrapState?.dashboardMeta.theoreticalRequestsPerSecond ??
      defaultRuntimeConfig.theoreticalRequestsPerSecond,
    workerHealth:
      initialBootstrapState?.dashboardMeta.workerHealth ??
      UNAVAILABLE_WORKER_HEALTH_SNAPSHOT,
    workerHealthState:
      initialBootstrapState?.dashboardMeta.workerHealthState ?? "unknown",
  });
  const [workspaceByRuleId, setWorkspaceByRuleId] = createSignal<
    Record<string, WorkspaceResponse>
  >(initialBootstrapState?.workspaceByRuleId ?? {});
  const [pendingCreatedRulesById, setPendingCreatedRulesById] = createSignal<
    Record<string, WatchRuleRecord>
  >({});
  const [pendingRuleUpdatesById, setPendingRuleUpdatesById] = createSignal<
    Record<string, { maxPlatinum?: number }>
  >({});
  const [pendingRemovedAlertIds, setPendingRemovedAlertIds] = createSignal<
    Record<string, true>
  >({});
  const [pendingClearAlerts, setPendingClearAlerts] = createSignal(false);
  const [draggedRuleId, setDraggedRuleIdSignal] = createSignal<
    string | undefined
  >();
  const [selectedRuleId, setSelectedRuleIdSignal] = createSignal<
    string | undefined
  >(initialBootstrapState?.selectedRuleId);
  const [now, setNow] = createSignal(Date.now());
  const [lastRefreshAt, setLastRefreshAt] = createSignal<number | undefined>(
    initialBootstrapState?.lastRefreshAt,
  );
  const [refreshError, setRefreshError] = createSignal<string>();
  const [refreshState, setRefreshState] = createSignal<DashboardRefreshState>(
    initialBootstrapState ? "idle" : "refreshing",
  );
  const [workspaceRefreshState, setWorkspaceRefreshState] =
    createSignal<DashboardRefreshState>("idle");
  const [theme, setTheme] = createSignal<ThemeMode>(getInitialThemeMode());
  const [selectionStateBootstrapped, setSelectionStateBootstrapped] =
    createSignal(false);
  let polledRefreshState: DashboardRefreshState = "refreshing";
  let dashboardRequestVersion = 0;
  let workspaceRequestVersion = 0;
  const latestWorkspaceRequestVersionByRuleId = new Map<string, number>();
  const inFlightWorkspaceRequestsByRuleId = new Map<string, Promise<void>>();
  const sessionCacheWriter =
    typeof window === "undefined"
      ? null
      : createDashboardSessionCacheWriter({
          debounceMs: SESSION_CACHE_PERSIST_DEBOUNCE_MS,
          storage: window.sessionStorage,
        });

  const runtimeConfig = createMemo(() => dashboardMeta());
  const hasPendingRuleCreation = createMemo(
    () => Object.keys(pendingCreatedRulesById()).length > 0,
  );

  function isPendingCreatedRule(ruleId: string | undefined) {
    if (!ruleId) {
      return false;
    }

    return pendingCreatedRulesById()[ruleId] !== undefined;
  }

  function buildTemporaryRule(
    itemSlug: string,
    maxPlatinum: number,
  ): WatchRuleRecord {
    const timestamp = new Date().toISOString();

    return {
      createdAt: timestamp,
      crossplay: runtimeConfig().marketCrossplay,
      enabled: true,
      id: `temp-rule-${crypto.randomUUID()}`,
      itemSlug,
      maxPlatinum,
      platform: runtimeConfig().marketPlatform as "pc",
      sortOrder: dashboardSlices().ruleIds.length + 1,
      updatedAt: timestamp,
      userId: "local-demo-user",
    };
  }

  function applyPendingSlices(nextSlices: DashboardSlices) {
    let mergedSlices = nextSlices;

    for (const pendingRule of Object.values(pendingCreatedRulesById())) {
      mergedSlices = upsertRuleInSlices(mergedSlices, pendingRule);
    }

    for (const [ruleId, updates] of Object.entries(pendingRuleUpdatesById())) {
      mergedSlices = updateRuleInSlices(mergedSlices, ruleId, updates);
    }

    for (const alertId of Object.keys(pendingRemovedAlertIds())) {
      mergedSlices = removeAlertFromSlices(mergedSlices, alertId);
    }

    if (pendingClearAlerts()) {
      mergedSlices = {
        ...mergedSlices,
        alertIds: [],
        alertsById: {},
      };
    }

    return mergedSlices;
  }

  function persistSessionCache(cachedAt: number) {
    if (sessionCacheWriter === null) {
      return;
    }

    sessionCacheWriter.schedule({
      cachedAt,
      dashboard: dashboard(),
      selectedRuleId: selectedRuleId(),
      workspaceByRuleId: workspaceByRuleId(),
    });
  }

  function applyBootstrapPayload(payload: DashboardBootstrapPayload) {
    const nextBootstrapState = createDashboardBootstrapState(payload);

    batch(() => {
      setDashboardMeta(nextBootstrapState.dashboardMeta);
      setDashboardSlices(nextBootstrapState.dashboardSlices);
      setWorkspaceByRuleId(nextBootstrapState.workspaceByRuleId);
      setSelectedRuleIdSignal(nextBootstrapState.selectedRuleId);
      setLastRefreshAt(nextBootstrapState.lastRefreshAt);
      setRefreshError(undefined);
      setRefreshState("idle");
    });
  }

  function syncSelectedRuleIdToLocation(ruleId: string | undefined) {
    if (typeof window === "undefined") {
      return;
    }

    const nextSearch = withSelectedRuleIdInSearch(
      window.location.search,
      ruleId,
    );
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }

  const dashboard = createMemo(() =>
    slicesToDashboardResponse(dashboardSlices(), runtimeConfig()),
  );
  const workspace = createMemo(() => {
    const ruleId = selectedRuleId();
    if (!ruleId) {
      return null;
    }

    return workspaceByRuleId()[ruleId] ?? null;
  });

  const workspaceSummary = createMemo(() =>
    createWorkspaceSummary(dashboard(), workspace()),
  );
  const isLoading = createMemo(() => {
    if (refreshState() === "refreshing" && dashboard().rules.length === 0) {
      return true;
    }

    if (selectedRuleId() && workspace() === null) {
      return workspaceRefreshState() === "refreshing";
    }

    return false;
  });

  onMount(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleThemePreferenceChange = () => applyThemeToDocument(theme());

    mediaQuery.addEventListener("change", handleThemePreferenceChange);

    onCleanup(() =>
      mediaQuery.removeEventListener("change", handleThemePreferenceChange),
    );
  });

  createEffect(() => {
    if (typeof document === "undefined") return;

    const currentTheme = theme();
    applyThemeToDocument(currentTheme);
    persistThemeCookie(currentTheme);
  });

  createEffect(() => {
    polledRefreshState = refreshState();
  });

  createEffect(() => {
    if (typeof window === "undefined" || !selectionStateBootstrapped()) {
      return;
    }

    const ruleId = selectedRuleId();
    const ruleCount = dashboard().rules.length;

    if (ruleId === undefined && ruleCount > 0) {
      return;
    }

    untrack(() => {
      if (ruleCount > 0) {
        persistSessionCache(lastRefreshAt() ?? Date.now());
      }
    });
    syncSelectedRuleIdToLocation(ruleId);
  });

  createEffect(() => {
    if (typeof document === "undefined" || !selectionStateBootstrapped()) {
      return;
    }

    if (selectedRuleId() && workspace() === null) {
      return;
    }

    clearDashboardBootstrapAttribute();
  });

  createEffect(() => {
    if (typeof window === "undefined") return;
    const intervalId = window.setInterval(() => setNow(Date.now()), 100);
    onCleanup(() => window.clearInterval(intervalId));
  });

  onMount(() => {
    if (sessionCacheWriter === null) {
      return;
    }

    const flushSessionCache = () => sessionCacheWriter.flush();
    window.addEventListener("pagehide", flushSessionCache);
    onCleanup(() => {
      window.removeEventListener("pagehide", flushSessionCache);
      sessionCacheWriter.dispose();
    });
  });

  async function refreshDashboardSlices(preserveRuleId?: string) {
    const requestVersion = ++dashboardRequestVersion;
    setRefreshState("refreshing");

    try {
      const nextDashboard = await fetchDashboard();

      if (dashboardRequestVersion !== requestVersion) {
        return;
      }

      const nextSlices = applyPendingSlices(
        createDashboardSlices(nextDashboard),
      );

      setDashboardMeta(nextDashboard.meta);
      setDashboardSlices(nextSlices);

      const currentSelectedRuleId = preserveRuleId ?? selectedRuleId();
      const nextSelectedRuleId =
        currentSelectedRuleId && nextSlices.rulesById[currentSelectedRuleId]
          ? currentSelectedRuleId
          : nextSlices.ruleIds.at(0);
      setSelectedRuleIdSignal(nextSelectedRuleId);
      setLastRefreshAt(Date.now());
      setRefreshError(undefined);
      setRefreshState("idle");
      persistSessionCache(Date.now());

      if (enableWorkspaceFetching()) {
        const refreshPlan = getWorkspaceRefreshPlan({
          maxBackgroundRuleIds: 1,
          preferredRuleId: nextSelectedRuleId,
          ruleIds: nextSlices.ruleIds,
          workspaceByRuleId: workspaceByRuleId(),
        });

        if (
          refreshPlan.primaryRuleId &&
          !isPendingCreatedRule(refreshPlan.primaryRuleId)
        ) {
          void requestWorkspaceSlice(refreshPlan.primaryRuleId, {
            background: true,
          });
        }

        void warmWorkspaceSlices(refreshPlan.backgroundRuleIds);
      }
    } catch (error) {
      if (dashboardRequestVersion !== requestVersion) {
        return;
      }

      setRefreshError(
        error instanceof Error ? error.message : "Unable to refresh dashboard",
      );
      setRefreshState("error");
    }
  }

  function withPendingWorkspaceRuleUpdate(
    ruleId: string,
    nextWorkspace: WorkspaceResponse,
  ) {
    const pendingRuleUpdate = pendingRuleUpdatesById()[ruleId];

    if (pendingRuleUpdate?.maxPlatinum === undefined) {
      return nextWorkspace;
    }

    return {
      ...nextWorkspace,
      rule: {
        ...nextWorkspace.rule,
        maxPlatinum: pendingRuleUpdate.maxPlatinum,
      },
    };
  }

  async function requestWorkspaceSlice(
    ruleId = selectedRuleId(),
    options?: {
      background?: boolean;
    },
  ) {
    if (!enableWorkspaceFetching() || !ruleId || isPendingCreatedRule(ruleId)) {
      return;
    }

    const existingRequest = inFlightWorkspaceRequestsByRuleId.get(ruleId);

    if (existingRequest) {
      return existingRequest;
    }

    const requestVersion = ++workspaceRequestVersion;
    latestWorkspaceRequestVersionByRuleId.set(ruleId, requestVersion);

    if (!options?.background && selectedRuleId() === ruleId) {
      setWorkspaceRefreshState("refreshing");
    }

    let requestPromise: Promise<void> | undefined;
    requestPromise = (async () => {
      try {
        const nextWorkspace = await fetchWorkspace(ruleId);

        if (
          latestWorkspaceRequestVersionByRuleId.get(ruleId) !== requestVersion
        ) {
          return;
        }

        setWorkspaceByRuleId((current) => ({
          ...current,
          [ruleId]: withPendingWorkspaceRuleUpdate(ruleId, nextWorkspace),
        }));

        if (!options?.background && selectedRuleId() === ruleId) {
          setWorkspaceRefreshState("idle");
        }

        persistSessionCache(lastRefreshAt() ?? Date.now());
      } catch (error) {
        if (
          latestWorkspaceRequestVersionByRuleId.get(ruleId) !== requestVersion
        ) {
          return;
        }

        if (!options?.background && selectedRuleId() === ruleId) {
          setWorkspaceRefreshState("error");
          setRefreshError(
            error instanceof Error
              ? error.message
              : "Unable to refresh workspace",
          );
        }
      } finally {
        if (
          requestPromise &&
          inFlightWorkspaceRequestsByRuleId.get(ruleId) === requestPromise
        ) {
          inFlightWorkspaceRequestsByRuleId.delete(ruleId);
        }
      }
    })();

    inFlightWorkspaceRequestsByRuleId.set(ruleId, requestPromise);
    return requestPromise;
  }

  async function refreshWorkspaceSlice(ruleId = selectedRuleId()) {
    await requestWorkspaceSlice(ruleId, {
      background: false,
    });
  }

  function warmWorkspaceSlices(ruleIds: string[]) {
    for (const ruleId of ruleIds) {
      if (isPendingCreatedRule(ruleId)) {
        continue;
      }

      void requestWorkspaceSlice(ruleId, {
        background: true,
      });
    }
  }

  async function refresh(preserveRuleId?: string) {
    await refreshDashboardSlices(preserveRuleId);
    const nextRuleId = preserveRuleId ?? selectedRuleId();

    if (
      enableWorkspaceFetching() &&
      nextRuleId &&
      !isPendingCreatedRule(nextRuleId)
    ) {
      await refreshWorkspaceSlice(nextRuleId);
    }
  }

  function handlePollingTick() {
    if (runtimeConfig().trackingPaused) {
      return;
    }

    if (polledRefreshState !== "refreshing") {
      void refreshDashboardSlices();
    }
  }

  async function addRule(
    itemSlug: string,
    maxPlatinum?: number,
    options?: {
      preserveSelectedRuleId?: string;
    },
  ) {
    const normalizedItemSlug = itemSlug.trim();
    const temporaryRule = buildTemporaryRule(
      normalizedItemSlug,
      maxPlatinum ?? 0,
    );
    const preservedRuleId = options?.preserveSelectedRuleId;
    const shouldPreserveSelection =
      preservedRuleId !== undefined && preservedRuleId.length > 0;

    setPendingCreatedRulesById((current) => ({
      ...current,
      [temporaryRule.id]: temporaryRule,
    }));
    setDashboardSlices((current) => upsertRuleInSlices(current, temporaryRule));

    if (shouldPreserveSelection) {
      if (selectedRuleId() !== preservedRuleId) {
        setSelectedRuleIdSignal(preservedRuleId);
      }
    } else {
      setSelectedRuleIdSignal(temporaryRule.id);
      setWorkspaceRefreshState("refreshing");
    }

    try {
      const createdRule = await createRule(
        maxPlatinum === undefined
          ? {
              itemSlug: normalizedItemSlug,
            }
          : {
              itemSlug: normalizedItemSlug,
              maxPlatinum,
            },
      );

      batch(() => {
        if (!shouldPreserveSelection && selectedRuleId() === temporaryRule.id) {
          setSelectedRuleIdSignal(createdRule.id);
        }

        setPendingCreatedRulesById((current) =>
          removeKey(current, temporaryRule.id),
        );
        setDashboardSlices((current) =>
          replaceRuleInSlices(current, temporaryRule.id, createdRule),
        );
        setWorkspaceByRuleId((current) => removeKey(current, temporaryRule.id));
      });

      if (shouldPreserveSelection) {
        void requestWorkspaceSlice(createdRule.id, {
          background: true,
        });
        void refreshDashboardSlices(preservedRuleId);
      } else {
        void refreshWorkspaceSlice(createdRule.id);
        void refreshDashboardSlices(createdRule.id);
      }
    } catch (error) {
      const fallbackRuleId = dashboardSlices().ruleIds.find(
        (ruleId) => ruleId !== temporaryRule.id,
      );

      batch(() => {
        setPendingCreatedRulesById((current) =>
          removeKey(current, temporaryRule.id),
        );
        setDashboardSlices((current) =>
          removeRuleFromSlices(current, temporaryRule.id),
        );
        setWorkspaceByRuleId((current) => removeKey(current, temporaryRule.id));

        if (!shouldPreserveSelection && selectedRuleId() === temporaryRule.id) {
          setSelectedRuleIdSignal(fallbackRuleId);
        }

        if (!shouldPreserveSelection) {
          setWorkspaceRefreshState("idle");
        }
      });
      throw error;
    }
  }

  async function removeRule(ruleId: string) {
    const previousSlices = dashboardSlices();
    const previousWorkspaceByRuleId = workspaceByRuleId();
    const previousSelectedRuleId = selectedRuleId();
    const nextSlices = removeRuleFromSlices(previousSlices, ruleId);
    const nextSelectedRuleId =
      previousSelectedRuleId === ruleId
        ? nextSlices.ruleIds.at(0)
        : previousSelectedRuleId;

    batch(() => {
      setDashboardSlices(nextSlices);
      setWorkspaceByRuleId((current) => removeKey(current, ruleId));
      setSelectedRuleIdSignal(nextSelectedRuleId);
    });

    try {
      await deleteRule(ruleId);
      void refreshDashboardSlices(nextSelectedRuleId);

      if (
        nextSelectedRuleId &&
        !workspaceByRuleId()[nextSelectedRuleId] &&
        !isPendingCreatedRule(nextSelectedRuleId)
      ) {
        void refreshWorkspaceSlice(nextSelectedRuleId);
      }
    } catch (error) {
      batch(() => {
        setDashboardSlices(previousSlices);
        setWorkspaceByRuleId(previousWorkspaceByRuleId);
        setSelectedRuleIdSignal(previousSelectedRuleId);
      });
      throw error;
    }
  }

  async function reorderRules(ruleIds: string[]) {
    const currentRuleIds = dashboardSlices().ruleIds;

    if (
      ruleIds.length !== currentRuleIds.length ||
      ruleIds.every((ruleId, index) => currentRuleIds[index] === ruleId)
    ) {
      return;
    }

    const previousSlices = dashboardSlices();
    setDashboardSlices((current) => reorderRulesInSlices(current, ruleIds));

    try {
      await reorderRulesRequest(ruleIds);
      void refreshDashboardSlices(selectedRuleId());
    } catch (error) {
      setDashboardSlices(previousSlices);
      throw error;
    }
  }

  async function updateRulePrice(ruleId: string, maxPlatinum: number) {
    const previousSlices = dashboardSlices();
    const previousWorkspaceByRuleId = workspaceByRuleId();
    let updateSucceeded = false;

    batch(() => {
      setPendingRuleUpdatesById((current) => ({
        ...current,
        [ruleId]: { maxPlatinum },
      }));
      setDashboardSlices((current) =>
        updateRuleInSlices(current, ruleId, { maxPlatinum }),
      );
      setWorkspaceByRuleId((current) => {
        const currentWorkspace = current[ruleId];

        if (!currentWorkspace) {
          return current;
        }

        return {
          ...current,
          [ruleId]: {
            ...currentWorkspace,
            rule: {
              ...currentWorkspace.rule,
              maxPlatinum,
            },
          },
        };
      });
    });

    try {
      await updateRule(ruleId, { maxPlatinum });
      updateSucceeded = true;
      await Promise.allSettled([
        refreshDashboardSlices(ruleId),
        refreshWorkspaceSlice(ruleId),
      ]);
    } catch (error) {
      if (!updateSucceeded) {
        batch(() => {
          setDashboardSlices(previousSlices);
          setWorkspaceByRuleId(previousWorkspaceByRuleId);
        });
      }

      throw error;
    } finally {
      setPendingRuleUpdatesById((current) => removeKey(current, ruleId));
    }
  }

  async function updateTrackingPaused(paused: boolean) {
    const previousMeta = dashboardMeta();
    setDashboardMeta((current) => ({
      ...current,
      trackingPaused: paused,
    }));

    try {
      const nextSettings = await updateTrackingPausedRequest(paused);
      query.set(getSettingsQuery.keyFor(), nextSettings);
      void refreshDashboardSlices(selectedRuleId());
    } catch (error) {
      setDashboardMeta(previousMeta);
      throw error;
    }
  }

  async function removeAlert(alertId: string) {
    const previousSlices = dashboardSlices();

    batch(() => {
      setPendingRemovedAlertIds((current) => ({
        ...current,
        [alertId]: true,
      }));
      setDashboardSlices((current) => removeAlertFromSlices(current, alertId));
    });

    try {
      await deleteAlert(alertId);
      setPendingRemovedAlertIds((current) => removeKey(current, alertId));
      void refreshDashboardSlices(selectedRuleId());
    } catch (error) {
      batch(() => {
        setPendingRemovedAlertIds((current) => removeKey(current, alertId));
        setDashboardSlices(previousSlices);
      });
      throw error;
    }
  }

  async function clearAlerts() {
    const previousSlices = dashboardSlices();

    batch(() => {
      setPendingClearAlerts(true);
      setDashboardSlices((current) => ({
        ...current,
        alertIds: [],
        alertsById: {},
      }));
    });

    try {
      await clearAlertsRequest();
      setPendingClearAlerts(false);
      void refreshDashboardSlices(selectedRuleId());
    } catch (error) {
      batch(() => {
        setPendingClearAlerts(false);
        setDashboardSlices(previousSlices);
      });
      throw error;
    }
  }

  createEffect(() => {
    if (!enableWorkspaceFetching()) {
      return;
    }

    const ruleId = selectedRuleId();

    if (!ruleId || isPendingCreatedRule(ruleId)) {
      return;
    }

    if (!workspaceByRuleId()[ruleId]) {
      void refreshWorkspaceSlice(ruleId);
    }
  });

  createEffect(() => {
    if (!enableWorkspaceFetching()) {
      return;
    }

    const missingRuleIds = getWorkspaceRefreshPlan({
      maxBackgroundRuleIds: 1,
      preferredRuleId: selectedRuleId(),
      ruleIds: dashboardSlices().ruleIds.filter(
        (ruleId) => !isPendingCreatedRule(ruleId),
      ),
      workspaceByRuleId: workspaceByRuleId(),
    }).backgroundRuleIds;

    if (missingRuleIds.length === 0) {
      return;
    }

    warmWorkspaceSlices(missingRuleIds);
  });

  createEffect(() => {
    if (typeof window === "undefined") return;
    if (runtimeConfig().trackingPaused) {
      return;
    }

    const intervalMs = getTrackedItemPollingIntervalMs({
      safeRequestSpacingMs: runtimeConfig().safeRequestSpacingMs,
      trackedItems: workspaceSummary().polledItems,
    });
    if (intervalMs === null) {
      return;
    }
    const intervalId = window.setInterval(handlePollingTick, intervalMs);

    onCleanup(() => window.clearInterval(intervalId));
  });

  onMount(() => {
    const locationSelectedRuleId = readSelectedRuleIdFromSearch(
      window.location.search,
    );

    if (initialBootstrapPayload) {
      const bootstrapRuleId = initialBootstrapState?.selectedRuleId;
      applyBootstrapPayload(initialBootstrapPayload);
      persistSessionCache(initialBootstrapPayload.cachedAt);
      setSelectionStateBootstrapped(true);
      window.setTimeout(() => {
        untrack(() => {
          void refresh(bootstrapRuleId);
        });
      }, 0);
      return;
    }

    const cachedBootstrapPayload = readDashboardSessionCache(
      window.sessionStorage,
      {
        maxAgeMs: DEFAULT_SESSION_CACHE_MAX_AGE_MS,
        now: Date.now(),
      },
    );
    const bootstrapPayload = resolveDashboardBootstrapPayload({
      cachedBootstrapPayload,
      initialBootstrapPayload,
      locationSelectedRuleId,
    });

    if (bootstrapPayload) {
      const bootstrapRuleId =
        createDashboardBootstrapState(bootstrapPayload).selectedRuleId;

      applyBootstrapPayload(bootstrapPayload);
      persistSessionCache(bootstrapPayload.cachedAt);
      setSelectionStateBootstrapped(true);
      window.setTimeout(() => {
        untrack(() => {
          void refresh(bootstrapRuleId);
        });
      }, 0);
      return;
    }

    setSelectionStateBootstrapped(true);
    void refreshDashboardSlices(locationSelectedRuleId);
  });

  return (
    <DashboardContext.Provider
      value={{
        dashboard,
        workspace,
        workspaceSummary,
        runtimeConfig,
        hasPendingRuleCreation,
        draggedRuleId,
        setDraggedRuleId: (id) => setDraggedRuleIdSignal(id),
        selectedRuleId,
        setSelectedRuleId: (id) => {
          setSelectedRuleIdSignal(id);
          if (
            enableWorkspaceFetching() &&
            id &&
            !workspaceByRuleId()[id] &&
            !isPendingCreatedRule(id)
          ) {
            void refreshWorkspaceSlice(id);
          }
        },
        isLoading,
        lastRefreshAt,
        now,
        refreshError,
        refreshState,
        theme,
        actions: {
          addRule,
          updateRulePrice,
          updateTrackingPaused,
          reorderRules,
          removeRule,
          removeAlert,
          clearAlerts,
          refresh,
          toggleTheme: () => {
            setTheme((prev) => {
              if (prev === "system") return "light";
              if (prev === "light") return "dark";
              return "system";
            });
          },
        },
      }}
    >
      {props.children}
    </DashboardContext.Provider>
  );
};

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
}
