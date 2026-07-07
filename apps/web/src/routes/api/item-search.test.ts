import { describe, expect, it } from "bun:test";

import {
  MarketClientError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

import { createItemSearchHandler } from "~/lib/item-search-route";

describe("createItemSearchHandler", () => {
  it("rejects queries shorter than two characters", async () => {
    const response = await createItemSearchHandler({
      getItems: async () => [],
    })({
      request: new Request("http://localhost/api/item-search?q=a"),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Search query must be at least 2 characters",
    });
  });

  it("trims the incoming query and returns a stable item shape", async () => {
    const response = await createItemSearchHandler({
      getItems: async () => [
        {
          name: "Primed Continuity",
          slug: "primed_continuity",
          thumb: "primed_continuity.png",
        },
      ],
    })({
      request: new Request("http://localhost/api/item-search?q=%20primed%20"),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          name: "Primed Continuity",
          slug: "primed_continuity",
          thumb: "primed_continuity.png",
        },
      ],
    });
  });

  it("honors a custom result limit", async () => {
    const response = await createItemSearchHandler({
      getItems: async () => [
        {
          name: "Primed Continuity",
          slug: "primed_continuity",
          thumb: "primed_continuity.png",
        },
        {
          name: "Primed Flow",
          slug: "primed_flow",
          thumb: "primed_flow.png",
        },
      ],
    })({
      request: new Request("http://localhost/api/item-search?q=primed&limit=1"),
    });

    await expect(response.json()).resolves.toEqual({
      items: [
        {
          name: "Primed Continuity",
          slug: "primed_continuity",
          thumb: "primed_continuity.png",
        },
      ],
    });
  });

  it("returns a structured 503 when the catalog cannot be loaded yet", async () => {
    const response = await createItemSearchHandler({
      getItems: async () => {
        throw new MarketClientTimeoutError(10_000);
      },
    })({
      request: new Request("http://localhost/api/item-search?q=primed"),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Market data timed out upstream. Try again shortly.",
    });
  });

  it("returns a structured 503 when the catalog is rate limited upstream", async () => {
    const response = await createItemSearchHandler({
      getItems: async () => {
        throw new MarketClientError(429, "Too Many Requests");
      },
    })({
      request: new Request("http://localhost/api/item-search?q=primed"),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error:
        "Market data is temporarily rate limited upstream. Try again shortly.",
    });
  });

  it("rethrows unexpected item search failures", async () => {
    const handler = createItemSearchHandler({
      getItems: async () => {
        throw new Error("buggy cache");
      },
    });

    await expect(
      handler({
        request: new Request("http://localhost/api/item-search?q=primed"),
      }),
    ).rejects.toThrow("buggy cache");
  });
});
