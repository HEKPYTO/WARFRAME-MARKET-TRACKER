import { useLocation, useNavigate } from "@solidjs/router";
import { Icon } from "solid-heroicons";
import {
  check,
  chevronDown,
  pause,
  play,
  xMark,
} from "solid-heroicons/outline";
import {
  createEffect,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { useDashboard } from "~/store/dashboard";
import { ConfirmDialog, Input, PanelFrame } from "~/components/ui";
import { searchItems, type ItemSuggestion } from "~/lib/api";
import { createDebouncedTask } from "~/lib/debounced-task";
import { normalizeItemSearchValue } from "~/lib/item-search";
import { getWatchlistSubmitPresentation } from "./presentation";
import {
  getRuleDisplayLabel,
  persistRuleLabelCache,
  readRuleLabelCache,
} from "./rule-labels";
import { getWatchlistEyebrowPresentation } from "./watchlist-eyebrow";
import { getWatchlistRuleById, getWatchlistRuleIds } from "./watchlist-rules";

const ITEM_SEARCH_RESULT_LIMIT = 8;
const ITEM_SEARCH_DEBOUNCE_MS = 150;
const WATCHLIST_RULE_DRAG_MIME = "application/x-warframe-tracker-rule-id";
const WATCHLIST_ACTION_TOOLTIP_CLASS =
  "pointer-events-none invisible absolute right-0 top-full z-50 mt-2 whitespace-nowrap border border-border-strong bg-panel px-2 py-1 font-sans text-[11px] text-text-primary opacity-0 shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100";

function reorderRuleIds(ruleIds: string[], sourceId: string, targetId: string) {
  const sourceIndex = ruleIds.indexOf(sourceId);
  const targetIndex = ruleIds.indexOf(targetId);

  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return ruleIds;
  }

  const nextRuleIds = [...ruleIds];
  const [movedRuleId] = nextRuleIds.splice(sourceIndex, 1);

  if (!movedRuleId) {
    return ruleIds;
  }

  nextRuleIds.splice(targetIndex, 0, movedRuleId);
  return nextRuleIds;
}

function isExactItemMatch(item: ItemSuggestion, value: string) {
  const normalizedValue = normalizeItemSearchValue(value);

  return (
    normalizeItemSearchValue(item.name) === normalizedValue ||
    normalizeItemSearchValue(item.slug) === normalizedValue
  );
}

function getSuggestionHighlight(itemName: string, query: string) {
  const normalizedTokens = normalizeItemSearchValue(query)
    .split(" ")
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  const token = normalizedTokens[0];

  if (!token) {
    return {
      after: "",
      before: itemName,
      match: "",
    };
  }

  const matchIndex = itemName.toLowerCase().indexOf(token.toLowerCase());

  if (matchIndex < 0) {
    return {
      after: "",
      before: itemName,
      match: "",
    };
  }

  return {
    after: itemName.slice(matchIndex + token.length),
    before: itemName.slice(0, matchIndex),
    match: itemName.slice(matchIndex, matchIndex + token.length),
  };
}

function sanitizeNumericInput(value: string) {
  return value.replace(/\D+/g, "");
}

