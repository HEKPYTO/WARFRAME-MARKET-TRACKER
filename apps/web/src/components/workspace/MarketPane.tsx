import { formatLocalDisplayTimestamp } from "@warframe-market-tracker/discord-alerts";
import { Icon } from "solid-heroicons";
import { shoppingCart } from "solid-heroicons/outline";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useDashboard } from "~/store/dashboard";
import { StatusIndicator } from "~/components/ui";
import { getMarketPaneEmptyState, getMarketPriceWarning } from "./presentation";
import { getRuleDisplayLabel, readRuleLabelCache } from "./rule-labels";

function getMarketItemUrl(itemSlug: string) {
  return `https://warframe.market/items/${itemSlug}`;
}

const DEFAULT_VISIBLE_MARKET_ROWS = 12;
const marketHeaderTooltipId = "market-header-tooltip";
const MARKET_ROW_LOAD_STEP = 12;
const WATCHLIST_RULE_DRAG_MIME = "application/x-warframe-tracker-rule-id";
const LOAD_MORE_BUTTON_CLASS =
  "mt-3 inline-flex self-start border border-accent-gold/70 bg-[rgba(194,150,60,0.14)] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-gold transition-colors hover:bg-[rgba(194,150,60,0.2)] hover:text-text-primary focus-visible:border-accent-gold focus-visible:bg-[rgba(194,150,60,0.22)] focus-visible:text-text-primary focus-visible:outline-none";
const SET_PART_TRACK_BUTTON_CLASS =
  "flex h-8 w-8 items-center justify-center rounded-sm border border-accent-gold bg-accent-gold px-0 font-mono text-[22px] leading-none text-[color:var(--theme-accent-gold-foreground)] transition-colors hover:border-[#d4b97a] hover:bg-[#d4b97a] focus-visible:border-[#d4b97a] focus-visible:bg-[#d4b97a] focus-visible:outline-none disabled:cursor-not-allowed disabled:border-border disabled:bg-transparent disabled:text-text-muted disabled:opacity-50";
const SET_PART_TRACK_TOOLTIP_CLASS =
  "pointer-events-none invisible absolute right-full top-1/2 z-20 mr-2 -translate-y-1/2 whitespace-nowrap border border-border-strong bg-panel px-2 py-1 font-sans text-[11px] text-text-primary opacity-0 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100";

