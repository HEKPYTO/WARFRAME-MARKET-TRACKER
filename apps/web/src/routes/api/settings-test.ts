import { getUserSettings } from "@warframe-market-tracker/db";

import {
  createSendTestSettingsHandler,
  sendDiscordTestMessage,
} from "~/lib/settings-test-route";

export const POST = createSendTestSettingsHandler({
  getUserSettings,
  sendDiscordTestMessage,
});
