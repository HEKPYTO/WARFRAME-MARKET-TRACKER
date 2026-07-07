import { describe, expect, it, mock } from "bun:test";

import { createCachedUserSettingsLoader } from "./user-settings-loader";

describe("createCachedUserSettingsLoader", () => {
  it("loads settings only once across repeated reads", async () => {
    const loadSettings = mock(async () => ({
      discordBotToken: "bot-token",
      discordChannelId: "channel-1",
      discordEnabled: true,
      trackingPaused: false,
    }));
    const getSettings = createCachedUserSettingsLoader(loadSettings);

    await expect(getSettings()).resolves.toEqual({
      discordBotToken: "bot-token",
      discordChannelId: "channel-1",
      discordEnabled: true,
      trackingPaused: false,
    });
    await expect(getSettings()).resolves.toEqual({
      discordBotToken: "bot-token",
      discordChannelId: "channel-1",
      discordEnabled: true,
      trackingPaused: false,
    });

    expect(loadSettings).toHaveBeenCalledTimes(1);
  });

  it("shares the same in-flight settings request across concurrent reads", async () => {
    const loadSettings = mock(
      () =>
        new Promise<{
          discordBotToken: string | null;
          discordChannelId: string | null;
          discordEnabled: boolean;
          trackingPaused: boolean;
        }>((resolve) => {
          setTimeout(() => {
            resolve({
              discordBotToken: "bot-token",
              discordChannelId: "channel-1",
              discordEnabled: true,
              trackingPaused: false,
            });
          }, 0);
        }),
    );
    const getSettings = createCachedUserSettingsLoader(loadSettings);

    await Promise.all([getSettings(), getSettings(), getSettings()]);

    expect(loadSettings).toHaveBeenCalledTimes(1);
  });
});
