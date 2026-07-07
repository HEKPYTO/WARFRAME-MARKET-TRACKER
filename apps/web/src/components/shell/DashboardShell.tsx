import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  Suspense,
  type JSX,
} from "solid-js";
import { Icon } from "solid-heroicons";
import { bellAlert } from "solid-heroicons/solid";
import { Alerts } from "~/components/workspace/Alerts";
import { MarketPane } from "~/components/workspace/MarketPane";
import { Watchlist } from "~/components/workspace/Watchlist";
import { useDashboard } from "~/store/dashboard";
import { PanelToggleBar } from "./PanelToggleBar";

type CompactPanel = "alerts" | "watchlist" | null;
type ResizablePanel = "alerts" | "watchlist";

const ALERTS_OPEN_STORAGE_KEY = "wmt-layout-alerts-open";
const ALERTS_WIDTH_STORAGE_KEY = "wmt-layout-alerts-width";
const DEFAULT_SIDE_PANE_WIDTH = 280;
const DOCKED_BREAKPOINT_PX = 900;
const MARKET_MIN_WIDTH = 360;
const SIDE_PANE_MAX_WIDTH = 460;
const SIDE_PANE_MIN_WIDTH = 220;
const WATCHLIST_OPEN_STORAGE_KEY = "wmt-layout-watchlist-open";
const WATCHLIST_WIDTH_STORAGE_KEY = "wmt-layout-watchlist-width";

function clampValue(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === "true") return true;
  if (storedValue === "false") return false;

  return fallback;
}

function readStoredWidth(key: string) {
  if (typeof window === "undefined") return DEFAULT_SIDE_PANE_WIDTH;

  const storedValue = Number.parseInt(
    window.localStorage.getItem(key) ?? "",
    10,
  );

  return Number.isFinite(storedValue) ? storedValue : DEFAULT_SIDE_PANE_WIDTH;
}

