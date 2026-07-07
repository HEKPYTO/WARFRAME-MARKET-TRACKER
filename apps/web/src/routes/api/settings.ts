import {
  getUserSettingsState,
  updateUserSettings,
} from "@warframe-market-tracker/db";

import {
  createGetSettingsHandler,
  createUpdateSettingsHandler,
} from "~/lib/settings-route";

export const GET = createGetSettingsHandler({
  getUserSettingsState,
});

export const PUT = createUpdateSettingsHandler({
  getUserSettingsState,
  updateUserSettings,
});
