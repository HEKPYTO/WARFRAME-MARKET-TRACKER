import { describe, expect, it } from "bun:test";

import type { MarketOrder } from "@warframe-market-tracker/alert-engine";

import {
  getLowestVisibleSellPrice,
  listVisibleSellOrders,
} from "./market-orders";

function createSellOrder(input: {
  platinum: number;
  rank?: number;
  status?: MarketOrder["user"]["status"];
  visible?: boolean;
}): MarketOrder {
  return {
    id: `order-${input.platinum}-${input.rank ?? 0}`,
    itemId: "item-1",
    platinum: input.platinum,
    quantity: 1,
    rank: input.rank ?? 0,
    type: "sell",
    updatedAt: "2026-04-01T00:00:00.000Z",
    user: {
      id: `seller-${input.platinum}-${input.rank ?? 0}`,
      ingameName: `seller-${input.platinum}`,
      lastSeen: "2026-04-01T00:00:00.000Z",
      slug: `seller-${input.platinum}`,
      status: input.status ?? "online",
    },
    visible: input.visible ?? true,
  };
}

describe("listVisibleSellOrders", () => {
  it("ignores ranked sell orders when building the unranked market view", () => {
    expect(
      listVisibleSellOrders([
        createSellOrder({ platinum: 5, rank: 5 }),
        createSellOrder({ platinum: 9 }),
        createSellOrder({ platinum: 7 }),
      ]),
    ).toEqual([
      expect.objectContaining({
        platinum: 7,
        rank: 0,
      }),
      expect.objectContaining({
        platinum: 9,
        rank: 0,
      }),
    ]);
  });

  it("treats missing rank as an unranked sell order", () => {
    expect(
      listVisibleSellOrders([
        {
          ...createSellOrder({ platinum: 6 }),
          rank: undefined as unknown as number,
        },
        createSellOrder({ platinum: 9, rank: 3 }),
      ]),
    ).toEqual([
      expect.objectContaining({
        platinum: 6,
      }),
    ]);
  });
});

describe("getLowestVisibleSellPrice", () => {
  it("derives the default threshold from the lowest visible unranked sell order", () => {
    expect(
      getLowestVisibleSellPrice([
        createSellOrder({ platinum: 4, rank: 10 }),
        createSellOrder({ platinum: 8, visible: false }),
        createSellOrder({ platinum: 9 }),
      ]),
    ).toBe(9);
  });

  it("uses missing-rank sell orders when no explicit rank is present", () => {
    expect(
      getLowestVisibleSellPrice([
        {
          ...createSellOrder({ platinum: 7 }),
          rank: undefined as unknown as number,
        },
      ]),
    ).toBe(7);
  });
});
