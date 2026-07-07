import { describe, expect, it } from "bun:test";

import {
  MarketClient,
  MarketClientNetworkError,
  type FetchLike,
} from "../src/index";

describe("MarketClient", () => {
  it("requests item orders with the required marketplace headers", async () => {
    const calls: Array<{ input: string; init: RequestInit | undefined }> = [];
    const fetchMock: FetchLike = async (input, init) => {
      calls.push({ init, input: String(input) });

      return new Response(
        JSON.stringify({
          data: [
            {
              id: "order-1",
              itemId: "item-1",
              platinum: 9,
              quantity: 1,
              rank: 0,
              type: "sell",
              updatedAt: "2026-03-21T00:00:00Z",
              user: {
                id: "seller-1",
                ingameName: "vash2000",
                lastSeen: "2026-03-21T00:00:00Z",
                slug: "vash2000",
                status: "offline",
              },
              visible: true,
            },
          ],
          error: null,
        }),
        {
          status: 200,
        },
      );
    };

    const client = new MarketClient({
      baseUrl: "https://api.warframe.market/v2",
      crossplay: true,
      fetch: fetchMock,
      language: "en",
      platform: "pc",
    });

    const result = await client.getItemOrders("arcane_barrier");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe(
      "https://api.warframe.market/v2/orders/item/arcane_barrier",
    );
    expect(calls[0]?.init).toEqual(
      expect.objectContaining({
        headers: {
          crossplay: "true",
          language: "en",
          platform: "pc",
        },
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.platinum).toBe(9);
  });

  it("throws a helpful error when the marketplace returns a non-OK response", async () => {
    const client = new MarketClient({
      baseUrl: "https://api.warframe.market/v2",
      crossplay: true,
      fetch: async () =>
        new Response(JSON.stringify({ error: "too many requests" }), {
          status: 429,
          statusText: "Too Many Requests",
        }),
      language: "en",
      platform: "pc",
    });

    await expect(client.getItemOrders("arcane_barrier")).rejects.toEqual(
      expect.objectContaining({
        message: "warframe.market request failed: 429 Too Many Requests",
        status: 429,
        statusText: "Too Many Requests",
      }),
    );
  });

  it("times out a stalled marketplace request", async () => {
    const client = new MarketClient({
      baseUrl: "https://api.warframe.market/v2",
      crossplay: true,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(
              init.signal?.reason ?? new DOMException("Aborted", "AbortError"),
            );
          });
        }),
      language: "en",
      platform: "pc",
      requestTimeoutMs: 5,
    });

    await expect(client.getItemOrders("arcane_barrier")).rejects.toEqual(
      expect.objectContaining({
        message: "warframe.market request timed out after 5ms",
        name: "MarketClientTimeoutError",
      }),
    );
  });

  it("wraps low-level fetch failures in a typed market network error", async () => {
    const client = new MarketClient({
      baseUrl: "https://api.warframe.market/v2",
      crossplay: true,
      fetch: async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("read ECONNRESET"), {
            code: "ECONNRESET",
          }),
        });
      },
      language: "en",
      platform: "pc",
    });

    try {
      await client.getItemOrders("arcane_barrier");
      throw new Error("expected getItemOrders to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MarketClientNetworkError);
      expect((error as MarketClientNetworkError).name).toBe(
        "MarketClientNetworkError",
      );
      expect((error as MarketClientNetworkError).message).toBe(
        "warframe.market network request failed",
      );
      expect((error as MarketClientNetworkError).code).toBe("ECONNRESET");
      expect((error as MarketClientNetworkError).cause).toBeInstanceOf(
        TypeError,
      );
      expect(
        ((error as MarketClientNetworkError).cause as { cause?: unknown })
          .cause,
      ).toEqual(
        expect.objectContaining({
          code: "ECONNRESET",
        }),
      );
    }
  });

  it("lists catalog items with readable names and thumbs", async () => {
    const client = new MarketClient({
      baseUrl: "https://api.warframe.market/v2",
      crossplay: true,
      fetch: async (input, init) => {
        expect(String(input)).toBe("https://api.warframe.market/v2/items");
        expect(init).toEqual(
          expect.objectContaining({
            headers: {
              crossplay: "true",
              language: "en",
              platform: "pc",
            },
            method: "GET",
            signal: expect.any(AbortSignal),
          }),
        );

        return new Response(
          JSON.stringify({
            data: [
              {
                slug: "primed_continuity",
                i18n: {
                  en: {
                    name: "Primed Continuity",
                    thumb: "items/thumbs/primed_continuity.png",
                  },
                },
              },
              {
                slug: "broken_item",
                i18n: {
                  en: {},
                },
              },
            ],
            error: null,
          }),
          { status: 200 },
        );
      },
      language: "en",
      platform: "pc",
    });

    await expect(client.listItems()).resolves.toEqual([
      {
        name: "Primed Continuity",
        slug: "primed_continuity",
        thumb: "items/thumbs/primed_continuity.png",
      },
    ]);
  });
});
