import { describe, expect, it, mock } from "bun:test";
import { PRESERVE_DISCORD_BOT_TOKEN } from "@warframe-market-tracker/db";

import {
  createGetSettingsHandler,
  createUpdateSettingsHandler,
} from "./settings-route";
import { MASKED_DISCORD_BOT_TOKEN } from "./settings-contract";

describe("createGetSettingsHandler", () => {
  it("returns empty strings when no settings have been saved", async () => {
    const response = await createGetSettingsHandler({
      getUserSettingsState: async () => null,
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      discordBotToken: "",
      discordChannelId: "",
      discordEnabled: false,
      trackingPaused: false,
      hasDiscordBotToken: false,
    });
  });

  it("masks the bot token when settings exist", async () => {
    const response = await createGetSettingsHandler({
      getUserSettingsState: async () => ({
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: true,
        hasDiscordBotToken: true,
      }),
    })();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      discordBotToken: MASKED_DISCORD_BOT_TOKEN,
      discordChannelId: "1234567890",
      discordEnabled: true,
      trackingPaused: true,
      hasDiscordBotToken: true,
    });
  });
});

describe("createUpdateSettingsHandler", () => {
  it("trims inputs and stores blank fields as null", async () => {
    const updateUserSettings = mock(async () => undefined);

    const response = await createUpdateSettingsHandler({
      getUserSettingsState: async () => null,
      updateUserSettings,
    })({
      request: new Request("http://localhost/api/settings", {
        body: JSON.stringify({
          discordBotToken: "  bot-token  ",
          discordChannelId: "   ",
          discordEnabled: true,
          trackingPaused: true,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      }),
    });

    expect(response.status).toBe(200);
    expect(updateUserSettings).toHaveBeenCalledWith({
      discordBotToken: "bot-token",
      discordChannelId: null,
      discordEnabled: true,
      trackingPaused: true,
    });
  });

  it("rejects invalid payloads", async () => {
    const updateUserSettings = mock(async () => undefined);

    const response = await createUpdateSettingsHandler({
      getUserSettingsState: async () => null,
      updateUserSettings,
    })({
      request: new Request("http://localhost/api/settings", {
        body: JSON.stringify({
          discordBotToken: 123,
          discordChannelId: "channel-id",
          discordEnabled: true,
          trackingPaused: true,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      }),
    });

    expect(response.status).toBe(400);
    expect(updateUserSettings).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Invalid settings payload",
    });
  });

  it("preserves the saved bot token when the masked placeholder is submitted", async () => {
    const updateUserSettings = mock(async () => undefined);

    const response = await createUpdateSettingsHandler({
      getUserSettingsState: async () => ({
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
        hasDiscordBotToken: true,
      }),
      updateUserSettings,
    })({
      request: new Request("http://localhost/api/settings", {
        body: JSON.stringify({
          discordBotToken: MASKED_DISCORD_BOT_TOKEN,
          discordChannelId: "  2222222222  ",
          discordEnabled: false,
          trackingPaused: true,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "PUT",
      }),
    });

    expect(response.status).toBe(200);
    expect(updateUserSettings).toHaveBeenCalledWith({
      discordBotToken: PRESERVE_DISCORD_BOT_TOKEN,
      discordChannelId: "2222222222",
      discordEnabled: false,
      trackingPaused: true,
    });
  });
});
