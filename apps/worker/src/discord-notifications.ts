import type {
  WatchAlert,
  WatchRule,
} from "@warframe-market-tracker/alert-engine";
import {
  buildDiscordAlertMessagePayload,
  DISCORD_ALERT_COLOR,
  type DiscordMessagePayload,
} from "@warframe-market-tracker/discord-alerts";
import {
  postDiscordMessage,
  type FetchLike,
} from "@warframe-market-tracker/discord-client";
import type { UserSettings } from "@warframe-market-tracker/db";
import { cardToDiscordPayload } from "@chat-adapter/discord";
import { Actions, Card, CardText, Field, Fields, LinkButton } from "chat";

type CompleteDiscordSettings = {
  discordBotToken: string;
  discordChannelId: string;
  discordEnabled: true;
  trackingPaused: boolean;
};

type WatchRuleContext = Pick<WatchRule, "id" | "itemSlug" | "maxPlatinum">;

const DISCORD_BATCH_SPACING_MS = 400;
const DISCORD_QUEUE_RETRY_DELAY_MS = 5_000;
const DISCORD_QUEUE_MAX_RETRY_ATTEMPTS = 3;

export type DiscordNotificationQueue<TInput> = {
  enqueue(input: TInput): Promise<void>;
  pendingDepth(): number;
  whenIdle(): Promise<void>;
};

function getDiscordFailureStatusCode(error: unknown): number | null {
  if (!(error instanceof Error)) {
    return null;
  }

  const match = error.message.match(
    /^Discord notification failed:\s+(\d{3})\b/,
  );

  if (!match) {
    return null;
  }

  const statusCode = Number.parseInt(match[1] ?? "", 10);

  return Number.isFinite(statusCode) ? statusCode : null;
}

export function shouldRetryQueuedNotificationError(input: {
  attempt: number;
  error: unknown;
  maxAttempts: number;
}): boolean {
  if (input.attempt >= input.maxAttempts) {
    return false;
  }

  const statusCode = getDiscordFailureStatusCode(input.error);

  if (statusCode === null) {
    return true;
  }

  if (statusCode === 429 || statusCode >= 500) {
    return true;
  }

  return false;
}

function buildDiscordMessagePayload(
  alert: WatchAlert,
  rule: WatchRuleContext | undefined,
): DiscordMessagePayload {
  const appBaseUrl =
    process.env.APP_BASE_URL?.trim() || "http://localhost:3000";
  const presentation = buildDiscordAlertMessagePayload({
    appBaseUrl,
    itemSlug: rule?.itemSlug ?? alert.itemSlug,
    lastSeen: alert.lastSeen,
    observedAt: alert.observedAt,
    platinum: alert.platinum,
    ruleId: alert.ruleId,
    sellerName: alert.sellerName,
    status: alert.status,
    ...(rule ? { targetPlatinum: rule.maxPlatinum } : {}),
  });
  const card = Card({
    title: presentation.title,
    children: [
      CardText(presentation.description),
      Fields(
        presentation.fields.map((field) =>
          Field({
            label: field.label,
            value: field.value,
          }),
        ),
      ),
      Actions(
        presentation.actions.map((action) =>
          LinkButton({
            label: action.label,
            url: action.url,
          }),
        ),
      ),
    ],
  });
  const { components, embeds } = cardToDiscordPayload(card);

  return {
    allowed_mentions: {
      parse: [],
    },
    components,
    embeds: embeds.map((embed) => ({
      ...embed,
      color: DISCORD_ALERT_COLOR,
      fields: [
        ...(((embed.fields as Array<Record<string, unknown>> | undefined) ??
          []) as Array<Record<string, unknown>>),
        {
          inline: false,
          name: "Trade Message",
          value: `\`\`\`\n${presentation.tradeMessage}\n\`\`\``,
        },
      ],
    })),
  };
}

function hasDiscordSettings(
  settings: UserSettings | null,
): settings is CompleteDiscordSettings {
  return Boolean(
    settings?.discordEnabled &&
    settings.discordBotToken?.trim() &&
    settings.discordChannelId?.trim(),
  );
}

export async function sendDiscordNotifications(input: {
  alerts: WatchAlert[];
  fetchImplementation?: FetchLike;
  requestTimeoutMs?: number;
  settings: UserSettings | null;
  sleep?: (ms: number) => Promise<void>;
  watchRulesById?: Record<string, WatchRuleContext>;
}): Promise<void> {
  if (input.alerts.length === 0 || !hasDiscordSettings(input.settings)) {
    return;
  }

  const fetchImplementation = input.fetchImplementation ?? fetch;
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (const [index, alert] of input.alerts.entries()) {
    const rule = input.watchRulesById?.[alert.ruleId];
    const messagePayload = buildDiscordMessagePayload(alert, rule);

    await postDiscordMessage({
      fetchImplementation,
      maxAttempts: 4,
      messagePayload,
      settings: input.settings,
      sleep,
      ...(input.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: input.requestTimeoutMs }
        : {}),
    });

    if (index < input.alerts.length - 1) {
      await sleep(DISCORD_BATCH_SPACING_MS);
    }
  }
}

export function createDiscordNotificationQueue<TInput>(
  sendNotifications: (input: TInput) => Promise<unknown> | unknown,
  options?: {
    maxRetryAttempts?: number;
    retryDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): DiscordNotificationQueue<TInput> {
  type QueueEntry = {
    attempt: number;
    input: TInput;
    resolve: () => void;
  };

  const pending: QueueEntry[] = [];
  let pumping = false;
  let idleResolvers: Array<() => void> = [];
  const maxRetryAttempts =
    options?.maxRetryAttempts ?? DISCORD_QUEUE_MAX_RETRY_ATTEMPTS;
  const retryDelayMs = options?.retryDelayMs ?? DISCORD_QUEUE_RETRY_DELAY_MS;
  const sleep =
    options?.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  function resolveIdleWaiters() {
    if (pending.length > 0 || pumping) {
      return;
    }

    const resolvers = idleResolvers;
    idleResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  async function pump() {
    if (pumping) {
      return;
    }

    pumping = true;

    try {
      while (pending.length > 0) {
        const entry = pending.shift();

        if (!entry) {
          continue;
        }

        try {
          await sendNotifications(entry.input);
          entry.resolve();
        } catch (error) {
          if (
            shouldRetryQueuedNotificationError({
              attempt: entry.attempt,
              error,
              maxAttempts: maxRetryAttempts,
            })
          ) {
            console.error(
              "[worker] failed to send Discord notifications",
              error,
            );
            pending.unshift({
              ...entry,
              attempt: entry.attempt + 1,
            });
            await sleep(retryDelayMs);
            continue;
          }

          console.error(
            "[worker] dropping Discord notification after final failure",
            error,
          );
          entry.resolve();
        }
      }
    } finally {
      pumping = false;
      resolveIdleWaiters();
    }
  }

  return {
    enqueue(input: TInput) {
      let resolve!: () => void;
      const promise = new Promise<void>((promiseResolve) => {
        resolve = promiseResolve;
      });

      pending.push({ attempt: 1, input, resolve });
      void pump();

      return promise;
    },
    pendingDepth() {
      return pending.length + (pumping ? 1 : 0);
    },
    whenIdle() {
      if (pending.length === 0 && !pumping) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      });
    },
  };
}
