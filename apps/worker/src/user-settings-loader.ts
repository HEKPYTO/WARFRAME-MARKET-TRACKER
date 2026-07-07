import type { UserSettings } from "@warframe-market-tracker/db";

export function createCachedUserSettingsLoader(
  loadSettings: () => Promise<UserSettings | null>,
) {
  let cachedSettings: Promise<UserSettings | null> | undefined;

  return function getSettings() {
    if (!cachedSettings) {
      cachedSettings = loadSettings();
    }

    return cachedSettings;
  };
}
