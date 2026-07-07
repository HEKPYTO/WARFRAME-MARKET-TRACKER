import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
export {
  getRuntimeConfig,
  getTrackedItemPollingIntervalMs,
  type RuntimeConfig,
} from "./runtime-config";

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface MarketClientOptions {
  baseUrl: string;
  crossplay: boolean;
  fetch?: FetchLike;
  language: string;
  platform: string;
  requestTimeoutMs?: number;
}

export interface ItemCatalogEntry {
  name: string;
  slug: string;
  thumb: string | null;
}

export class MarketClientError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`warframe.market request failed: ${status} ${statusText}`);
    this.name = "MarketClientError";
  }
}

export class MarketClientTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`warframe.market request timed out after ${timeoutMs}ms`);
    this.name = "MarketClientTimeoutError";
  }
}

export class MarketClientNetworkError extends Error {
  constructor(
    readonly cause: unknown,
    readonly code?: string,
  ) {
    super("warframe.market network request failed");
    this.name = "MarketClientNetworkError";
  }
}

const DEFAULT_MARKET_REQUEST_TIMEOUT_MS = 10_000;

function createTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new MarketClientTimeoutError(timeoutMs));
  }, timeoutMs);

  return {
    cleanup() {
      clearTimeout(timeoutId);
    },
    signal: controller.signal,
  };
}

export class MarketClient {
  constructor(private readonly options: MarketClientOptions) {}

  private getRequestTimeoutMs() {
    return this.options.requestTimeoutMs ?? DEFAULT_MARKET_REQUEST_TIMEOUT_MS;
  }

  private async fetchJson(input: string) {
    const timeoutMs = this.getRequestTimeoutMs();
    const { cleanup, signal } = createTimeoutSignal(timeoutMs);

    try {
      return await (this.options.fetch ?? fetch)(input, {
        headers: {
          crossplay: String(this.options.crossplay),
          language: this.options.language,
          platform: this.options.platform,
        },
        method: "GET",
        signal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw new MarketClientTimeoutError(timeoutMs);
      }

      throw new MarketClientNetworkError(
        error,
        typeof (error as { code?: unknown })?.code === "string"
          ? (error as { code: string }).code
          : typeof (error as { cause?: { code?: unknown } })?.cause?.code ===
              "string"
            ? (error as { cause: { code: string } }).cause.code
            : undefined,
      );
    } finally {
      cleanup();
    }
  }

  async listItems(): Promise<ItemCatalogEntry[]> {
    const response = await this.fetchJson(
      new URL("items", `${this.options.baseUrl}/`).toString(),
    );

    if (!response.ok) {
      throw new MarketClientError(response.status, response.statusText);
    }

    const payload = (await response.json()) as {
      data: Array<{
        i18n?: {
          en?: {
            name?: string;
            thumb?: string;
          };
        };
        slug?: string;
      }>;
    };

    return payload.data.flatMap((item) => {
      if (
        typeof item.slug !== "string" ||
        typeof item.i18n?.en?.name !== "string" ||
        item.i18n.en.name.length === 0
      ) {
        return [];
      }

      return [
        {
          name: item.i18n.en.name,
          slug: item.slug,
          thumb:
            typeof item.i18n.en.thumb === "string" ? item.i18n.en.thumb : null,
        },
      ];
    });
  }

  async getItemOrders(itemSlug: string): Promise<MarketOrder[]> {
    const requestUrl = new URL(
      `orders/item/${itemSlug}`,
      `${this.options.baseUrl}/`,
    );
    const response = await this.fetchJson(requestUrl.toString());

    if (!response.ok) {
      throw new MarketClientError(response.status, response.statusText);
    }

    const payload = (await response.json()) as { data: MarketOrder[] };
    return payload.data;
  }
}
