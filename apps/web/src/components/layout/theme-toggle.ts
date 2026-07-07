import { computerDesktop, moon, sun } from "solid-heroicons/outline";

import type { ThemeMode } from "~/lib/theme";

export function getThemeTogglePresentation(theme: ThemeMode) {
  if (theme === "system") {
    return {
      ariaLabel: "Theme: system. Activate to switch to light.",
      iconPath: computerDesktop,
      title: "Theme: System",
    };
  }

  if (theme === "light") {
    return {
      ariaLabel: "Theme: light. Activate to switch to dark.",
      iconPath: sun,
      title: "Theme: Light",
    };
  }

  return {
    ariaLabel: "Theme: dark. Activate to switch to system.",
    iconPath: moon,
    title: "Theme: Dark",
  };
}
