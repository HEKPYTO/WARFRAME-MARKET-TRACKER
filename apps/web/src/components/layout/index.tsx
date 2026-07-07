import { Icon } from "solid-heroicons";
import { useLocation } from "@solidjs/router";
import { cog } from "solid-heroicons/outline";
import { onCleanup, onMount, type ParentComponent } from "solid-js";
import { useDashboard } from "~/store/dashboard";
import { getRulesFooterLinkPresentation } from "./footer-links";
import { getFooterStatusPresentation } from "./footer-status";
import { shouldToggleThemeFromKeyboardEvent } from "./theme-shortcut";
import { getThemeTogglePresentation } from "./theme-toggle";
import { WorkerHealthToast } from "./WorkerHealthToast";

export const StatusBar: ParentComponent = () => {
  const location = useLocation();
  const {
    theme,
    workspaceSummary,
    runtimeConfig,
    lastRefreshAt,
    now,
    refreshState,
    actions,
  } = useDashboard();
  const themeTogglePresentation = () => getThemeTogglePresentation(theme());
  const rulesFooterLinkPresentation = () =>
    getRulesFooterLinkPresentation(
      location.pathname,
      workspaceSummary().trackedItems,
    );
  const footerStatusPresentation = () =>
    getFooterStatusPresentation({
      lastRefreshAt: lastRefreshAt(),
      now: now(),
      refreshState: refreshState(),
      safeRequestSpacingMs: runtimeConfig().safeRequestSpacingMs,
      trackedItems: workspaceSummary().polledItems,
      trackingPaused: runtimeConfig().trackingPaused,
    });
  const pollingRingColor = () =>
    footerStatusPresentation().tone === "error"
      ? "var(--theme-accent-danger)"
      : footerStatusPresentation().tone === "paused"
        ? "var(--color-text-muted)"
        : "var(--theme-accent-gold)";
  const pollingStatusText = () => {
    const presentation = footerStatusPresentation();

    return presentation.label === "live"
      ? presentation.detail
      : `${presentation.label}: ${presentation.detail}`;
  };
  const pollingTooltipId = "polling-tooltip";
  const settingsTooltipId = "settings-tooltip";
  const themeTooltipId = "theme-toggle-tooltip";
  const footerEdgeTooltipClass =
    "pointer-events-none invisible absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap border border-border-strong bg-panel px-3 py-2 font-sans text-[11px] text-text-primary opacity-0 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100";

  onMount(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;

      if (
        !shouldToggleThemeFromKeyboardEvent({
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          defaultPrevented: event.defaultPrevented,
          key: event.key,
          metaKey: event.metaKey,
          repeat: event.repeat,
          shiftKey: event.shiftKey,
          target,
        })
      ) {
        return;
      }

      event.preventDefault();
      actions.toggleTheme();
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <footer class="flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-panel px-3 py-1 text-xs text-text-secondary select-none">
      <div class="flex items-center gap-4">
        <div class="group relative flex items-center hover:text-text-primary">
          <div
            aria-describedby={pollingTooltipId}
            aria-label={pollingStatusText()}
            class="polling-ring"
            data-testid="polling-indicator"
            tabIndex={0}
            style={{
              "--polling-progress": `${footerStatusPresentation().progress}`,
              "--polling-ring-color": pollingRingColor(),
            }}
          />
          <div
            class="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 whitespace-nowrap border border-border-strong bg-panel px-3 py-2 font-sans text-[11px] text-text-primary opacity-0 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
            data-testid="polling-tooltip"
            id={pollingTooltipId}
            role="tooltip"
          >
            {pollingStatusText()}
          </div>
        </div>
        {rulesFooterLinkPresentation().href ? (
          <a
            aria-label={rulesFooterLinkPresentation().ariaLabel}
            class="flex items-center gap-1.5 cursor-pointer text-accent-gold hover:text-text-primary"
            data-testid="rules-footer-token"
            href={rulesFooterLinkPresentation().href}
            title={rulesFooterLinkPresentation().title}
          >
            <span>{rulesFooterLinkPresentation().label}</span>
          </a>
        ) : (
          <div
            class="flex items-center gap-1.5 cursor-pointer text-accent-gold hover:text-text-primary"
            data-testid="rules-footer-token"
          >
            <span>{rulesFooterLinkPresentation().label}</span>
          </div>
        )}
      </div>
      <div class="flex items-center gap-4">
        <div
          class="flex items-center gap-1.5 cursor-pointer text-accent-gold hover:text-text-primary"
          data-testid="alerts-count"
        >
          {workspaceSummary().unreadAlerts} alerts
        </div>
        <div class="group relative flex">
          <button
            aria-describedby={themeTooltipId}
            aria-label={themeTogglePresentation().ariaLabel}
            class="bg-transparent border-none cursor-pointer p-0 flex items-center justify-center text-text-secondary transition-colors hover:text-accent-gold focus-visible:outline-none focus-visible:text-accent-gold"
            data-testid="theme-toggle"
            onClick={actions.toggleTheme}
          >
            <Icon class="h-4 w-4" path={themeTogglePresentation().iconPath} />
          </button>
          <div
            class={footerEdgeTooltipClass}
            data-testid="theme-toggle-tooltip"
            id={themeTooltipId}
            role="tooltip"
          >
            {themeTogglePresentation().title}
          </div>
        </div>
        <div class="group relative flex">
          <a
            aria-describedby={settingsTooltipId}
            aria-label={
              location.pathname === "/settings"
                ? "Close settings"
                : "Open settings"
            }
            class="bg-transparent border-none cursor-pointer p-0 flex items-center justify-center text-text-secondary transition-colors hover:text-accent-gold focus-visible:outline-none focus-visible:text-accent-gold"
            data-testid="settings-link"
            href={location.pathname === "/settings" ? "/" : "/settings"}
          >
            <Icon class="h-4 w-4" path={cog} />
          </a>
          <div
            class={footerEdgeTooltipClass}
            data-testid="settings-tooltip"
            id={settingsTooltipId}
            role="tooltip"
          >
            {location.pathname === "/settings"
              ? "Close settings"
              : "Open settings"}
          </div>
        </div>
      </div>
    </footer>
  );
};

export const AppShell: ParentComponent = (props) => {
  return (
    <div class="flex h-full flex-col">
      <div class="flex min-h-0 flex-1 w-full overflow-hidden">
        {props.children}
      </div>
      <div class="relative shrink-0">
        <WorkerHealthToast />
        <StatusBar />
      </div>
    </div>
  );
};
