import {
  PRESERVE_DISCORD_BOT_TOKEN,
  type UpdateUserSettingsInput,
  type UserSettingsState,
} from "@warframe-market-tracker/db";
import { z } from "zod";

import {
  isMaskedDiscordBotToken,
  maskDiscordBotToken,
} from "./settings-contract";

const settingsPayloadSchema = z.object({
  discordBotToken: z.string(),
  discordChannelId: z.string(),
  discordEnabled: z.boolean(),
  trackingPaused: z.boolean(),
});

function normalizeSetting(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createGetSettingsHandler(dependencies: {
  getUserSettingsState: () => Promise<UserSettingsState | null>;
}) {
  return async () => {
    const settings = await dependencies.getUserSettingsState();

    return Response.json({
      discordBotToken: settings?.hasDiscordBotToken
        ? maskDiscordBotToken("configured")
        : "",
      discordChannelId: settings?.discordChannelId ?? "",
      discordEnabled: settings?.discordEnabled ?? false,
      hasDiscordBotToken: settings?.hasDiscordBotToken ?? false,
      trackingPaused: settings?.trackingPaused ?? false,
    });
  };
}

export function createUpdateSettingsHandler(dependencies: {
  getUserSettingsState: () => Promise<UserSettingsState | null>;
  updateUserSettings: (input: UpdateUserSettingsInput) => Promise<void>;
}) {
  return async (event: { request: Request }) => {
    const body = await event.request.json().catch(() => undefined);
    const parsed = settingsPayloadSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Invalid settings payload",
        },
        { status: 400 },
      );
    }

    const existingSettings = await dependencies.getUserSettingsState();
    const discordBotToken = isMaskedDiscordBotToken(parsed.data.discordBotToken)
      ? existingSettings?.hasDiscordBotToken
        ? PRESERVE_DISCORD_BOT_TOKEN
        : null
      : normalizeSetting(parsed.data.discordBotToken);

    try {
      await dependencies.updateUserSettings({
        discordBotToken,
        discordChannelId: normalizeSetting(parsed.data.discordChannelId),
        discordEnabled: parsed.data.discordEnabled,
        trackingPaused: parsed.data.trackingPaused,
      });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to update settings securely",
        },
        { status: 503 },
      );
    }

    return Response.json({ success: true });
  };
}
