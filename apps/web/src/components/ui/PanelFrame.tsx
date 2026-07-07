import type { JSX } from "solid-js";

export function PanelFrame(props: {
  actions?: JSX.Element | undefined;
  children: JSX.Element;
  bodyClass?: string | undefined;
  class?: string | undefined;
  eyebrow?: string | undefined;
  eyebrowBadgeClass?: string | undefined;
  eyebrowBadgeLabel?: string | undefined;
  headerAriaLabel?: string | undefined;
  headerTestId?: string | undefined;
  onHeaderClick?: (() => void) | undefined;
}) {
  const headerIsInteractive = () => props.onHeaderClick !== undefined;

  return (
    <section
      class={`flex min-h-0 flex-col overflow-hidden bg-panel ${props.class ?? ""}`}
    >
      <div
        aria-label={props.headerAriaLabel}
        class={`flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 ${headerIsInteractive() ? "cursor-pointer transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-gold" : ""}`}
        data-testid={props.headerTestId}
        onClick={() => props.onHeaderClick?.()}
        onKeyDown={(event) => {
          if (!headerIsInteractive()) return;
          if (event.key !== "Enter" && event.key !== " ") return;

          event.preventDefault();
          props.onHeaderClick?.();
        }}
        role={headerIsInteractive() ? "button" : undefined}
        tabIndex={headerIsInteractive() ? 0 : undefined}
      >
        <div class="min-w-0">
          {props.eyebrow ? (
            <div class="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              <span>{props.eyebrow}</span>
              {props.eyebrowBadgeLabel ? (
                <span class={props.eyebrowBadgeClass}>
                  {props.eyebrowBadgeLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {props.actions ?? null}
      </div>
      <div class={`min-h-0 flex-1 ${props.bodyClass ?? ""}`}>
        {props.children}
      </div>
    </section>
  );
}
