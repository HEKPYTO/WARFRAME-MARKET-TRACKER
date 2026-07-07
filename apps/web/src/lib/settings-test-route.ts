import {
  buildDiscordTestMessagePresentation,
  DISCORD_ALERT_COLOR,
} from "@warframe-market-tracker/discord-alerts";
import { postDiscordMessage } from "@warframe-market-tracker/discord-client";
import type { UserSettings } from "@warframe-market-tracker/db";
import { z } from "zod";
import { isMaskedDiscordBotToken } from "./settings-contract";

type CompleteDiscordSettings = {
  discordBotToken: string;
  discordChannelId: string;
  discordEnabled: true;
  trackingPaused: boolean;
};

const discordTestPayloadSchema = z.object({
  discordBotToken: z.string(),
  discordChannelId: z.string(),
  discordEnabled: z.boolean(),
});

function buildDiscordTestPayload() {
  const presentation = buildDiscordTestMessagePresentation({
    checkedAt: new Date().toISOString(),
  });

  return {
    allowed_mentions: {
      parse: [],
    },
    components: [],
    embeds: [
      {
        color: DISCORD_ALERT_COLOR,
        description: presentation.description,
        fields: presentation.fields.map((field) => ({
          inline: true,
          name: field.label,
          value: field.value,
        })),
        title: presentation.title,
      },
    ],
  };
}

function hasCompleteDiscordSettings(
  settings: UserSettings | null,
): settings is CompleteDiscordSettings {
  return Boolean(
    settings?.discordEnabled &&
    settings.discordBotToken?.trim() &&
    settings.discordChannelId?.trim(),
  );
}

function normalizeSetting(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

async function readOptionalJson(
  request: Request,
): Promise<unknown | undefined> {
  const contentType = request.headers.get("content-type");

  if (!contentType?.includes("application/json")) {
    return undefined;
  }

  return request.json().catch(() => undefined);
}

function resolveDiscordTestSettings(input: {
  payload: z.infer<typeof discordTestPayloadSchema>;
  savedSettings: UserSettings | null;
}): UserSettings {
  return {
    discordBotToken: isMaskedDiscordBotToken(input.payload.discordBotToken)
      ? (input.savedSettings?.discordBotToken ?? null)
      : normalizeSetting(input.payload.discordBotToken),
    discordChannelId: normalizeSetting(input.payload.discordChannelId),
    discordEnabled: input.payload.discordEnabled,
    trackingPaused: input.savedSettings?.trackingPaused ?? false,
  };
}

export async function sendDiscordTestMessage(
  settings: CompleteDiscordSettings,
  options?: {
    fetchImplementation?: typeof fetch;
    requestTimeoutMs?: number;
  },
): Promise<void> {
  const input = {
    messagePayload: buildDiscordTestPayload(),
    settings,
    ...(options?.fetchImplementation
      ? { fetchImplementation: options.fetchImplementation }
      : {}),
    ...(options?.requestTimeoutMs !== undefined
      ? { requestTimeoutMs: options.requestTimeoutMs }
      : {}),
  };

  await postDiscordMessage(input);
}

export function createSendTestSettingsHandler(dependencies: {
  getUserSettings: () => Promise<UserSettings | null>;
  sendDiscordTestMessage: (settings: CompleteDiscordSettings) => Promise<void>;
}) {
  return async (event: { request: Request }) => {
    let settings: UserSettings | null;

    try {
      settings = await dependencies.getUserSettings();
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to access Discord settings securely",
        },
        { status: 503 },
      );
    }

    const body = await readOptionalJson(event.request);
    const parsedPayload =
      body === undefined ? undefined : discordTestPayloadSchema.safeParse(body);

    if (parsedPayload !== undefined && !parsedPayload.success) {
      return Response.json(
        {
          error: "Invalid Discord test payload",
        },
        { status: 400 },
      );
    }

    const effectiveSettings =
      parsedPayload?.success === true
        ? resolveDiscordTestSettings({
            payload: parsedPayload.data,
            savedSettings: settings,
          })
        : settings;

    if (!hasCompleteDiscordSettings(effectiveSettings)) {
      return Response.json(
        {
          error:
            effectiveSettings?.discordEnabled === false
              ? "Discord notifications are disabled"
              : "Discord settings are incomplete",
        },
        { status: 400 },
      );
    }

    try {
      await dependencies.sendDiscordTestMessage(effectiveSettings);
      return Response.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to send Discord test message";
      const status = message.includes("request timed out after") ? 503 : 502;

      return Response.json(
        {
          error: message,
        },
        { status },
      );
    }
  };
}
