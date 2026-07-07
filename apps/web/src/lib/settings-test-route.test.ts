import { afterEach, describe, expect, it, mock } from "bun:test";

import {
  createSendTestSettingsHandler,
  sendDiscordTestMessage,
} from "./settings-test-route";

const originalFetch = globalThis.fetch;
const originalTimeZone = process.env.TZ;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("createSendTestSettingsHandler", () => {
  it("prefers the draft Discord test payload over saved settings", async () => {
    const sendDiscordTestMessage = mock(async () => undefined);

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => ({
        discordBotToken: "saved-bot-token",
        discordChannelId: "saved-channel-id",
        discordEnabled: false,
        trackingPaused: true,
      }),
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        body: JSON.stringify({
          discordBotToken: "draft-bot-token",
          discordChannelId: "draft-channel-id",
          discordEnabled: true,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(sendDiscordTestMessage).toHaveBeenCalledWith({
      discordBotToken: "draft-bot-token",
      discordChannelId: "draft-channel-id",
      discordEnabled: true,
      trackingPaused: true,
    });
  });

  it("returns 400 when Discord settings are missing", async () => {
    const sendDiscordTestMessage = mock(async () => undefined);

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => ({
        discordBotToken: null,
        discordChannelId: null,
        discordEnabled: true,
        trackingPaused: false,
      }),
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(400);
    expect(sendDiscordTestMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Discord settings are incomplete",
    });
  });

  it("uses the saved settings to send a test message", async () => {
    const sendDiscordTestMessage = mock(async () => undefined);

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      }),
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(200);
    expect(sendDiscordTestMessage).toHaveBeenCalledWith({
      discordBotToken: "bot-token",
      discordChannelId: "1234567890",
      discordEnabled: true,
      trackingPaused: false,
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 400 when Discord notifications are disabled", async () => {
    const sendDiscordTestMessage = mock(async () => undefined);

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: false,
        trackingPaused: false,
      }),
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(400);
    expect(sendDiscordTestMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Discord notifications are disabled",
    });
  });

  it("returns 502 when Discord rejects the test message", async () => {
    const sendDiscordTestMessage = mock(async () => {
      throw new Error("Discord rejected request");
    });

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      }),
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Discord rejected request",
    });
  });

  it("returns 503 when Discord times out sending the test message", async () => {
    const sendDiscordTestMessage = mock(async () => {
      throw new Error(
        "Discord notification failed: request timed out after 10000ms",
      );
    });

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => ({
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      }),
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Discord notification failed: request timed out after 10000ms",
    });
  });

  it("returns 503 when the server cannot access the saved Discord token securely", async () => {
    const sendDiscordTestMessage = mock(async () => undefined);

    const response = await createSendTestSettingsHandler({
      getUserSettings: async () => {
        throw new Error("APP_SECRETS_MASTER_KEY is required");
      },
      sendDiscordTestMessage,
    })({
      request: new Request("http://localhost/api/settings-test", {
        method: "POST",
      }),
    });

    expect(response.status).toBe(503);
    expect(sendDiscordTestMessage).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "APP_SECRETS_MASTER_KEY is required",
    });
  });
});

describe("sendDiscordTestMessage", () => {
  it("sends a dedicated verification payload instead of a fake alert preview", async () => {
    process.env.TZ = "Asia/Bangkok";

    const fetchMock = mock(async () => new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await sendDiscordTestMessage({
      discordBotToken: "bot-token",
      discordChannelId: "1234567890",
      discordEnabled: true,
      trackingPaused: false,
    });

    const firstCall = fetchMock.mock.calls[0] as
      | [
          string,
          { body?: string; headers?: Record<string, string>; method?: string },
        ]
      | undefined;
    const [url, init] = firstCall ?? ["", {}];

    expect(url).toBe(
      "https://discord.com/api/v10/channels/1234567890/messages",
    );
    expect(init?.headers).toEqual({
      Authorization: "Bot bot-token",
      "Content-Type": "application/json",
      "User-Agent":
        "WarframeMarketTracker (https://github.com/tsun/WARFRAME-MARKET-TRACKER, 1.0.0)",
    });
    expect(init?.method).toBe("POST");
    const payload = JSON.parse(init?.body ?? "{}");

    expect(payload.allowed_mentions).toEqual({
      parse: [],
    });
    expect(payload.components).toEqual([]);
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0]).toEqual({
      color: 5793266,
      description:
        "Signal path is clear. Warframe Market Tracker can post alerts to this channel.",
      fields: [
        {
          inline: true,
          name: "Checked",
          value: expect.stringMatching(/^\d{2}:\d{2} [AP]M [A-Z]{3} \d{2}$/),
        },
      ],
      title: "Discord connection verified",
    });
  });

  it("fails fast when the Discord test request stalls", async () => {
    const fetchMock = mock(
      async (
        _input: string,
        init?: { signal?: AbortSignal },
      ): Promise<Response> =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              init.signal?.reason ?? new DOMException("Aborted", "AbortError"),
            );
          });
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      sendDiscordTestMessage(
        {
          discordBotToken: "bot-token",
          discordChannelId: "1234567890",
          discordEnabled: true,
          trackingPaused: false,
        },
        { requestTimeoutMs: 5 },
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "Discord notification failed: request timed out after 5ms",
      }),
    );
  });
});
