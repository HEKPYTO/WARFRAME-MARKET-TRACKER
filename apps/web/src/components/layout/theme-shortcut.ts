export interface ThemeShortcutTarget {
  closest?: (selector: string) => unknown;
}

export interface ThemeShortcutKeyboardEvent {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  key: string;
  metaKey: boolean;
  repeat: boolean;
  shiftKey: boolean;
  target: ThemeShortcutTarget | null;
}

const EDITABLE_SELECTOR =
  "input, textarea, select, button, [contenteditable=''], [contenteditable='true']";

export function shouldToggleThemeFromKeyboardEvent(
  event: ThemeShortcutKeyboardEvent,
) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return false;
  }

  if (event.key !== " ") {
    return false;
  }

  return !event.target?.closest?.(EDITABLE_SELECTOR);
}
