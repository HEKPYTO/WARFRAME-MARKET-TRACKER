export type DiscordPostSettings = {
  discordBotToken: string;
  discordChannelId: string;
};

type DiscordApiRateLimitResponse = {
  global?: unknown;
  message?: unknown;
  retry_after?: unknown;
};

export type FetchLike = (
  input: string,
  init?: {
    body?: string;
    headers?: Record<string, string>;
    method?: string;
    signal?: AbortSignal;
  },
) => Promise<Response>;

const DEFAULT_DISCORD_REQUEST_TIMEOUT_MS = 10_000;
const DISCORD_MESSAGE_ENDPOINT = "https://discord.com/api/v10/channels";

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(
        `Discord notification failed: request timed out after ${timeoutMs}ms`,
      ),
    );
  }, timeoutMs);

  return {
    cleanup() {
      clearTimeout(timeoutId);
    },
    signal: controller.signal,
  };
}

function isDiscordRateLimitResponse(
  value: unknown,
): value is DiscordApiRateLimitResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "retry_after" in value;
}

async function getDiscordResponseDetails(response: Response): Promise<{
  detailText: string;
  retryDelayMs: number | null;
}> {
  const fallbackDetail = await response.clone().text();
  let detailText = fallbackDetail;
  let retryDelayMs: number | null = null;

  try {
    const body = (await response.json()) as unknown;

    if (
      typeof body === "object" &&
      body !== null &&
      Object.keys(body).length > 0
    ) {
      detailText = JSON.stringify(body);
    }

    if (response.status !== 429 || !isDiscordRateLimitResponse(body)) {
      return { detailText, retryDelayMs };
    }

    const retryAfterSeconds =
      typeof body.retry_after === "number" ? body.retry_after : null;

    if (retryAfterSeconds === null || !Number.isFinite(retryAfterSeconds)) {
      retryDelayMs = 1_000;
    } else {
      retryDelayMs = Math.ceil(retryAfterSeconds * 1_000);
    }

    return { detailText, retryDelayMs };
  } catch {
    return {
      detailText,
      retryDelayMs: response.status === 429 ? 1_000 : null,
    };
  }
}

export async function postDiscordMessage(input: {
  fetchImplementation?: FetchLike;
  maxAttempts?: number;
  messagePayload: unknown;
  requestTimeoutMs?: number;
  settings: DiscordPostSettings;
  sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const maxAttempts = input.maxAttempts ?? 1;
  const requestTimeoutMs =
    input.requestTimeoutMs ?? DEFAULT_DISCORD_REQUEST_TIMEOUT_MS;
  const sleep =
    input.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const { cleanup, signal } = createTimeoutSignal(requestTimeoutMs);
    let response: Response;

    try {
      response = await fetchImplementation(
        `${DISCORD_MESSAGE_ENDPOINT}/${input.settings.discordChannelId}/messages`,
        {
          body: JSON.stringify(input.messagePayload),
          headers: {
            Authorization: `Bot ${input.settings.discordBotToken}`,
            "Content-Type": "application/json",
            "User-Agent":
              "WarframeMarketTracker (https://github.com/tsun/WARFRAME-MARKET-TRACKER, 1.0.0)",
          },
          method: "POST",
          signal,
        },
      );
    } catch (error) {
      if (signal.aborted) {
        throw new Error(
          `Discord notification failed: request timed out after ${requestTimeoutMs}ms`,
        );
      }

      throw error;
    } finally {
      cleanup();
    }

    if (response.ok) {
      return;
    }

    const { detailText, retryDelayMs } =
      await getDiscordResponseDetails(response);

    if (attempt === maxAttempts - 1 || retryDelayMs === null) {
      throw new Error(
        `Discord notification failed: ${response.status} ${detailText}`,
      );
    }

    await sleep(retryDelayMs);
  }
}
