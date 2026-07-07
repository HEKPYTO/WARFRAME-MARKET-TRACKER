import { Show, createEffect, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";

export function ConfirmDialog(props: {
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmLabel?: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  createEffect(() => {
    if (!props.open || typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/55 sm:items-center">
          <div
            aria-hidden="true"
            class="absolute inset-0"
            onClick={() => props.onCancel()}
          />
          <section
            aria-modal="true"
            class="relative z-10 flex w-full flex-col border-t border-border bg-panel px-4 py-4 sm:w-[28rem] sm:border sm:px-5 sm:py-5"
            data-testid="confirm-dialog-panel"
            role="dialog"
          >
            <div class="flex flex-col gap-2">
              <h2 class="font-mono text-[13px] font-medium uppercase tracking-wide text-text-primary">
                {props.title}
              </h2>
              <p class="font-mono text-xs leading-relaxed text-text-secondary">
                {props.description}
              </p>
            </div>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <button
                class="inline-flex items-center justify-center gap-2 rounded-sm border border-border bg-surface px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wide text-text-primary transition-colors hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => props.onCancel()}
                type="button"
              >
                {props.cancelLabel ?? "Cancel"}
              </button>
              <button
                class="confirm-dialog__danger-button inline-flex items-center justify-center gap-2 rounded-sm border px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                disabled={props.confirmDisabled}
                onClick={() => props.onConfirm()}
                type="button"
              >
                {props.confirmLabel ?? "Delete"}
              </button>
            </div>
          </section>
        </div>
      </Portal>
    </Show>
  );
}
