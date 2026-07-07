import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type {
  WatchAlert,
  WatchRule,
} from "@warframe-market-tracker/alert-engine";

import {
  createDiscordNotificationQueue,
  sendDiscordNotifications,
  shouldRetryQueuedNotificationError,
} from "./discord-notifications";

const originalTimeZone = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Asia/Bangkok";
  process.env.APP_BASE_URL = "https://tracker.example";
});

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }

  delete process.env.APP_BASE_URL;
});

const alert: WatchAlert = {
  itemSlug: "arcane_barrier",
  lastSeen: "2026-03-24T00:00:00.000Z",
  observedAt: "2026-03-24T00:03:00.000Z",
  platinum: 9,
  ruleId: "rule-1",
  sellerId: "seller-1",
  sellerName: "vash2000",
  sellerSlug: "vash2000",
  status: "online",
};

const watchRule: WatchRule = {
  crossplay: true,
  id: "rule-1",
  itemSlug: "arcane_barrier",
  maxPlatinum: 10,
  platform: "pc",
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return {
    promise,
    resolve,
  };
}

describe("sendDiscordNotifications", () => {
  it("skips delivery when Discord is not configured", async () => {
    const fetchImplementation = mock(
      async () => new Response(null, { status: 200 }),
    );

    await sendDiscordNotifications({
      alerts: [alert],
      fetchImplementation,
      settings: {
        discordBotToken: null,
        discordChannelId: "1234567890",
        discordEnabled: false,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("posts a compact alert card payload with no plaintext content", async () => {
    const fetchImplementation = mock(
      async () => new Response(null, { status: 200 }),
    );

    await sendDiscordNotifications({
      alerts: [alert],
      fetchImplementation,
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const firstCall = fetchImplementation.mock.calls[0] as
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
    expect(JSON.parse(init?.body ?? "{}")).toEqual({
      allowed_mentions: {
        parse: [],
      },
      components: [
        {
          components: [
            {
              label: "Open Market",
              style: 5,
              type: 2,
              url: "https://warframe.market/items/arcane_barrier",
            },
            {
              label: "Open Tracker",
              style: 5,
              type: 2,
              url: "https://tracker.example/?ruleId=rule-1",
            },
          ],
          type: 1,
        },
      ],
      embeds: [
        {
          color: 5793266,
          description: "vash2000 sells for 9p",
          fields: [
            {
              inline: true,
              name: "Status",
              value: "Online",
            },
            {
              inline: true,
              name: "Target",
              value: "10p",
            },
            {
              inline: true,
              name: "Delta",
              value: "1p under",
            },
            {
              inline: true,
              name: "Alerted",
              value: "07:03 AM MAR 24",
            },
            {
              inline: false,
              name: "Trade Message",
              value:
                '```\n/w vash2000 Hi! Want to buy "Arcane Barrier" for 9 platinum. (warframe.market)\n```',
            },
          ],
          title: "Arcane Barrier",
        },
      ],
    });
  });

  it("retries a rate-limited alert when Discord returns retry_after", async () => {
    let attempts = 0;
    const fetchImplementation = mock(async () => {
      attempts += 1;

      if (attempts === 1) {
        return new Response(
          JSON.stringify({
            global: false,
            message: "You are being rate limited.",
            retry_after: 0.3,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 429,
          },
        );
      }

      return new Response(null, { status: 200 });
    });
    const sleep = mock(async () => undefined);

    await sendDiscordNotifications({
      alerts: [alert],
      fetchImplementation,
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      sleep,
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(300);
  });

  it("surfaces the final Discord error detail after exhausting retries", async () => {
    const fetchImplementation = mock(
      async () =>
        new Response(
          JSON.stringify({
            global: false,
            message: "You are being rate limited.",
            retry_after: 0.3,
          }),
          {
            headers: {
              "content-type": "application/json",
            },
            status: 429,
          },
        ),
    );
    const sleep = mock(async () => undefined);

    await expect(
      sendDiscordNotifications({
        alerts: [alert],
        fetchImplementation,
        settings: {
          discordBotToken: "bot-token",
          discordChannelId: "1234567890",
          discordEnabled: true,
          trackingPaused: false,
        },
        sleep,
        watchRulesById: {
          [watchRule.id]: watchRule,
        },
      }),
    ).rejects.toThrow(
      'Discord notification failed: 429 {"global":false,"message":"You are being rate limited.","retry_after":0.3}',
    );
  });

  it("paces multi-alert batches to avoid hammering Discord", async () => {
    const fetchImplementation = mock(
      async () => new Response(null, { status: 200 }),
    );
    const sleep = mock(async () => undefined);

    await sendDiscordNotifications({
      alerts: [
        alert,
        { ...alert, sellerId: "seller-2", sellerName: "alt-seller" },
      ],
      fetchImplementation,
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      sleep,
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(400);
  });

  it("fails fast when a Discord request stalls", async () => {
    const fetchImplementation = mock(
      async (_input: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              init.signal?.reason ?? new DOMException("Aborted", "AbortError"),
            );
          });
        }),
    );

    await expect(
      sendDiscordNotifications({
        alerts: [alert],
        fetchImplementation,
        requestTimeoutMs: 5,
        settings: {
          discordBotToken: "bot-token",
          discordChannelId: "1234567890",
          discordEnabled: true,
          trackingPaused: false,
        },
        watchRulesById: {
          [watchRule.id]: watchRule,
        },
      }),
    ).rejects.toThrow(
      "Discord notification failed: request timed out after 5ms",
    );
  });

  it("skips delivery when Discord notifications are disabled", async () => {
    const fetchImplementation = mock(
      async () => new Response(null, { status: 200 }),
    );

    await sendDiscordNotifications({
      alerts: [alert],
      fetchImplementation,
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: false,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("delivers queued notifications in enqueue order even when the first send is slow", async () => {
    const sendDeferred = createDeferred<void>();
    const callOrder: string[] = [];
    const send = async (
      input: Parameters<typeof sendDiscordNotifications>[0],
    ) => {
      callOrder.push(input.alerts[0]?.sellerName ?? "");

      if (input.alerts[0]?.sellerName === "vash2000") {
        await sendDeferred.promise;
      }
    };

    const queue = createDiscordNotificationQueue(send);

    const first = queue.enqueue({
      alerts: [alert],
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });
    const second = queue.enqueue({
      alerts: [{ ...alert, sellerName: "alt-seller", sellerId: "seller-2" }],
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    let secondResolved = false;
    void second.then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    expect(callOrder).toEqual(["vash2000"]);
    expect(secondResolved).toBe(false);

    sendDeferred.resolve();
    await first;
    await second;

    expect(callOrder).toEqual(["vash2000", "alt-seller"]);
  });

  it("reports pending depth and resolves when the queue drains", async () => {
    const sendDeferred = createDeferred<void>();
    const queue = createDiscordNotificationQueue(
      async () => sendDeferred.promise,
    );

    expect(queue.pendingDepth()).toBe(0);

    const first = queue.enqueue({
      alerts: [alert],
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });
    const second = queue.enqueue({
      alerts: [{ ...alert, sellerName: "alt-seller", sellerId: "seller-2" }],
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(queue.pendingDepth()).toBe(2);

    const idle = queue.whenIdle();
    let idleResolved = false;
    void idle.then(() => {
      idleResolved = true;
    });

    await Promise.resolve();
    expect(idleResolved).toBe(false);

    sendDeferred.resolve();
    await first;
    await second;
    await idle;

    expect(queue.pendingDepth()).toBe(0);
    expect(idleResolved).toBe(true);
  });

  it("retries a failed queued delivery instead of dropping it", async () => {
    let attempts = 0;
    const sleep = mock(async () => undefined);
    const queue = createDiscordNotificationQueue(
      async () => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("discord unavailable");
        }
      },
      {
        retryDelayMs: 25,
        sleep,
      },
    );

    await queue.enqueue({
      alerts: [alert],
      settings: {
        discordBotToken: "bot-token",
        discordChannelId: "1234567890",
        discordEnabled: true,
        trackingPaused: false,
      },
      watchRulesById: {
        [watchRule.id]: watchRule,
      },
    });

    expect(attempts).toBe(2);
    expect(sleep).toHaveBeenCalledWith(25);
    expect(queue.pendingDepth()).toBe(0);
  });

  it("does not retry permanent Discord client errors", () => {
    expect(
      shouldRetryQueuedNotificationError({
        attempt: 1,
        error: new Error("Discord notification failed: 401 unauthorized"),
        maxAttempts: 3,
      }),
    ).toBe(false);
    expect(
      shouldRetryQueuedNotificationError({
        attempt: 1,
        error: new Error("Discord notification failed: 400 bad request"),
        maxAttempts: 3,
      }),
    ).toBe(false);
  });

  it("retries transient Discord failures only up to the configured cap", () => {
    expect(
      shouldRetryQueuedNotificationError({
        attempt: 1,
        error: new Error(
          'Discord notification failed: 429 {"message":"rate limited"}',
        ),
        maxAttempts: 3,
      }),
    ).toBe(true);
    expect(
      shouldRetryQueuedNotificationError({
        attempt: 1,
        error: new Error(
          "Discord notification failed: request timed out after 5000ms",
        ),
        maxAttempts: 3,
      }),
    ).toBe(true);
    expect(
      shouldRetryQueuedNotificationError({
        attempt: 3,
        error: new Error("Discord notification failed: 503 upstream error"),
        maxAttempts: 3,
      }),
    ).toBe(false);
  });

  it("lets later queued alerts progress after a permanent Discord failure", async () => {
    const callOrder: string[] = [];
    const queue = createDiscordNotificationQueue(
      async (input: { sellerName: string }) => {
        callOrder.push(input.sellerName);

        if (input.sellerName === "bad-seller") {
          throw new Error("Discord notification failed: 401 unauthorized");
        }
      },
      {
        maxRetryAttempts: 2,
        retryDelayMs: 1,
        sleep: (ms: number) =>
          new Promise<void>((resolve) => {
            setTimeout(resolve, ms);
          }),
      },
    );

    const first = queue.enqueue({ sellerName: "bad-seller" });
    const second = queue.enqueue({ sellerName: "good-seller" });

    const secondResult = await Promise.race([
      second.then(() => "resolved"),
      new Promise<"timed-out">((resolve) => {
        setTimeout(() => resolve("timed-out"), 50);
      }),
    ]);

    expect(secondResult).toBe("resolved");
    await first;
    expect(callOrder).toEqual(["bad-seller", "good-seller"]);
  });
});