export function MarketPane(props: { class?: string; compact?: boolean }) {
  const {
    actions,
    dashboard,
    draggedRuleId,
    selectedRuleId,
    setSelectedRuleId,
    workspace,
    workspaceSummary,
  } = useDashboard();
  const [dropDepth, setDropDepth] = createSignal(0);
  const [dropTargetRuleId, setDropTargetRuleId] = createSignal<string>();
  const [visibleOfflineOrderCount, setVisibleOfflineOrderCount] = createSignal(
    DEFAULT_VISIBLE_MARKET_ROWS,
  );
  const [visibleOnlineOrderCount, setVisibleOnlineOrderCount] = createSignal(
    DEFAULT_VISIBLE_MARKET_ROWS,
  );
  const [trackingSetPartSlug, setTrackingSetPartSlug] = createSignal<
    string | undefined
  >();
  const [setPartTrackError, setSetPartTrackError] = createSignal<string>();
  const [itemLabelsBySlug, setItemLabelsBySlug] = createSignal<
    Record<string, string>
  >(
    typeof window === "undefined"
      ? {}
      : readRuleLabelCache(window.sessionStorage),
  );
  let panelElement: HTMLElement | undefined;
  const emptyState = () =>
    getMarketPaneEmptyState(dashboard()?.rules.length ?? 0);
  const marketItemUrl = () => {
    const itemSlug = workspace()?.rule.itemSlug;
    return itemSlug ? getMarketItemUrl(itemSlug) : undefined;
  };
  const marketItemLabel = () => {
    const itemSlug = workspace()?.rule.itemSlug;
    return itemSlug ? getRuleDisplayLabel(itemSlug, itemLabelsBySlug()) : "";
  };
  const priceWarning = () =>
    workspace()
      ? getMarketPriceWarning(
          workspace()!.rule.maxPlatinum,
          workspace()!.marketTop.at(0)?.platinum ?? null,
        )
      : null;
  const isTrackedRuleId = (ruleId: string | undefined) =>
    !!ruleId && dashboard().rules.some((rule) => rule.id === ruleId);
  const hasTrackedRuleDragData = (event: DragEvent) =>
    !!draggedRuleId() ||
    Array.from(event.dataTransfer?.types ?? []).includes(
      WATCHLIST_RULE_DRAG_MIME,
    );
  const resolveDraggedRuleId = (event: DragEvent) => {
    const transferRuleId =
      event.dataTransfer?.getData(WATCHLIST_RULE_DRAG_MIME)?.trim() ||
      event.dataTransfer?.getData("text/plain")?.trim();
    const nextRuleId = transferRuleId || draggedRuleId();

    return isTrackedRuleId(nextRuleId) ? nextRuleId : undefined;
  };
  const isDropActive = () => dropDepth() > 0;
  const isDropTargetAlreadySelected = () =>
    dropTargetRuleId() !== undefined && dropTargetRuleId() === selectedRuleId();

  createEffect(() => {
    if (!draggedRuleId()) {
      setDropDepth(0);
      setDropTargetRuleId(undefined);
    }
  });

  createEffect(() => {
    if (!workspace()?.rule.id) {
      return;
    }

    setVisibleOnlineOrderCount(DEFAULT_VISIBLE_MARKET_ROWS);
    setVisibleOfflineOrderCount(DEFAULT_VISIBLE_MARKET_ROWS);
  });

  onMount(() => {
    if (typeof window === "undefined") {
      return;
    }

    setItemLabelsBySlug((current) => ({
      ...readRuleLabelCache(window.sessionStorage),
      ...current,
    }));
  });

  createEffect(() => {
    const element = panelElement;

    if (!element) {
      return;
    }

    const handleDragEnter = (event: DragEvent) => {
      if (!hasTrackedRuleDragData(event)) {
        return;
      }

      event.preventDefault();
      setDropDepth((current) => current + 1);
      setDropTargetRuleId(resolveDraggedRuleId(event));
    };

    const handleDragLeave = () => {
      setDropDepth((current) => {
        const nextDepth = Math.max(0, current - 1);

        if (nextDepth === 0) {
          setDropTargetRuleId(undefined);
        }

        return nextDepth;
      });
    };

    const handleDragOver = (event: DragEvent) => {
      if (!hasTrackedRuleDragData(event)) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
      setDropTargetRuleId(resolveDraggedRuleId(event));
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      const nextRuleId = resolveDraggedRuleId(event);

      setDropDepth(0);
      setDropTargetRuleId(undefined);

      if (!nextRuleId) {
        return;
      }

      if (nextRuleId !== selectedRuleId()) {
        setSelectedRuleId(nextRuleId);
      }
    };

    element.addEventListener("dragenter", handleDragEnter);
    element.addEventListener("dragleave", handleDragLeave);
    element.addEventListener("dragover", handleDragOver);
    element.addEventListener("drop", handleDrop);

    onCleanup(() => {
      element.removeEventListener("dragenter", handleDragEnter);
      element.removeEventListener("dragleave", handleDragLeave);
      element.removeEventListener("dragover", handleDragOver);
      element.removeEventListener("drop", handleDrop);
    });
  });

  const visibleOnlineOrders = () =>
    workspace()?.onlineOrders.slice(0, visibleOnlineOrderCount()) ?? [];
  const visibleOfflineOrders = () =>
    workspace()?.offlineOrders.slice(0, visibleOfflineOrderCount()) ?? [];
  const canLoadMoreOnlineOrders = () =>
    (workspace()?.onlineOrders.length ?? 0) > visibleOnlineOrderCount();
  const canLoadMoreOfflineOrders = () =>
    (workspace()?.offlineOrders.length ?? 0) > visibleOfflineOrderCount();
  const isTrackedItemSlug = (itemSlug: string) =>
    dashboard().rules.some((rule) => rule.itemSlug === itemSlug);
  const isTrackingSetPart = (itemSlug: string) =>
    trackingSetPartSlug() === itemSlug;
  const getSetPartTrackButtonLabel = (part: {
    estimatedPrice: number | null;
    itemSlug: string;
    name: string;
  }) => {
    if (part.estimatedPrice === null) {
      return "Estimate unavailable for this part";
    }

    if (isTrackedItemSlug(part.itemSlug)) {
      return "Already tracking this part";
    }

    if (isTrackingSetPart(part.itemSlug)) {
      return `Tracking ${part.name}`;
    }

    return `Track ${part.name} at ${part.estimatedPrice}p`;
  };

  async function handleTrackSetPart(part: {
    estimatedPrice: number | null;
    itemSlug: string;
    name: string;
  }) {
    if (
      part.estimatedPrice === null ||
      isTrackedItemSlug(part.itemSlug) ||
      isTrackingSetPart(part.itemSlug)
    ) {
      return;
    }

    setTrackingSetPartSlug(part.itemSlug);
    setSetPartTrackError(undefined);

    try {
      const preserveSelectedRuleId = workspace()?.rule.id;

      await actions.addRule(
        part.itemSlug,
        part.estimatedPrice,
        preserveSelectedRuleId ? { preserveSelectedRuleId } : undefined,
      );
    } catch (error) {
      setSetPartTrackError(
        error instanceof Error ? error.message : "Unable to track part",
      );
    } finally {
      setTrackingSetPartSlug(undefined);
    }
  }

  return (
    <main
      class={`relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-editor ${props.class ?? ""}`}
      data-testid="market-panel"
      ref={panelElement}
    >
      <Show when={isDropActive()}>
        <div
          class={`pointer-events-none absolute inset-0 z-20 border transition-colors ${isDropTargetAlreadySelected() ? "border-border-strong bg-black/5" : "border-accent-gold bg-[rgba(194,150,60,0.08)]"}`}
          data-testid="market-panel-drop-indicator"
        >
          <div class="absolute right-4 top-4 border border-border-strong bg-panel/95 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-text-primary shadow-[0_6px_20px_rgba(2,6,23,0.28)]">
            {isDropTargetAlreadySelected()
              ? "Already viewing this rule"
              : "Drop to open tracker"}
          </div>
        </div>
      </Show>
      <div
        class="flex h-9 shrink-0 items-center gap-4 border-b border-border px-4"
        data-testid="market-header"
      >
        <div class="flex min-w-0 items-center gap-2 font-mono text-xs leading-[15px] text-text-muted">
          <Show when={workspace()}>
            <div class="group relative flex min-w-0 items-center gap-2">
              <a
                class="min-w-0 truncate text-accent-gold transition-colors hover:underline hover:underline-offset-2 focus-visible:underline focus-visible:underline-offset-2 focus-visible:outline-none"
                aria-describedby={marketHeaderTooltipId}
                data-testid="market-header-item-link"
                href={marketItemUrl()}
                rel="noreferrer"
                target="_blank"
              >
                {marketItemLabel()}
              </a>
              <a
                aria-label={`Open ${marketItemLabel()} on Warframe Market`}
                aria-describedby={marketHeaderTooltipId}
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:text-accent-gold focus-visible:text-accent-gold focus-visible:outline-none"
                data-testid="market-header-link-button"
                href={marketItemUrl()}
                rel="noreferrer"
                target="_blank"
              >
                <Icon class="h-3.5 w-3.5" path={shoppingCart} />
              </a>
              <div
                class="pointer-events-none invisible absolute left-0 top-full z-20 mt-2 whitespace-nowrap border border-border-strong bg-panel px-3 py-2 font-sans text-[11px] text-text-primary opacity-0 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                data-testid="market-header-tooltip"
                id={marketHeaderTooltipId}
                role="tooltip"
              >
                Open this item on Warframe Market
              </div>
            </div>
          </Show>
        </div>
      </div>

      <Show
        fallback={
          <div class="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center font-mono text-sm text-text-muted">
            <span class="text-text-primary">{emptyState().title}</span>
            <span>{emptyState().body}</span>
          </div>
        }
        when={workspace()}
      >
        {(currentWorkspace) => (
          <div
            class={`flex flex-col gap-6 ${props.compact ? "px-4 py-4" : "px-8 py-6"}`}
          >
            <div
              class={`grid gap-5 ${props.compact ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-4"}`}
            >
              <div class="flex flex-col gap-1">
                <span class="text-[10px] font-semibold tracking-wider text-text-muted">
                  ONLINE NOW
                </span>
                <span class="font-mono text-2xl text-text-primary">
                  {workspaceSummary().onlineCount}
                </span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-[10px] font-semibold tracking-wider text-text-muted">
                  OFFLINE RESERVE
                </span>
                <span class="font-mono text-2xl text-text-primary">
                  {workspaceSummary().offlineCount}
                </span>
                <Show when={priceWarning()}>
                  {(warning) => (
                    <span
                      class="max-w-[18rem] text-[11px] leading-5 text-accent-gold"
                      data-testid="market-price-warning"
                    >
                      {warning()}
                    </span>
                  )}
                </Show>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-[10px] font-semibold tracking-wider text-text-muted">
                  TOP ASK
                </span>
                <span class="font-mono text-2xl text-text-primary">
                  {workspaceSummary().lowestVisiblePrice ?? "--"}p
                </span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="text-[10px] font-semibold tracking-wider text-text-muted">
                  THRESHOLD
                </span>
                <span class="font-mono text-2xl text-accent-teal">
                  {currentWorkspace().rule.maxPlatinum}p
                </span>
              </div>
            </div>

            <div
              class={`grid gap-8 ${props.compact ? "grid-cols-1" : "grid-cols-1 2xl:grid-cols-2"}`}
            >
              <div class="flex flex-col">
                <div class="mb-4 flex items-center gap-3">
                  <span class="text-sm font-medium text-accent-gold">
                    Online Sellers
                  </span>
                  <span class="rounded-sm bg-surface px-2 py-0.5 font-mono text-xs text-text-muted">
                    {currentWorkspace().onlineOrders.length}
                  </span>
                </div>
                <div class="flex flex-col overflow-hidden border border-border bg-surface">
                  <div
                    class="grid gap-4 border-b border-border bg-black/20 px-4 py-2.5 text-[11px] font-semibold uppercase text-text-muted"
                    style={{ "grid-template-columns": "2fr 1fr 1fr" }}
                  >
                    <span>Seller</span>
                    <span>Status</span>
                    <span class="text-right">Price</span>
                  </div>
                  <For each={visibleOnlineOrders()}>
                    {(order) => (
                      <div
                        class="grid gap-4 border-b border-border px-4 py-3 text-[13px] last:border-0 hover:bg-hover"
                        style={{ "grid-template-columns": "2fr 1fr 1fr" }}
                      >
                        <span class="flex items-center truncate font-mono">
                          {order.user.ingameName}
                        </span>
                        <span class="flex items-center gap-2 whitespace-nowrap text-text-secondary">
                          <StatusIndicator status={order.user.status} />{" "}
                          {order.user.status}
                        </span>
                        <span class="flex items-center justify-end font-mono text-accent-gold">
                          {order.platinum}p
                        </span>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={canLoadMoreOnlineOrders()}>
                  <button
                    class={LOAD_MORE_BUTTON_CLASS}
                    data-testid="market-online-load-more"
                    onClick={() =>
                      setVisibleOnlineOrderCount(
                        (current) => current + MARKET_ROW_LOAD_STEP,
                      )
                    }
                    type="button"
                  >
                    Load More Online Sellers
                  </button>
                </Show>
              </div>

              <div class="flex flex-col">
                <div class="mb-4 flex items-center gap-3">
                  <span class="text-sm font-medium text-accent-gold">
                    Top Market Context
                  </span>
                  <span class="rounded-sm bg-surface px-2 py-0.5 font-mono text-xs text-text-muted">
                    {currentWorkspace().marketTop.length}
                  </span>
                </div>
                <div class="flex flex-wrap gap-2">
                  <For each={currentWorkspace().marketTop}>
                    {(order) => (
                      <div class="flex items-center gap-2 border border-border bg-surface px-3 py-1.5">
                        <span class="font-mono text-xs text-text-primary">
                          {order.platinum}p
                        </span>
                        <span class="max-w-[120px] truncate text-xs text-text-muted">
                          {order.user.ingameName}
                        </span>
                      </div>
                    )}
                  </For>
                </div>

                <div class="mb-4 mt-8 flex items-center gap-3">
                  <span class="text-sm font-medium text-accent-gold">
                    Offline Reserves
                  </span>
                  <span class="rounded-sm bg-surface px-2 py-0.5 font-mono text-xs text-text-muted">
                    {currentWorkspace().offlineOrders.length}
                  </span>
                </div>
                <div class="flex flex-col overflow-hidden border border-border bg-surface">
                  <For each={visibleOfflineOrders()}>
                    {(order) => (
                      <div
                        class="grid gap-4 border-b border-border px-4 py-3 text-[13px] opacity-60 last:border-0 hover:bg-hover hover:opacity-100"
                        style={{ "grid-template-columns": "2fr 1fr 1fr" }}
                      >
                        <span class="flex items-center truncate">
                          {order.user.ingameName}
                        </span>
                        <span class="flex items-center whitespace-nowrap text-[11px] text-text-muted">
                          {formatLocalDisplayTimestamp(order.user.lastSeen)}
                        </span>
                        <span class="flex items-center justify-end font-mono text-accent-gold">
                          {order.platinum}p
                        </span>
                      </div>
                    )}
                  </For>
                </div>
                <Show when={canLoadMoreOfflineOrders()}>
                  <button
                    class={LOAD_MORE_BUTTON_CLASS}
                    data-testid="market-offline-load-more"
                    onClick={() =>
                      setVisibleOfflineOrderCount(
                        (current) => current + MARKET_ROW_LOAD_STEP,
                      )
                    }
                    type="button"
                  >
                    Load More Offline Reserves
                  </button>
                </Show>

                <Show when={currentWorkspace().setPricing}>
                  {(currentSetPricing) => (
                    <>
                      <div class="mb-4 mt-8 flex items-center gap-3">
                        <span class="text-sm font-medium text-accent-gold">
                          Set Part Estimates
                        </span>
                        <span class="rounded-sm bg-surface px-2 py-0.5 font-mono text-xs text-text-muted">
                          {currentSetPricing().parts.length}
                        </span>
                      </div>
                      <div class="mb-4 grid grid-cols-2 gap-4">
                        <div class="flex flex-col gap-1 border border-border bg-surface px-4 py-3">
                          <span class="text-[10px] font-semibold tracking-wider text-text-muted">
                            TOTAL ESTIMATE
                          </span>
                          <span class="font-mono text-xl text-text-primary">
                            {currentSetPricing().totalEstimatedPrice === null
                              ? "--"
                              : `${currentSetPricing().totalEstimatedPrice}p`}
                          </span>
                        </div>
                        <div class="flex flex-col gap-1 border border-border bg-surface px-4 py-3">
                          <span class="text-[10px] font-semibold tracking-wider text-text-muted">
                            TOTAL VARIANCE
                          </span>
                          <span class="font-mono text-xl text-text-primary">
                            {currentSetPricing().totalVariance === null
                              ? "--"
                              : `${currentSetPricing().totalVariance}p`}
                          </span>
                        </div>
                      </div>
                      <div class="flex flex-col overflow-hidden border border-border bg-surface">
                        <div
                          class="grid gap-4 border-b border-border bg-black/20 px-4 py-2.5 text-[11px] font-semibold uppercase text-text-muted"
                          style={{
                            "grid-template-columns":
                              "minmax(0,2fr) minmax(72px,1fr) minmax(72px,1fr) 56px",
                          }}
                        >
                          <span>Part</span>
                          <span class="text-right">Estimate</span>
                          <span class="text-right">Variance</span>
                          <span class="text-center">Track</span>
                        </div>
                        <For each={currentSetPricing().parts}>
                          {(part) => (
                            <div
                              class="grid items-center gap-4 border-b border-border px-4 py-[6px] text-[13px] last:border-0 hover:bg-hover"
                              data-testid={`set-part-row-${part.itemSlug}`}
                              style={{
                                "grid-template-columns":
                                  "minmax(0,2fr) minmax(72px,1fr) minmax(72px,1fr) 56px",
                              }}
                            >
                              <div class="flex min-w-0 items-center gap-2">
                                <a
                                  class="truncate text-text-primary hover:text-accent-gold hover:underline"
                                  data-testid={`set-part-link-${part.itemSlug}`}
                                  href={getMarketItemUrl(part.itemSlug)}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {part.name}
                                </a>
                                <a
                                  aria-label={`Open ${part.name} on Warframe Market`}
                                  class="shrink-0 text-text-muted hover:text-accent-gold"
                                  data-testid={`set-part-market-link-${part.itemSlug}`}
                                  href={getMarketItemUrl(part.itemSlug)}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <Icon
                                    class="h-3.5 w-3.5"
                                    path={shoppingCart}
                                  />
                                </a>
                              </div>
                              <span class="text-right font-mono text-accent-gold">
                                {part.estimatedPrice === null
                                  ? "--"
                                  : `${part.estimatedPrice}p`}
                              </span>
                              <span class="text-right font-mono text-text-muted">
                                {part.variance === null
                                  ? "--"
                                  : `${part.variance}p`}
                              </span>
                              <div class="group relative flex w-8 justify-center justify-self-center">
                                <button
                                  aria-describedby={`set-part-track-tooltip-${part.itemSlug}`}
                                  aria-label={getSetPartTrackButtonLabel(part)}
                                  class={`${SET_PART_TRACK_BUTTON_CLASS} mx-auto`}
                                  data-testid={`set-part-track-${part.itemSlug}`}
                                  disabled={
                                    part.estimatedPrice === null ||
                                    isTrackedItemSlug(part.itemSlug) ||
                                    isTrackingSetPart(part.itemSlug)
                                  }
                                  onClick={() => void handleTrackSetPart(part)}
                                  type="button"
                                >
                                  +
                                </button>
                                <div
                                  class={SET_PART_TRACK_TOOLTIP_CLASS}
                                  data-testid={`set-part-track-tooltip-${part.itemSlug}`}
                                  id={`set-part-track-tooltip-${part.itemSlug}`}
                                  role="tooltip"
                                >
                                  {getSetPartTrackButtonLabel(part)}
                                </div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                      <Show when={setPartTrackError()}>
                        {(message) => (
                          <p
                            class="mt-3 text-xs text-accent-gold"
                            data-testid="set-part-track-error"
                          >
                            {message()}
                          </p>
                        )}
                      </Show>
                    </>
                  )}
                </Show>
              </div>
            </div>
          </div>
        )}
      </Show>
    </main>
  );
}
