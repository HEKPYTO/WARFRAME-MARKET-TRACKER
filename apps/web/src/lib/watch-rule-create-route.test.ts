import { describe, expect, it, mock } from "bun:test";

import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import {
  MarketClientError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

import { createCreateWatchRuleHandler } from "./watch-rule-create-route";

function createSellOrder(input: {
  platinum: number;
  status: "ingame" | "offline" | "online";
  visible?: boolean;
  type?: "buy" | "sell";
}): MarketOrder {
  return {
    id: `order-${input.platinum}-${input.status}`,
    itemId: "item-1",
    platinum: input.platinum,
    quantity: 1,
    rank: 0,
    type: input.type ?? "sell",
    updatedAt: "2026-03-23T00:00:00.000Z",
    user: {
      id: `seller-${input.platinum}-${input.status}`,
      ingameName: `seller-${input.status}`,
      lastSeen: "2026-03-23T00:00:00.000Z",
      slug: `seller-${input.status}`,
      status: input.status,
    },
    visible: input.visible ?? true,
  };
}

describe("createCreateWatchRuleHandler", () => {
  it("uses the lowest visible sell price across all market statuses when maxPlatinum is omitted", async () => {
    const createWatchRule = mock(
      async (input: {
        crossplay: boolean;
        itemSlug: string;
        maxPlatinum: number;
        platform: "pc";
      }) => ({
        createdAt: "2026-03-23T00:00:00.000Z",
        crossplay: input.crossplay,
        enabled: true,
        id: "rule-1",
        itemSlug: input.itemSlug,
        maxPlatinum: input.maxPlatinum,
        platform: input.platform,
        sortOrder: 1,
        updatedAt: "2026-03-23T00:00:00.000Z",
        userId: "local-demo-user",
      }),
    );
    const listItemOrders = mock(async () => [
      createSellOrder({ platinum: 18, status: "online" }),
      createSellOrder({ platinum: 9, status: "offline" }),
      createSellOrder({ platinum: 12, status: "ingame" }),
      createSellOrder({ platinum: 4, status: "online", type: "buy" }),
      createSellOrder({ platinum: 3, status: "online", visible: false }),
    ]);

    const response = await createCreateWatchRuleHandler({
      createWatchRule,
      listItemOrders,
      validateTrackableItemSlug: async () => undefined,
    })({
      request: new Request("http://localhost/api/watch-rules", {
        body: JSON.stringify({ itemSlug: "arcane_barrier" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(201);
    expect(listItemOrders).toHaveBeenCalledWith("arcane_barrier");
    expect(createWatchRule).toHaveBeenCalledWith({
      crossplay: true,
      itemSlug: "arcane_barrier",
      maxPlatinum: 9,
      platform: "pc",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        itemSlug: "arcane_barrier",
        maxPlatinum: 9,
      }),
    );
  });

  it("falls back to zero when no visible sell orders exist", async () => {
    const createWatchRule = mock(
      async (input: {
        crossplay: boolean;
        itemSlug: string;
        maxPlatinum: number;
        platform: "pc";
      }) => ({
        createdAt: "2026-03-23T00:00:00.000Z",
        crossplay: input.crossplay,
        enabled: true,
        id: "rule-1",
        itemSlug: input.itemSlug,
        maxPlatinum: input.maxPlatinum,
        platform: input.platform,
        sortOrder: 1,
        updatedAt: "2026-03-23T00:00:00.000Z",
        userId: "local-demo-user",
      }),
    );

    const response = await createCreateWatchRuleHandler({
      createWatchRule,
      listItemOrders: async () => [
        createSellOrder({ platinum: 4, status: "online", visible: false }),
        createSellOrder({ platinum: 5, status: "offline", type: "buy" }),
      ],
      validateTrackableItemSlug: async () => undefined,
    })({
      request: new Request("http://localhost/api/watch-rules", {
        body: JSON.stringify({ itemSlug: "arcane_barrier" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(201);
    expect(createWatchRule).toHaveBeenCalledWith({
      crossplay: true,
      itemSlug: "arcane_barrier",
      maxPlatinum: 0,
      platform: "pc",
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        itemSlug: "arcane_barrier",
        maxPlatinum: 0,
      }),
    );
  });

  it("uses a single upstream lookup when maxPlatinum is omitted", async () => {
    const createWatchRule = mock(
      async (input: {
        crossplay: boolean;
        itemSlug: string;
        maxPlatinum: number;
        platform: "pc";
      }) => ({
        createdAt: "2026-03-23T00:00:00.000Z",
        crossplay: input.crossplay,
        enabled: true,
        id: "rule-1",
        itemSlug: input.itemSlug,
        maxPlatinum: input.maxPlatinum,
        platform: input.platform,
        sortOrder: 1,
        updatedAt: "2026-03-23T00:00:00.000Z",
        userId: "local-demo-user",
      }),
    );
    let marketLookups = 0;

    const response = await createCreateWatchRuleHandler({
      createWatchRule,
      listItemOrders: async () => {
        marketLookups += 1;

        return [createSellOrder({ platinum: 9, status: "online" })];
      },
      validateTrackableItemSlug: async () => {
        marketLookups += 1;

        return [createSellOrder({ platinum: 9, status: "online" })];
      },
    })({
      request: new Request("http://localhost/api/watch-rules", {
        body: JSON.stringify({ itemSlug: "arcane_barrier" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(201);
    expect(marketLookups).toBe(1);
  });

  it("returns a structured 503 when the fallback default-price lookup times out", async () => {
    const response = await createCreateWatchRuleHandler({
      createWatchRule: mock(async () => {
        throw new Error("should not create rule");
      }),
      listItemOrders: async () => {
        throw new MarketClientTimeoutError(5_000);
      },
      validateTrackableItemSlug: async () => undefined,
    })({
      request: new Request("http://localhost/api/watch-rules", {
        body: JSON.stringify({ itemSlug: "arcane_barrier" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Market data timed out upstream. Try again shortly.",
    });
  });

  it("returns a structured 502 when the fallback default-price lookup fails upstream", async () => {
    const response = await createCreateWatchRuleHandler({
      createWatchRule: mock(async () => {
        throw new Error("should not create rule");
      }),
      listItemOrders: async () => {
        throw new MarketClientError(503, "Service Unavailable");
      },
      validateTrackableItemSlug: async () => undefined,
    })({
      request: new Request("http://localhost/api/watch-rules", {
        body: JSON.stringify({ itemSlug: "arcane_barrier" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Market data is temporarily unavailable upstream. Try again shortly.",
    });
  });
});
