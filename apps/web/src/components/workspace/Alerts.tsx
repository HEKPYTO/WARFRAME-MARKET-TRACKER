import {
  buildTradeMessage,
  formatLocalDisplayTimestamp,
} from "@warframe-market-tracker/discord-alerts";
import { Icon } from "solid-heroicons";
import {
  chevronDown,
  documentDuplicate,
  informationCircle,
  shoppingCart,
  trash,
  xMark,
} from "solid-heroicons/outline";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { PanelFrame } from "~/components/ui";
import { useDashboard } from "~/store/dashboard";
import { getAlertDisplayLabel } from "./alert-labels";
import { getAlertsEmptyState } from "./presentation";
import { readRuleLabelCache } from "./rule-labels";

function getMarketItemUrl(itemSlug: string) {
  return `https://warframe.market/items/${itemSlug}`;
}

const ALERT_ACTION_TOOLTIP_CLASS =
  "pointer-events-none invisible absolute bottom-full right-0 z-20 mb-2 whitespace-nowrap border border-border-strong bg-panel px-2 py-1 font-sans text-[11px] text-text-primary opacity-0 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100";

export function Alerts(props: {
  class?: string;
  onRequestClose?: () => void;
  onPaneHeaderClick?: () => void;
  paneHeaderAriaLabel?: string;
  paneHeaderTestId?: string;
}) {
  const { dashboard, actions, setSelectedRuleId } = useDashboard();
  const [alertsCollapsed, setAlertsCollapsed] = createSignal(false);
  const [busyAlertId, setBusyAlertId] = createSignal<string>();
  const [clearingAllAlerts, setClearingAllAlerts] = createSignal(false);
  const [feedbackMessage, setFeedbackMessage] = createSignal<{
    tone: "error" | "success";
    text: string;
  }>();
  const [itemLabelsBySlug, setItemLabelsBySlug] = createSignal<
    Record<string, string>
  >({});
  const [collapseStateBootstrapped, setCollapseStateBootstrapped] =
    createSignal(false);
  const emptyState = () => getAlertsEmptyState(dashboard()?.rules.length ?? 0);

  onMount(() => {
    if (typeof window === "undefined") return;

    const storedState = localStorage.getItem("wmt-alerts-collapsed");
    if (storedState === "true") {
      setAlertsCollapsed(true);
    }

    setItemLabelsBySlug(readRuleLabelCache(window.sessionStorage));
    setCollapseStateBootstrapped(true);
  });

  createEffect(() => {
    if (!collapseStateBootstrapped() || typeof window === "undefined") return;

    localStorage.setItem("wmt-alerts-collapsed", String(alertsCollapsed()));
  });

  function handleAlertView(ruleId: string) {
    setSelectedRuleId(ruleId);
    props.onRequestClose?.();
  }

  async function handleAlertDelete(alertId: string) {
    setBusyAlertId(alertId);

    try {
      await actions.removeAlert(alertId);
      setFeedbackMessage(undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete alert";
      setFeedbackMessage({
        text: message,
        tone: "error",
      });
    } finally {
      setBusyAlertId(undefined);
    }
  }

  async function handleClearAllAlerts() {
    setClearingAllAlerts(true);

    try {
      await actions.clearAlerts();
      setFeedbackMessage(undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to clear alerts";
      setFeedbackMessage({
        text: message,
        tone: "error",
      });
    } finally {
      setClearingAllAlerts(false);
    }
  }

  async function handleCopyTradeMessage(alert: {
    itemSlug: string;
    platinum: number;
    sellerName: string;
  }) {
    try {
      if (
        typeof navigator === "undefined" ||
        typeof navigator.clipboard?.writeText !== "function"
      ) {
        throw new Error("Clipboard access is unavailable");
      }

      await navigator.clipboard.writeText(
        buildTradeMessage({
          itemSlug: alert.itemSlug,
          platinum: alert.platinum,
          sellerName: alert.sellerName,
        }),
      );
      setFeedbackMessage({
        text: "Trade message copied.",
        tone: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to copy trade message";
      setFeedbackMessage({
        text: message,
        tone: "error",
      });
    }
  }

  return (
    <PanelFrame
      actions={
        props.onRequestClose ? (
          <div class="flex items-center gap-1">
            <Show when={props.onRequestClose}>
              <button
                aria-label="Close alerts panel"
                class="flex h-6 w-6 items-center justify-center bg-transparent text-text-secondary transition-colors hover:text-text-primary"
                onClick={() => props.onRequestClose?.()}
                type="button"
              >
                <Icon class="h-4 w-4" path={xMark} />
              </button>
            </Show>
          </div>
        ) : undefined
      }
      bodyClass="flex min-h-0 flex-col"
      class={props.class}
      eyebrow="outline"
      headerAriaLabel={props.paneHeaderAriaLabel}
      headerTestId={props.paneHeaderTestId}
      onHeaderClick={props.onPaneHeaderClick}
    >
      <div
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
        data-testid="alerts-panel"
      >
        <div class="flex items-center justify-between gap-3 px-4 py-2">
          <button
            aria-expanded={!alertsCollapsed()}
            class="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted transition-colors hover:text-text-primary"
            data-testid="alerts-section-toggle"
            onClick={() => setAlertsCollapsed((collapsed) => !collapsed)}
            type="button"
          >
            <Icon
              class={`h-3.5 w-3.5 transition-transform ${alertsCollapsed() ? "-rotate-90" : "rotate-0"}`}
              path={chevronDown}
            />
            <span>Active Alerts</span>
          </button>
          <Show when={(dashboard()?.alerts ?? []).length > 0}>
            <button
              class="font-mono text-[10px] uppercase tracking-wide text-text-muted transition-colors hover:text-accent-danger disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="alerts-clear-all"
              disabled={clearingAllAlerts() || busyAlertId() !== undefined}
              onClick={() => void handleClearAllAlerts()}
              type="button"
            >
              Clear all
            </button>
          </Show>
        </div>

        <div class={`flex flex-col ${alertsCollapsed() ? "hidden" : ""}`}>
          <For each={dashboard()?.alerts ?? []}>
            {(alert) => {
              const alertLabel = getAlertDisplayLabel(
                alert.itemSlug,
                itemLabelsBySlug(),
              );
              const copyTooltipId = `alert-copy-tooltip-${alert.id}`;
              const viewTooltipId = `alert-view-tooltip-${alert.id}`;
              const marketTooltipId = `alert-market-tooltip-${alert.id}`;
              const deleteTooltipId = `alert-delete-tooltip-${alert.id}`;

              return (
                <div
                  class={`flex flex-col gap-1.5 border-b border-border px-4 py-3 ${alert.readAt ? "opacity-60" : "bg-[rgba(101,213,203,0.05)] border-l-2 border-l-accent-teal"}`}
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate font-medium text-[13px] text-accent-gold">
                      {alertLabel}
                    </span>
                    <span class="font-mono text-xs text-text-primary">
                      {alert.platinum}p
                    </span>
                  </div>
                  <div class="text-xs leading-relaxed text-text-secondary">
                    <span class="text-text-primary">{alert.sellerName}</span> is{" "}
                    {alert.status}
                  </div>
                  <div class="mt-1 flex items-center justify-between gap-3">
                    <span class="font-mono text-[11px] text-text-muted">
                      {formatLocalDisplayTimestamp(alert.observedAt)}
                    </span>
                    <div class="flex items-center gap-1.5">
                      <div class="group relative flex">
                        <button
                          aria-describedby={viewTooltipId}
                          aria-label={`View ${alertLabel} in dashboard`}
                          class="flex h-5 w-5 items-center justify-center border border-border bg-transparent text-text-muted transition-colors hover:border-accent-teal hover:text-accent-teal disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid={`alert-view-${alert.id}`}
                          disabled={
                            clearingAllAlerts() || busyAlertId() === alert.id
                          }
                          onClick={() => handleAlertView(alert.ruleId)}
                          type="button"
                        >
                          <Icon class="h-3 w-3" path={informationCircle} />
                        </button>
                        <div
                          class={ALERT_ACTION_TOOLTIP_CLASS}
                          data-testid={viewTooltipId}
                          id={viewTooltipId}
                          role="tooltip"
                        >
                          View item in dashboard
                        </div>
                      </div>
                      <div class="group relative flex">
                        <a
                          aria-describedby={marketTooltipId}
                          aria-label={`Open ${alertLabel} on Warframe Market`}
                          class={`flex h-5 w-5 items-center justify-center border border-border bg-transparent text-text-muted transition-colors hover:border-accent-gold hover:text-accent-gold ${clearingAllAlerts() || busyAlertId() === alert.id ? "pointer-events-none opacity-50" : ""}`}
                          data-testid={`alert-market-${alert.id}`}
                          href={getMarketItemUrl(alert.itemSlug)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Icon class="h-3 w-3" path={shoppingCart} />
                        </a>
                        <div
                          class={ALERT_ACTION_TOOLTIP_CLASS}
                          data-testid={marketTooltipId}
                          id={marketTooltipId}
                          role="tooltip"
                        >
                          Open item on Warframe Market
                        </div>
                      </div>
                      <div class="group relative flex">
                        <button
                          aria-describedby={copyTooltipId}
                          aria-label={`Copy trade message for ${alertLabel}`}
                          class="flex h-5 w-5 items-center justify-center border border-border bg-transparent text-text-muted transition-colors hover:border-accent-teal hover:text-accent-teal disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid={`alert-copy-${alert.id}`}
                          disabled={
                            clearingAllAlerts() || busyAlertId() === alert.id
                          }
                          onClick={() =>
                            void handleCopyTradeMessage({
                              itemSlug: alert.itemSlug,
                              platinum: alert.platinum,
                              sellerName: alert.sellerName,
                            })
                          }
                          type="button"
                        >
                          <Icon class="h-3 w-3" path={documentDuplicate} />
                        </button>
                        <div
                          class={ALERT_ACTION_TOOLTIP_CLASS}
                          data-testid={copyTooltipId}
                          id={copyTooltipId}
                          role="tooltip"
                        >
                          Copy trade message
                        </div>
                      </div>
                      <div class="group relative flex">
                        <button
                          aria-describedby={deleteTooltipId}
                          aria-label={`Delete ${alertLabel} alert`}
                          class="flex h-5 w-5 items-center justify-center border border-border bg-transparent text-text-muted transition-colors hover:border-accent-danger hover:text-accent-danger disabled:cursor-not-allowed disabled:opacity-50"
                          data-testid={`alert-remove-${alert.id}`}
                          disabled={
                            clearingAllAlerts() || busyAlertId() === alert.id
                          }
                          onClick={() => void handleAlertDelete(alert.id)}
                          type="button"
                        >
                          <Icon class="h-3 w-3" path={trash} />
                        </button>
                        <div
                          class={ALERT_ACTION_TOOLTIP_CLASS}
                          data-testid={deleteTooltipId}
                          id={deleteTooltipId}
                          role="tooltip"
                        >
                          Delete alert
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
          <Show when={feedbackMessage()}>
            <p
              class={`px-4 py-2 text-[11px] ${feedbackMessage()?.tone === "error" ? "text-red-400" : "text-accent-teal"}`}
              role="alert"
            >
              {feedbackMessage()?.text}
            </p>
          </Show>
          <Show when={(dashboard()?.alerts ?? []).length === 0}>
            <div class="px-4 py-6 text-center font-mono text-xs text-text-muted">
              <div class="flex flex-col gap-2">
                <span class="text-text-primary">{emptyState().title}</span>
                <span>{emptyState().body}</span>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </PanelFrame>
  );
}