function insertSanitizedNumericText(
  input: HTMLInputElement,
  text: string | null | undefined,
) {
  const sanitizedText = sanitizeNumericInput(text ?? "");

  if (sanitizedText.length === 0) {
    return;
  }

  const currentValue = input.value;
  const selectionStart = input.selectionStart ?? currentValue.length;
  const selectionEnd = input.selectionEnd ?? currentValue.length;
  const nextValue =
    currentValue.slice(0, selectionStart) +
    sanitizedText +
    currentValue.slice(selectionEnd);
  const nextSelection = selectionStart + sanitizedText.length;

  input.value = nextValue;
  input.setSelectionRange(nextSelection, nextSelection);
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function handleNumericBeforeInput(
  event: InputEvent & {
    currentTarget: HTMLInputElement;
    data: string | null;
    inputType: string;
  },
) {
  if (
    event.isComposing ||
    event.inputType.startsWith("delete") ||
    event.inputType.startsWith("history") ||
    event.inputType === "insertFromPaste" ||
    event.inputType === "insertFromDrop"
  ) {
    return;
  }

  if (event.data === null || /^\d+$/.test(event.data)) {
    return;
  }

  event.preventDefault();
  insertSanitizedNumericText(event.currentTarget, event.data);
}

function handleNumericPaste(
  event: ClipboardEvent & {
    currentTarget: HTMLInputElement;
  },
) {
  event.preventDefault();
  insertSanitizedNumericText(
    event.currentTarget,
    event.clipboardData?.getData("text"),
  );
}

function handleNumericDrop(
  event: DragEvent & {
    currentTarget: HTMLInputElement;
  },
) {
  event.preventDefault();
  insertSanitizedNumericText(
    event.currentTarget,
    event.dataTransfer?.getData("text"),
  );
}

export function Watchlist(props: {
  class?: string;
  onRequestClose?: () => void;
  onPaneHeaderClick?: () => void;
  paneHeaderAriaLabel?: string;
  paneHeaderTestId?: string;
}) {
  const watchlistEyebrow = getWatchlistEyebrowPresentation();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    dashboard,
    draggedRuleId,
    runtimeConfig,
    selectedRuleId,
    setDraggedRuleId,
    setSelectedRuleId,
    actions,
  } = useDashboard();
  const [itemQuery, setItemQuery] = createSignal("");
  const [maxPlatinum, setMaxPlatinum] = createSignal("");
  const [errorMessage, setErrorMessage] = createSignal<string>();
  const [rulesCollapsed, setRulesCollapsed] = createSignal(false);
  const [rulePendingRemoval, setRulePendingRemoval] = createSignal<{
    id: string;
    itemSlug: string;
  }>();
  const [removingRuleId, setRemovingRuleId] = createSignal<string>();
  const [submitting, setSubmitting] = createSignal(false);
  const [editingRuleId, setEditingRuleId] = createSignal<string>();
  const [editingMaxPlatinum, setEditingMaxPlatinum] = createSignal("");
  const [savingRuleId, setSavingRuleId] = createSignal<string>();
  const [dragTargetRuleId, setDragTargetRuleId] = createSignal<string>();
  const [itemSuggestions, setItemSuggestions] = createSignal<ItemSuggestion[]>(
    [],
  );
  const [selectedItem, setSelectedItem] = createSignal<ItemSuggestion>();
  const [itemSearchLoading, setItemSearchLoading] = createSignal(false);
  const [isSuggestionListOpen, setIsSuggestionListOpen] = createSignal(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = createSignal(-1);
  const [itemLabelsBySlug, setItemLabelsBySlug] = createSignal<
    Record<string, string>
  >({});
  const [pauseTooltipDismissed, setPauseTooltipDismissed] = createSignal(false);
  const [collapseStateBootstrapped, setCollapseStateBootstrapped] =
    createSignal(false);
  const submitPresentation = () => getWatchlistSubmitPresentation(submitting());
  const resolvingRuleLabelSlugs = new Set<string>();
  let itemSearchRequestId = 0;

  const SortableRuleRow = (ruleProps: { ruleId: string }) => {
    const rule = () =>
      getWatchlistRuleById(dashboard().rules, ruleProps.ruleId);
    const ruleId = () => ruleProps.ruleId;
    const ruleIsTemporary = () => ruleId().startsWith("temp-rule-");
    const isDragging = () => draggedRuleId() === ruleId();
    const isDropTarget = () =>
      dragTargetRuleId() === ruleId() && draggedRuleId() !== ruleId();

    function handleRuleSelection() {
      setSelectedRuleId(ruleId());
      props.onRequestClose?.();

      if (location.pathname === "/settings") {
        void navigate("/");
      }
    }

    return (
      <Show when={rule()}>
        {(currentRule) => (
          <div
            class={`transition-colors hover:bg-hover hover:text-text-primary ${selectedRuleId() === ruleId() ? "bg-active text-accent-gold" : "text-text-secondary"} ${isDragging() ? "opacity-70" : ""} ${isDropTarget() ? "bg-hover" : ""}`}
            data-rule-slug={currentRule().itemSlug}
            onDragOver={(e) => {
              const sourceRuleId = draggedRuleId();

              if (!sourceRuleId || sourceRuleId === ruleId()) {
                return;
              }

              e.preventDefault();
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "move";
              }
              setDragTargetRuleId(ruleId);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sourceRuleId =
                e.dataTransfer?.getData(WATCHLIST_RULE_DRAG_MIME) ||
                e.dataTransfer?.getData("text/plain") ||
                draggedRuleId();

              if (!sourceRuleId || sourceRuleId === ruleId()) {
                setDraggedRuleId(undefined);
                setDragTargetRuleId(undefined);
                return;
              }

              commitRuleReorder(sourceRuleId, ruleId());
            }}
            onClick={handleRuleSelection}
          >
            <div
              class="grid items-center gap-3 px-4 py-1.5 text-[13px]"
              data-testid={`watchlist-rule-row-${ruleId()}`}
              style={{
                "grid-template-columns": "1rem minmax(0,1fr) auto",
              }}
            >
              <div
                class={`col-span-2 flex min-w-0 items-center gap-3 pl-[3px] ${ruleIsTemporary() ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}`}
                data-testid={`watchlist-rule-drag-surface-${ruleId()}`}
                draggable={!ruleIsTemporary()}
                onDragEnd={() => {
                  setDraggedRuleId(undefined);
                  setDragTargetRuleId(undefined);
                }}
                onDragStart={(e) => {
                  if (ruleIsTemporary()) {
                    e.preventDefault();
                    return;
                  }

                  if (e.dataTransfer) {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(WATCHLIST_RULE_DRAG_MIME, ruleId());
                    e.dataTransfer.setData("text/plain", ruleId());
                  }

                  setDraggedRuleId(ruleId());
                  setDragTargetRuleId(ruleId());
                }}
              >
                <div class="flex h-full items-center justify-center">
                  <span
                    aria-label={
                      runtimeConfig().trackingPaused && currentRule().enabled
                        ? "Tracking paused globally"
                        : currentRule().enabled
                          ? "Rule enabled"
                          : "Rule disabled"
                    }
                    class={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      runtimeConfig().trackingPaused && currentRule().enabled
                        ? "bg-text-muted"
                        : currentRule().enabled
                          ? "bg-accent-teal shadow-[0_0_8px_var(--color-accent-teal)]"
                          : "bg-text-muted opacity-50"
                    }`}
                    data-testid={`watchlist-rule-status-${ruleId()}`}
                    title={
                      runtimeConfig().trackingPaused && currentRule().enabled
                        ? "Tracking paused globally"
                        : currentRule().enabled
                          ? "Rule enabled"
                          : "Rule disabled"
                    }
                  />
                </div>
                <span
                  class="min-w-0 truncate"
                  title={`${getRuleLabel(currentRule().itemSlug)} (${currentRule().itemSlug})`}
                >
                  {getRuleLabel(currentRule().itemSlug)}
                </span>
              </div>
              <div
                class="relative z-10 ml-3 flex items-center justify-end gap-2"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <Show
                  fallback={
                    <Show
                      fallback={
                        <button
                          class="font-mono text-[11px] text-text-muted transition-colors hover:text-accent-gold"
                          data-testid={`rule-threshold-edit-${ruleId()}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingRuleId(ruleId());
                            setEditingMaxPlatinum(
                              String(currentRule().maxPlatinum),
                            );
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                          title="Edit threshold"
                          type="button"
                        >
                          ≤ {currentRule().maxPlatinum}p
                        </button>
                      }
                      when={ruleIsTemporary()}
                    >
                      <span class="font-mono text-[11px] text-text-muted">
                        ≤ {currentRule().maxPlatinum}p
                      </span>
                    </Show>
                  }
                  when={editingRuleId() === ruleId()}
                >
                  <form
                    class="flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleUpdateRulePrice(ruleId());
                    }}
                  >
                    <input
                      class="w-12 rounded-sm border border-border bg-surface px-1.5 py-1 font-mono text-[11px] text-text-primary outline-none focus:border-accent-gold"
                      data-testid={`rule-threshold-input-${ruleId()}`}
                      inputMode="numeric"
                      onBeforeInput={handleNumericBeforeInput}
                      onClick={(e) => e.stopPropagation()}
                      onDrop={handleNumericDrop}
                      onPaste={handleNumericPaste}
                      onPointerDown={(e) => e.stopPropagation()}
                      onInput={(e) =>
                        setEditingMaxPlatinum(
                          sanitizeNumericInput(e.currentTarget.value),
                        )
                      }
                      pattern="[0-9]*"
                      value={editingMaxPlatinum()}
                    />
                    <button
                      class="flex h-5 w-5 items-center justify-center border border-border bg-transparent text-text-muted transition-colors hover:border-accent-teal hover:text-accent-teal disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid={`rule-threshold-save-${ruleId()}`}
                      disabled={savingRuleId() === ruleId()}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Save threshold"
                      type="submit"
                    >
                      <Icon class="h-3 w-3" path={check} />
                    </button>
                    <button
                      class="flex h-5 w-5 items-center justify-center border border-border bg-transparent text-text-muted transition-colors hover:border-text-primary hover:text-text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingRuleId(undefined);
                        setEditingMaxPlatinum("");
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      title="Cancel threshold edit"
                      type="button"
                    >
                      <Icon class="h-3 w-3" path={xMark} />
                    </button>
                  </form>
                </Show>
                <button
                  aria-label={`Remove rule ${getRuleLabel(currentRule().itemSlug)}`}
                  class="flex h-8 w-8 items-center justify-center bg-transparent text-text-muted transition-colors hover:text-accent-danger focus-visible:outline-none focus-visible:text-accent-danger"
                  data-testid={`rule-remove-${ruleId()}`}
                  disabled={ruleIsTemporary()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (ruleIsTemporary()) {
                      return;
                    }

                    setRulePendingRemoval({
                      id: ruleId(),
                      itemSlug: currentRule().itemSlug,
                    });
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  title={ruleIsTemporary() ? "Creating rule" : "Remove rule"}
                  type="button"
                >
                  <Icon class="h-3.5 w-3.5" path={xMark} />
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    );
  };

  function seedItemLabels(items: ItemSuggestion[]) {
    if (items.length === 0) {
      return;
    }

    setItemLabelsBySlug((current) => {
      let changed = false;
      const next = { ...current };

      for (const item of items) {
        if (next[item.slug] !== item.name) {
          next[item.slug] = item.name;
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }

  function getRuleLabel(itemSlug: string) {
    return getRuleDisplayLabel(itemSlug, itemLabelsBySlug());
  }

  function clearSuggestions() {
    setItemSuggestions([]);
    setIsSuggestionListOpen(false);
    setActiveSuggestionIndex(-1);
    setItemSearchLoading(false);
  }

  function selectItemSuggestion(item: ItemSuggestion) {
    seedItemLabels([item]);
    setSelectedItem(item);
    setItemQuery(item.name);
    setErrorMessage(undefined);
    clearSuggestions();
  }

  async function loadItemSuggestions(query: string) {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      clearSuggestions();
      return;
    }

    const requestId = ++itemSearchRequestId;
    setItemSearchLoading(true);
    setIsSuggestionListOpen(true);

    try {
      const nextSuggestions = await searchItems(
        trimmedQuery,
        ITEM_SEARCH_RESULT_LIMIT,
      );

      if (requestId !== itemSearchRequestId) {
        return;
      }

      seedItemLabels(nextSuggestions);
      setItemSuggestions(nextSuggestions);
      setActiveSuggestionIndex(-1);
    } catch {
      if (requestId !== itemSearchRequestId) {
        return;
      }

      setItemSuggestions([]);
    } finally {
      if (requestId === itemSearchRequestId) {
        setItemSearchLoading(false);
      }
    }
  }

  const debouncedItemSuggestionLoader = createDebouncedTask<[string]>({
    delayMs: ITEM_SEARCH_DEBOUNCE_MS,
    run: (query) => loadItemSuggestions(query),
  });

  onCleanup(() => {
    debouncedItemSuggestionLoader.dispose();
  });

  async function resolveItemSelection(value: string) {
    const currentSelection = selectedItem();
    if (currentSelection && isExactItemMatch(currentSelection, value)) {
      return currentSelection;
    }

    const suggestionMatch = itemSuggestions().find((item) =>
      isExactItemMatch(item, value),
    );

    if (suggestionMatch) {
      return suggestionMatch;
    }

    if (value.trim().length < 2) {
      return null;
    }

    try {
      const exactMatches = await searchItems(value, 1);
      const exactMatch =
        exactMatches.find((item) => isExactItemMatch(item, value)) ?? null;

      if (exactMatch) {
        seedItemLabels([exactMatch]);
      }

      return exactMatch;
    } catch {
      return null;
    }
  }

  onMount(() => {
    if (typeof window === "undefined") return;

    const storedState = localStorage.getItem("wmt-watchlist-collapsed");
    if (storedState === "true") {
      setRulesCollapsed(true);
    }

    setItemLabelsBySlug((current) => ({
      ...readRuleLabelCache(window.sessionStorage),
      ...current,
    }));
    setCollapseStateBootstrapped(true);
  });

  createEffect(() => {
    if (!collapseStateBootstrapped() || typeof window === "undefined") return;

    localStorage.setItem("wmt-watchlist-collapsed", String(rulesCollapsed()));
  });

  createEffect(() => {
    if (typeof window === "undefined") return;

    persistRuleLabelCache(window.sessionStorage, itemLabelsBySlug());
  });

  createEffect(() => {
    const unresolvedSlugs = [
      ...new Set(dashboard().rules.map((rule) => rule.itemSlug)),
    ].filter((itemSlug) => {
      return (
        itemLabelsBySlug()[itemSlug] === undefined &&
        !resolvingRuleLabelSlugs.has(itemSlug)
      );
    });

    for (const itemSlug of unresolvedSlugs) {
      resolvingRuleLabelSlugs.add(itemSlug);

      void searchItems(itemSlug, 1)
        .then((items) => {
          const matchedItem = items.find((item) => item.slug === itemSlug);

          if (matchedItem) {
            seedItemLabels([matchedItem]);
          }
        })
        .finally(() => {
          resolvingRuleLabelSlugs.delete(itemSlug);
        });
    }
  });

  async function handleCreateRule(event: SubmitEvent) {
    event.preventDefault();
    const resolvedItem = await resolveItemSelection(itemQuery());

    if (!resolvedItem) {
      setErrorMessage(
        "Choose a valid item from the search results or enter an exact slug",
      );
      return;
    }

    setSubmitting(true);
    try {
      const parsedMaxPlatinum =
        maxPlatinum().trim().length === 0
          ? undefined
          : Number.parseInt(maxPlatinum(), 10);

      seedItemLabels([resolvedItem]);
      await actions.addRule(resolvedItem.slug, parsedMaxPlatinum);
      setErrorMessage(undefined);
      setItemQuery("");
      setMaxPlatinum("");
      setSelectedItem(undefined);
      clearSuggestions();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create watch rule";
      setErrorMessage(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmRuleRemoval() {
    const pendingRule = rulePendingRemoval();
    if (!pendingRule) {
      return;
    }

    setRemovingRuleId(pendingRule.id);

    try {
      await actions.removeRule(pendingRule.id);
      setRulePendingRemoval(undefined);
      setErrorMessage(undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to delete watch rule";
      setErrorMessage(message);
    } finally {
      setRemovingRuleId(undefined);
    }
  }

  async function handleUpdateRulePrice(ruleId: string) {
    const pendingThresholdValue = editingMaxPlatinum();
    const parsedValue = Number.parseInt(pendingThresholdValue, 10);

    if (
      pendingThresholdValue.trim().length === 0 ||
      Number.isNaN(parsedValue) ||
      parsedValue < 0
    ) {
      setErrorMessage("Threshold must be a non-negative number");
      return;
    }

    setSavingRuleId(ruleId);
    setEditingRuleId(undefined);
    setEditingMaxPlatinum("");
    setErrorMessage(undefined);

    try {
      await actions.updateRulePrice(ruleId, parsedValue);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update watch rule";
      setEditingRuleId(ruleId);
      setEditingMaxPlatinum(pendingThresholdValue);
      setErrorMessage(message);
    } finally {
      setSavingRuleId(undefined);
    }
  }

  function commitRuleReorder(sourceId: string, targetId: string) {
    const currentRuleIds = dashboard().rules.map((rule) => rule.id);
    const nextRuleIds = reorderRuleIds(currentRuleIds, sourceId, targetId);

    if (
      nextRuleIds.every((ruleId, index) => ruleId === currentRuleIds[index])
    ) {
      setDraggedRuleId(undefined);
      setDragTargetRuleId(undefined);
      return;
    }

    setDraggedRuleId(undefined);
    setDragTargetRuleId(undefined);
    void actions.reorderRules(nextRuleIds).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unable to reorder watch rule";
      setErrorMessage(message);
    });
  }

  return (
    <>
      <PanelFrame
        actions={
          props.onRequestClose ? (
            <div class="flex items-center gap-1">
              <Show when={props.onRequestClose}>
                <button
                  aria-label="Close watchlist panel"
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
        eyebrow={watchlistEyebrow.label}
        eyebrowBadgeClass={watchlistEyebrow.badgeClassName}
        eyebrowBadgeLabel={watchlistEyebrow.badgeLabel}
        headerAriaLabel={props.paneHeaderAriaLabel}
        headerTestId={props.paneHeaderTestId}
        onHeaderClick={props.onPaneHeaderClick}
      >
        <div class="border-b border-border px-4 py-3">
          <form class="flex flex-col gap-2" onSubmit={handleCreateRule}>
            <div class="relative">
              <Input
                aria-activedescendant={
                  activeSuggestionIndex() >= 0
                    ? `item-search-option-${activeSuggestionIndex()}`
                    : undefined
                }
                aria-autocomplete="list"
                aria-controls="item-search-listbox"
                aria-expanded={isSuggestionListOpen()}
                autocomplete="off"
                class="pr-10"
                data-testid="item-search-input"
                name="itemSlug"
                onBlur={() => {
                  if (typeof window === "undefined") return;
                  window.setTimeout(() => setIsSuggestionListOpen(false), 100);
                }}
                onFocus={() => {
                  if (itemQuery().trim().length >= 2) {
                    setIsSuggestionListOpen(true);
                  }
                }}
                onInput={(e) => {
                  const nextValue = e.currentTarget.value;
                  setItemQuery(nextValue);
                  setSelectedItem(undefined);
                  setErrorMessage(undefined);

                  if (nextValue.trim().length < 2) {
                    debouncedItemSuggestionLoader.dispose();
                    clearSuggestions();
                    return;
                  }

                  setItemSearchLoading(true);
                  setIsSuggestionListOpen(true);
                  debouncedItemSuggestionLoader.schedule(nextValue);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    clearSuggestions();
                    return;
                  }

                  if (e.key === "ArrowDown") {
                    const suggestions = itemSuggestions();

                    if (suggestions.length === 0) {
                      return;
                    }

                    e.preventDefault();
                    setIsSuggestionListOpen(true);
                    setActiveSuggestionIndex((current) =>
                      current + 1 >= suggestions.length ? 0 : current + 1,
                    );
                    return;
                  }

                  if (e.key === "ArrowUp") {
                    const suggestions = itemSuggestions();

                    if (suggestions.length === 0) {
                      return;
                    }

                    e.preventDefault();
                    setIsSuggestionListOpen(true);
                    setActiveSuggestionIndex((current) =>
                      current <= 0 ? suggestions.length - 1 : current - 1,
                    );
                    return;
                  }

                  if (e.key !== "Enter") {
                    return;
                  }

                  if (
                    isSuggestionListOpen() &&
                    activeSuggestionIndex() >= 0 &&
                    itemSuggestions()[activeSuggestionIndex()]
                  ) {
                    e.preventDefault();
                    selectItemSuggestion(
                      itemSuggestions()[activeSuggestionIndex()]!,
                    );
                  }
                }}
                placeholder="Search Item"
                role="combobox"
                value={itemQuery()}
                required
              />
              <Show when={itemQuery().length > 0}>
                <button
                  aria-label="Clear item search"
                  class="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm bg-transparent text-text-muted transition-colors hover:text-text-primary"
                  data-testid="item-search-clear"
                  onClick={() => {
                    setItemQuery("");
                    setSelectedItem(undefined);
                    setErrorMessage(undefined);
                    clearSuggestions();
                  }}
                  type="button"
                >
                  <Icon class="h-3.5 w-3.5" path={xMark} />
                </button>
              </Show>
              <Show
                when={
                  isSuggestionListOpen() &&
                  (itemSearchLoading() || itemSuggestions().length > 0)
                }
              >
                <div
                  class="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden border border-border-strong bg-panel shadow-[0_14px_40px_rgba(2,6,23,0.45)]"
                  data-testid="item-search-listbox"
                  id="item-search-listbox"
                  role="listbox"
                >
                  <Show
                    fallback={
                      <For each={itemSuggestions()}>
                        {(item, index) => {
                          const highlight = () =>
                            getSuggestionHighlight(item.name, itemQuery());

                          return (
                            <button
                              aria-selected={
                                activeSuggestionIndex() === index()
                              }
                              class={`flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-[13px] text-text-secondary transition-colors last:border-b-0 hover:bg-hover hover:text-text-primary ${activeSuggestionIndex() === index() ? "bg-active text-text-primary" : ""}`}
                              data-testid={`item-search-option-${index()}`}
                              id={`item-search-option-${index()}`}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                selectItemSuggestion(item);
                              }}
                              role="option"
                              title={`${item.name} (${item.slug})`}
                              type="button"
                            >
                              <span
                                class="min-w-0 truncate"
                                data-search-slug={item.slug}
                              >
                                <span>{highlight().before}</span>
                                <Show when={highlight().match.length > 0}>
                                  <span class="text-accent-gold">
                                    {highlight().match}
                                  </span>
                                </Show>
                                <span>{highlight().after}</span>
                              </span>
                            </button>
                          );
                        }}
                      </For>
                    }
                    when={itemSearchLoading()}
                  >
                    <div class="px-3 py-2 text-[12px] text-text-muted">
                      Searching items...
                    </div>
                  </Show>
                </div>
              </Show>
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Input
                autocomplete="off"
                class="font-mono"
                inputMode="numeric"
                name="maxPlatinum"
                onBeforeInput={handleNumericBeforeInput}
                onDrop={handleNumericDrop}
                onInput={(e) =>
                  setMaxPlatinum(sanitizeNumericInput(e.currentTarget.value))
                }
                onPaste={handleNumericPaste}
                pattern="[0-9]*"
                placeholder="Price"
                value={maxPlatinum()}
              />
              <div class="group relative flex">
                <button
                  aria-describedby="watchlist-submit-tooltip"
                  aria-label={submitPresentation().ariaLabel}
                  class={`w-8 shrink-0 rounded-sm border border-accent-gold bg-accent-gold px-0 font-mono text-[22px] leading-none transition-colors hover:border-[#d4b97a] hover:bg-[#d4b97a] disabled:cursor-not-allowed disabled:opacity-50 ${submitPresentation().labelClassName}`}
                  disabled={submitting()}
                  data-testid="watchlist-submit"
                  type="submit"
                >
                  {submitPresentation().label}
                </button>
                <div
                  class={`${WATCHLIST_ACTION_TOOLTIP_CLASS} right-0`}
                  data-testid="watchlist-submit-tooltip"
                  id="watchlist-submit-tooltip"
                  role="tooltip"
                >
                  {submitPresentation().title}
                </div>
              </div>
            </div>
            {errorMessage() ? (
              <p class="text-[11px] text-red-400" role="alert">
                {errorMessage()}
              </p>
            ) : null}
          </form>
        </div>

        <div
          class="flex min-h-0 flex-1 flex-col overflow-y-auto"
          data-testid="watchlist-panel"
        >
          <div class="relative">
            <button
              aria-expanded={!rulesCollapsed()}
              class="flex w-full items-center gap-1.5 px-4 py-2 text-[11px] font-semibold text-text-muted transition-colors hover:text-text-primary"
              data-testid="watchlist-section-toggle"
              onClick={() => setRulesCollapsed((collapsed) => !collapsed)}
              type="button"
            >
              <Icon
                class={`h-3.5 w-3.5 transition-transform ${rulesCollapsed() ? "-rotate-90" : "rotate-0"}`}
                path={chevronDown}
              />
              <span class="ml-[5px]">Tracked Rules</span>
            </button>
            <div
              class="group absolute right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center"
              onPointerLeave={() => setPauseTooltipDismissed(false)}
            >
              <button
                aria-describedby="watchlist-pause-tooltip"
                aria-label={
                  runtimeConfig().trackingPaused
                    ? "Resume all tracking"
                    : "Pause all tracking"
                }
                class={`flex h-6 w-6 items-center justify-center bg-transparent text-text-muted transition-colors hover:text-text-primary focus-visible:outline-none ${
                  runtimeConfig().trackingPaused
                    ? "text-text-primary focus-visible:text-text-primary"
                    : "focus-visible:text-text-primary"
                }`}
                data-testid="tracking-pause-toggle"
                onPointerDown={() => setPauseTooltipDismissed(true)}
                onClick={(event) => {
                  void actions.updateTrackingPaused(
                    !runtimeConfig().trackingPaused,
                  );
                  event.currentTarget.blur();
                }}
                type="button"
              >
                <Icon
                  class="h-3.5 w-3.5"
                  path={runtimeConfig().trackingPaused ? play : pause}
                />
              </button>
              <div
                class={`${WATCHLIST_ACTION_TOOLTIP_CLASS} ${
                  pauseTooltipDismissed() ? "!invisible !opacity-0" : ""
                }`}
                data-testid="tracking-pause-tooltip"
                id="watchlist-pause-tooltip"
                role="tooltip"
              >
                {runtimeConfig().trackingPaused
                  ? "Resume tracking for all rules"
                  : "Stop tracking all rules"}
              </div>
            </div>
          </div>
          <div class={`flex flex-col ${rulesCollapsed() ? "hidden" : ""}`}>
            <For each={getWatchlistRuleIds(dashboard()?.rules ?? [])}>
              {(ruleId) => <SortableRuleRow ruleId={ruleId} />}
            </For>
          </div>
        </div>
      </PanelFrame>
      <ConfirmDialog
        confirmDisabled={removingRuleId() !== undefined}
        confirmLabel="Delete"
        description={`Remove ${rulePendingRemoval() ? getRuleLabel(rulePendingRemoval()!.itemSlug) : "this rule"} from tracking? Related alerts will be cleared.`}
        onCancel={() => {
          if (removingRuleId() === undefined) {
            setRulePendingRemoval(undefined);
          }
        }}
        onConfirm={() => void handleConfirmRuleRemoval()}
        open={rulePendingRemoval() !== undefined}
        title="Delete rule"
      />
    </>
  );
}
