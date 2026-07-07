import { describe, expect, it } from "bun:test";

import { shouldToggleThemeFromKeyboardEvent } from "./theme-shortcut";

function createEventInput(
  overrides: Partial<
    Parameters<typeof shouldToggleThemeFromKeyboardEvent>[0]
  > = {},
): Parameters<typeof shouldToggleThemeFromKeyboardEvent>[0] {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key: " ",
    metaKey: false,
    repeat: false,
    shiftKey: false,
    target: null,
    ...overrides,
  };
}

describe("shouldToggleThemeFromKeyboardEvent", () => {
  it("allows plain space presses on non-editable targets", () => {
    expect(shouldToggleThemeFromKeyboardEvent(createEventInput())).toBe(true);
  });

  it("ignores space presses from editable targets", () => {
    expect(
      shouldToggleThemeFromKeyboardEvent(
        createEventInput({
          target: {
            closest: (selector: string) =>
              selector ===
              "input, textarea, select, button, [contenteditable=''], [contenteditable='true']",
          },
        }),
      ),
    ).toBe(false);
  });

  it("ignores space presses on native button targets", () => {
    expect(
      shouldToggleThemeFromKeyboardEvent(
        createEventInput({
          target: {
            closest: (selector: string) =>
              selector ===
              "input, textarea, select, button, [contenteditable=''], [contenteditable='true']",
          },
        }),
      ),
    ).toBe(false);
  });

  it("ignores modified, repeated, and already-handled key events", () => {
    expect(
      shouldToggleThemeFromKeyboardEvent(
        createEventInput({
          ctrlKey: true,
        }),
      ),
    ).toBe(false);

    expect(
      shouldToggleThemeFromKeyboardEvent(
        createEventInput({
          repeat: true,
        }),
      ),
    ).toBe(false);

    expect(
      shouldToggleThemeFromKeyboardEvent(
        createEventInput({
          defaultPrevented: true,
        }),
      ),
    ).toBe(false);
  });
});
