import { describe, expect, it } from "bun:test";
import { computerDesktop, moon, sun } from "solid-heroicons/outline";

import type { ThemeMode } from "~/lib/theme";
import { getThemeTogglePresentation } from "./theme-toggle";

describe("getThemeTogglePresentation", () => {
  const cases: Array<{
    ariaLabel: string;
    iconPath: typeof computerDesktop;
    theme: ThemeMode;
    title: string;
  }> = [
    {
      ariaLabel: "Theme: system. Activate to switch to light.",
      iconPath: computerDesktop,
      theme: "system",
      title: "Theme: System",
    },
    {
      ariaLabel: "Theme: light. Activate to switch to dark.",
      iconPath: sun,
      theme: "light",
      title: "Theme: Light",
    },
    {
      ariaLabel: "Theme: dark. Activate to switch to system.",
      iconPath: moon,
      theme: "dark",
      title: "Theme: Dark",
    },
  ];

  for (const testCase of cases) {
    it(`returns the correct heroicon metadata for ${testCase.theme}`, () => {
      expect(getThemeTogglePresentation(testCase.theme)).toEqual({
        ariaLabel: testCase.ariaLabel,
        iconPath: testCase.iconPath,
        title: testCase.title,
      });
    });
  }
});