export function DashboardShell(props: { children?: JSX.Element }) {
  const { dashboard } = useDashboard();
  const [viewportWidth, setViewportWidth] = createSignal(1440);
  const [activeCompactPanel, setActiveCompactPanel] =
    createSignal<CompactPanel>(null);
  const [layoutBootstrapped, setLayoutBootstrapped] = createSignal(false);
  const [alertsOpen, setAlertsOpen] = createSignal(true);
  const [alertsWidth, setAlertsWidth] = createSignal(DEFAULT_SIDE_PANE_WIDTH);
  const [watchlistOpen, setWatchlistOpen] = createSignal(true);
  const [watchlistWidth, setWatchlistWidth] = createSignal(
    DEFAULT_SIDE_PANE_WIDTH,
  );

  const isDockedLayout = createMemo(
    () => viewportWidth() >= DOCKED_BREAKPOINT_PX,
  );
  const isPhone = createMemo(() => viewportWidth() < 768);
  const alertCount = createMemo(() => dashboard().alerts.length);
  const ruleCount = createMemo(() => dashboard().rules.length);
  const resizeHandleClass =
    "relative z-20 -mx-1 flex w-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center bg-transparent focus-visible:outline-none";
  const restoreBarButtonBaseClass =
    "pointer-events-auto flex h-9 min-w-0 items-center justify-start gap-2 border-b border-border bg-panel px-4 font-mono text-[10px] uppercase tracking-wide text-text-secondary transition-colors hover:bg-hover hover:text-text-primary focus-visible:bg-hover focus-visible:text-text-primary focus-visible:outline-none";
  const restoreBarResizeHandleClass =
    "pointer-events-auto relative z-40 -mx-1 flex h-9 w-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center bg-transparent focus-visible:outline-none";
  const restoreButtonLineClass =
    "relative z-10 w-px bg-border transition-colors";
  const restoreRailButtonClass =
    "absolute inset-y-0 left-1/2 z-20 w-3 -translate-x-1/2 cursor-pointer bg-transparent focus-visible:outline-none";
  const restoreRailClass =
    "group relative z-20 flex w-px shrink-0 items-stretch justify-center hover:[&_[data-rail-line]]:bg-border-strong focus-within:[&_[data-rail-line]]:bg-accent-gold";

  function getMaxPaneWidth(reservedWidth: number) {
    const availableWidth =
      viewportWidth() - MARKET_MIN_WIDTH - reservedWidth - 16;

    return Math.max(
      SIDE_PANE_MIN_WIDTH,
      Math.min(SIDE_PANE_MAX_WIDTH, availableWidth),
    );
  }

  function clampPaneWidth(width: number, reservedWidth: number) {
    return clampValue(
      width,
      SIDE_PANE_MIN_WIDTH,
      getMaxPaneWidth(reservedWidth),
    );
  }

  const effectiveWatchlistWidth = createMemo(() =>
    clampPaneWidth(watchlistWidth(), alertsOpen() ? alertsWidth() : 0),
  );
  const effectiveAlertsWidth = createMemo(() =>
    clampPaneWidth(
      alertsWidth(),
      watchlistOpen() ? effectiveWatchlistWidth() : 0,
    ),
  );

  function handleCompactToggle(panel: Exclude<CompactPanel, null>) {
    setActiveCompactPanel((current) => (current === panel ? null : panel));
  }

  function closeCompactPanel() {
    setActiveCompactPanel(null);
  }

  function handleResizeStart(
    panel: ResizablePanel,
    event: PointerEvent & { currentTarget: HTMLDivElement },
  ) {
    if (!isDockedLayout()) return;

    event.preventDefault();

    const startX = event.clientX;
    const startWidth =
      panel === "watchlist"
        ? effectiveWatchlistWidth()
        : effectiveAlertsWidth();
    const resizeTarget = event.currentTarget;

    resizeTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta =
        panel === "watchlist"
          ? moveEvent.clientX - startX
          : startX - moveEvent.clientX;
      const reservedWidth =
        panel === "watchlist"
          ? alertsOpen()
            ? effectiveAlertsWidth()
            : 0
          : watchlistOpen()
            ? effectiveWatchlistWidth()
            : 0;
      const nextWidth = clampPaneWidth(startWidth + delta, reservedWidth);

      if (panel === "watchlist") {
        setWatchlistWidth(nextWidth);
      } else {
        setAlertsWidth(nextWidth);
      }
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (resizeTarget.hasPointerCapture(upEvent.pointerId)) {
        resizeTarget.releasePointerCapture(upEvent.pointerId);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  onMount(() => {
    if (typeof window === "undefined") return;

    setAlertsOpen(readStoredBoolean(ALERTS_OPEN_STORAGE_KEY, true));
    setAlertsWidth(readStoredWidth(ALERTS_WIDTH_STORAGE_KEY));
    setWatchlistOpen(readStoredBoolean(WATCHLIST_OPEN_STORAGE_KEY, true));
    setWatchlistWidth(readStoredWidth(WATCHLIST_WIDTH_STORAGE_KEY));

    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    setLayoutBootstrapped(true);
    onCleanup(() => window.removeEventListener("resize", handleResize));
  });

  createEffect(() => {
    if (isDockedLayout()) {
      setActiveCompactPanel(null);
    }
  });

  createEffect(() => {
    if (!layoutBootstrapped() || typeof window === "undefined") return;

    window.localStorage.setItem(ALERTS_OPEN_STORAGE_KEY, String(alertsOpen()));
    window.localStorage.setItem(
      ALERTS_WIDTH_STORAGE_KEY,
      String(alertsWidth()),
    );
    window.localStorage.setItem(
      WATCHLIST_OPEN_STORAGE_KEY,
      String(watchlistOpen()),
    );
    window.localStorage.setItem(
      WATCHLIST_WIDTH_STORAGE_KEY,
      String(watchlistWidth()),
    );
  });

  return (
    <div
      class="relative flex min-h-0 flex-1 flex-col bg-app"
      data-testid="dashboard-shell"
    >
      <Show when={!isDockedLayout()}>
        <PanelToggleBar
          activePanel={activeCompactPanel()}
          alertCount={alertCount()}
          onToggle={handleCompactToggle}
          ruleCount={ruleCount()}
        />
      </Show>

      <Suspense
        fallback={
          <div class="h-full w-full animate-pulse bg-surface-base/50" />
        }
      >
        <Show when={!isDockedLayout()}>
          <div class="min-h-0 flex-1 overflow-hidden">
            {props.children ? (
              props.children
            ) : (
              <MarketPane class="h-full min-h-0" compact />
            )}
          </div>
        </Show>

        <Show when={isDockedLayout()}>
          <div class="relative flex min-h-0 flex-1 overflow-hidden">
            <Show when={!watchlistOpen() || !alertsOpen()}>
              <div
                class="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-9"
                data-testid="desktop-pane-restore-bar"
              >
                <Show
                  fallback={
                    <div
                      aria-hidden="true"
                      class="h-full shrink-0"
                      style={{ width: `${effectiveWatchlistWidth()}px` }}
                    />
                  }
                  when={!watchlistOpen()}
                >
                  <button
                    aria-label="Show watchlist pane"
                    class={restoreBarButtonBaseClass}
                    data-testid="watchlist-pane-expand"
                    onClick={() => setWatchlistOpen(true)}
                    style={{ width: `${effectiveWatchlistWidth()}px` }}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      class="flex h-3.5 w-3.5 shrink-0 flex-col items-center justify-center gap-[2px]"
                      data-testid="watchlist-pane-expand-icon"
                    >
                      <span class="block h-[1.5px] w-3 rounded-full bg-current" />
                      <span class="block h-[1.5px] w-3 rounded-full bg-current" />
                      <span class="block h-[1.5px] w-3 rounded-full bg-current" />
                    </span>
                    <span>{ruleCount()} rules</span>
                  </button>
                  <div
                    aria-label="Resize collapsed watchlist pane"
                    class={restoreBarResizeHandleClass}
                    data-testid="watchlist-pane-topbar-resize"
                    onPointerDown={(event) =>
                      handleResizeStart("watchlist", event)
                    }
                    role="separator"
                    tabIndex={0}
                  />
                </Show>
                <div
                  aria-hidden="true"
                  class="h-full min-w-0 flex-1"
                  data-testid="desktop-pane-restore-center"
                />
                <Show
                  fallback={
                    <div
                      aria-hidden="true"
                      class="h-full shrink-0"
                      style={{ width: `${effectiveAlertsWidth()}px` }}
                    />
                  }
                  when={!alertsOpen()}
                >
                  <div
                    aria-label="Resize collapsed alerts pane"
                    class={restoreBarResizeHandleClass}
                    data-testid="alerts-pane-topbar-resize"
                    onPointerDown={(event) =>
                      handleResizeStart("alerts", event)
                    }
                    role="separator"
                    tabIndex={0}
                  />
                  <button
                    aria-label="Show alerts pane"
                    class={restoreBarButtonBaseClass}
                    data-testid="alerts-pane-expand"
                    onClick={() => setAlertsOpen(true)}
                    style={{ width: `${effectiveAlertsWidth()}px` }}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      class="flex h-3.5 w-3.5 shrink-0 items-center justify-center"
                      data-testid="alerts-pane-expand-icon"
                    >
                      <Icon class="h-3.5 w-3.5" path={bellAlert} />
                    </span>
                    <span>{alertCount()} alerts</span>
                  </button>
                </Show>
              </div>
            </Show>
            <Show
              fallback={
                <div class={restoreRailClass} data-testid="watchlist-pane-rail">
                  <span
                    aria-hidden="true"
                    class={restoreButtonLineClass}
                    data-rail-line
                    data-testid="watchlist-pane-expand-line"
                  />
                  <button
                    aria-label="Show watchlist pane"
                    class={restoreRailButtonClass}
                    data-testid="watchlist-pane-rail-expand"
                    onClick={() => setWatchlistOpen(true)}
                    type="button"
                  />
                </div>
              }
              when={watchlistOpen()}
            >
              <div
                class="min-h-0 shrink-0"
                data-testid="watchlist-pane-shell"
                style={{ width: `${effectiveWatchlistWidth()}px` }}
              >
                <Watchlist
                  class="h-full min-h-0 border-r border-border"
                  onPaneHeaderClick={() => setWatchlistOpen(false)}
                  paneHeaderAriaLabel="Collapse watchlist pane"
                  paneHeaderTestId="watchlist-pane-header"
                />
              </div>
              <div
                aria-label="Resize watchlist pane"
                class={resizeHandleClass}
                data-testid="watchlist-pane-resize"
                onPointerDown={(event) => handleResizeStart("watchlist", event)}
                role="separator"
                tabIndex={0}
              />
            </Show>
            {props.children ? (
              props.children
            ) : (
              <MarketPane class="min-h-0 min-w-0 flex-1" />
            )}
            <Show
              fallback={
                <div class={restoreRailClass} data-testid="alerts-pane-rail">
                  <span
                    aria-hidden="true"
                    class={restoreButtonLineClass}
                    data-rail-line
                    data-testid="alerts-pane-expand-line"
                  />
                  <button
                    aria-label="Show alerts pane"
                    class={restoreRailButtonClass}
                    data-testid="alerts-pane-rail-expand"
                    onClick={() => setAlertsOpen(true)}
                    type="button"
                  />
                </div>
              }
              when={alertsOpen()}
            >
              <div
                aria-label="Resize alerts pane"
                class={resizeHandleClass}
                data-testid="alerts-pane-resize"
                onPointerDown={(event) => handleResizeStart("alerts", event)}
                role="separator"
                tabIndex={0}
              />
              <div
                class="min-h-0 shrink-0"
                data-testid="alerts-pane-shell"
                style={{ width: `${effectiveAlertsWidth()}px` }}
              >
                <Alerts
                  class="h-full min-h-0 border-l border-border"
                  onPaneHeaderClick={() => setAlertsOpen(false)}
                  paneHeaderAriaLabel="Collapse alerts pane"
                  paneHeaderTestId="alerts-pane-header"
                />
              </div>
            </Show>
          </div>
        </Show>
      </Suspense>

      <Show when={!isDockedLayout() && activeCompactPanel() !== null}>
        <div
          class="absolute inset-0 z-20 bg-black/50 xl:hidden"
          onClick={closeCompactPanel}
        />
      </Show>

      <Show when={!isDockedLayout() && activeCompactPanel() === "watchlist"}>
        <div
          class={`absolute inset-y-0 left-0 z-30 w-full ${isPhone() ? "right-0" : "max-w-[22rem]"}`}
        >
          <Watchlist
            class="h-full border-r border-border"
            onRequestClose={closeCompactPanel}
          />
        </div>
      </Show>

      <Show when={!isDockedLayout() && activeCompactPanel() === "alerts"}>
        <div
          class={`absolute inset-y-0 z-30 w-full ${isPhone() ? "right-0 left-0" : "right-0 max-w-[22rem]"}`}
        >
          <Alerts
            class="h-full border-l border-border"
            onRequestClose={closeCompactPanel}
          />
        </div>
      </Show>
    </div>
  );
}
