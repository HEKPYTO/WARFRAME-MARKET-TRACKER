import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
export { ConfirmDialog } from "./ConfirmDialog";
export { PanelFrame } from "./PanelFrame";

export function Button(
  props: JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "primary" | "secondary" | "ghost";
  },
) {
  const [local, others] = splitProps(props, ["variant", "class"]);

  const baseClass =
    "inline-flex items-center justify-center gap-2 rounded-sm border border-transparent px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const primaryClass =
    "border-border-strong bg-accent-gold text-black hover:bg-[#d4b97a]";
  const secondaryClass =
    "border-border bg-surface text-text-primary hover:bg-hover";
  const ghostClass =
    "bg-transparent text-text-secondary hover:text-text-primary";

  return (
    <button
      class={`${baseClass} ${local.variant === "secondary" ? secondaryClass : local.variant === "ghost" ? ghostClass : primaryClass} ${local.class ?? ""}`}
      {...others}
    />
  );
}

export function Input(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const [local, others] = splitProps(props, ["class"]);

  return (
    <input
      class={`w-full rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[13px] text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-accent-gold ${local.class ?? ""}`}
      {...others}
    />
  );
}

export function Badge(
  props: JSX.HTMLAttributes<HTMLSpanElement> & {
    variant?: "default" | "success" | "warning" | "error";
  },
) {
  const [local, others] = splitProps(props, ["variant", "class"]);

  return (
    <span
      class={`rounded-sm bg-surface px-2 py-0.5 text-xs text-text-muted ${local.class ?? ""}`}
      {...others}
    />
  );
}

export function ToggleSwitch(props: {
  checked: boolean;
  class?: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={props.checked}
      aria-label={props.label}
      class={`inline-flex items-center gap-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        props.checked ? "text-text-primary" : "text-text-secondary"
      } ${props.class ?? ""}`}
      data-testid="toggle-switch"
      disabled={props.disabled}
      onClick={() => props.onChange(!props.checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden="true"
        class={`relative h-4.5 w-9 rounded-full border transition-all ${
          props.checked
            ? "border-accent-gold bg-accent-gold/20"
            : "border-border bg-surface-base"
        }`}
      >
        <span
          class={`absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full transition-all ${
            props.checked
              ? "left-[20px] bg-accent-gold shadow-[0_0_8px_rgba(201,161,74,0.45)]"
              : "left-[2px] bg-text-muted"
          }`}
        />
      </span>
      <span class="font-mono text-[11px] uppercase tracking-widest">
        {props.label}
      </span>
    </button>
  );
}

export function StatusIndicator(props: {
  status: "ingame" | "online" | "offline";
}) {
  const colorClass = () => {
    if (props.status === "ingame")
      return "bg-accent-teal shadow-[0_0_6px_var(--color-accent-teal)]";
    if (props.status === "online") return "bg-blue-500";
    return "bg-text-muted";
  };

  return (
    <span class={`w-2 h-2 rounded-full ${colorClass()}`} title={props.status} />
  );
}
