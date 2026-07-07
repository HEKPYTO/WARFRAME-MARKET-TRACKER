import { Icon } from "solid-heroicons";
import { bellAlert } from "solid-heroicons/solid";

export function PanelToggleBar(props: {
  activePanel: "alerts" | "watchlist" | null;
  alertCount: number;
  onToggle: (panel: "alerts" | "watchlist") => void;
  ruleCount: number;
}) {
  return (
    <div
      class="grid h-9 grid-cols-2 border-b border-border bg-panel xl:hidden"
      data-testid="panel-toggle-bar"
    >
      <button
        class={`flex h-full min-w-0 items-center justify-start gap-2 px-4 font-mono text-[10px] uppercase tracking-wide transition-colors ${props.activePanel === "watchlist" ? "bg-hover text-text-primary" : "bg-transparent text-text-secondary hover:text-text-primary"}`}
        data-testid="panel-toggle-rules"
        onClick={() => props.onToggle("watchlist")}
        type="button"
      >
        <span
          aria-hidden="true"
          class="flex h-3.5 w-3.5 shrink-0 flex-col items-center justify-center gap-[2px]"
        >
          <span class="block h-[1.5px] w-3 rounded-full bg-current" />
          <span class="block h-[1.5px] w-3 rounded-full bg-current" />
          <span class="block h-[1.5px] w-3 rounded-full bg-current" />
        </span>
        <span>{props.ruleCount} rules</span>
      </button>
      <button
        class={`flex h-full min-w-0 items-center justify-start gap-2 border-l border-border px-4 font-mono text-[10px] uppercase tracking-wide transition-colors ${props.activePanel === "alerts" ? "bg-hover text-text-primary" : "bg-transparent text-text-secondary hover:text-text-primary"}`}
        data-testid="panel-toggle-alerts"
        onClick={() => props.onToggle("alerts")}
        type="button"
      >
        <Icon class="h-3.5 w-3.5 shrink-0" path={bellAlert} />
        <span>{props.alertCount} alerts</span>
      </button>
    </div>
  );
}
