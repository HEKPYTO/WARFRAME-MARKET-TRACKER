import { describe, expect, it } from "bun:test";

import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";

import {
  buildSetPricingBreakdown,
  estimateSupportedSetPartPrice,
  getSetPartCatalogEntries,
} from "./set-pricing";

function createCatalogEntry(slug: string, name: string): ItemCatalogEntry {
  return {
    name,
    slug,
    thumb: null,
  };
}

function createSellOrder(
  price: number,
  status: MarketOrder["user"]["status"] = "online",
): MarketOrder {
  return {
    id: `${status}-${price}-${Math.random()}`,
    itemId: "item-1",
    platinum: price,
    quantity: 1,
    rank: 0,
    type: "sell",
    updatedAt: "2026-03-29T00:00:00.000Z",
    user: {
      id: `${status}-${price}-${Math.random()}`,
      ingameName: `${status}-${price}`,
      lastSeen: "2026-03-29T00:00:00.000Z",
      slug: `${status}-${price}`,
      status,
    },
    visible: true,
  };
}

describe("getSetPartCatalogEntries", () => {
  it("derives part items from a tracked set entry", () => {
    const catalog = [
      createCatalogEntry("mesa_prime_set", "Mesa Prime Set"),
      createCatalogEntry("mesa_prime_blueprint", "Mesa Prime Blueprint"),
      createCatalogEntry(
        "mesa_prime_neuroptics_blueprint",
        "Mesa Prime Neuroptics Blueprint",
      ),
      createCatalogEntry(
        "mesa_prime_chassis_blueprint",
        "Mesa Prime Chassis Blueprint",
      ),
      createCatalogEntry(
        "mesa_prime_systems_blueprint",
        "Mesa Prime Systems Blueprint",
      ),
      createCatalogEntry("saryn_prime_set", "Saryn Prime Set"),
    ];

    expect(getSetPartCatalogEntries("mesa_prime_set", catalog)).toEqual([
      createCatalogEntry("mesa_prime_blueprint", "Mesa Prime Blueprint"),
      createCatalogEntry(
        "mesa_prime_chassis_blueprint",
        "Mesa Prime Chassis Blueprint",
      ),
      createCatalogEntry(
        "mesa_prime_neuroptics_blueprint",
        "Mesa Prime Neuroptics Blueprint",
      ),
      createCatalogEntry(
        "mesa_prime_systems_blueprint",
        "Mesa Prime Systems Blueprint",
      ),
    ]);
  });

  it("returns an empty list for non-set items", () => {
    const catalog = [
      createCatalogEntry("mesa_prime_set", "Mesa Prime Set"),
      createCatalogEntry("arcane_barrier", "Arcane Barrier"),
    ];

    expect(getSetPartCatalogEntries("arcane_barrier", catalog)).toEqual([]);
  });
});

describe("estimateSupportedSetPartPrice", () => {
  it("ignores unsupported tank listings and uses the first exact price with strong support", () => {
    const estimate = estimateSupportedSetPartPrice([
      createSellOrder(1, "offline"),
      createSellOrder(1, "ingame"),
      createSellOrder(4, "offline"),
      createSellOrder(4, "offline"),
      createSellOrder(4, "offline"),
      createSellOrder(5, "offline"),
      createSellOrder(6, "offline"),
      createSellOrder(6, "offline"),
      createSellOrder(6, "offline"),
    ]);

    expect(estimate).toEqual({
      estimatedPrice: 4,
      variance: 2,
    });
  });

  it("includes all visible seller statuses when finding the first strongly supported price", () => {
    const estimate = estimateSupportedSetPartPrice([
      createSellOrder(1, "offline"),
      createSellOrder(6, "offline"),
      createSellOrder(7, "offline"),
      createSellOrder(7, "offline"),
      createSellOrder(8, "offline"),
      createSellOrder(9, "offline"),
      createSellOrder(9, "offline"),
      createSellOrder(9, "offline"),
    ]);

    expect(estimate).toEqual({
      estimatedPrice: 9,
      variance: 0,
    });
  });

  it("skips a weaker second price and uses the next equally supported cluster for variance", () => {
    const estimate = estimateSupportedSetPartPrice([
      createSellOrder(4, "offline"),
      createSellOrder(4, "online"),
      createSellOrder(4, "ingame"),
      createSellOrder(5, "offline"),
      createSellOrder(5, "online"),
      createSellOrder(6, "offline"),
      createSellOrder(6, "online"),
      createSellOrder(6, "ingame"),
    ]);

    expect(estimate).toEqual({
      estimatedPrice: 4,
      variance: 2,
    });
  });

  it("returns null when no exact price has strong enough support", () => {
    expect(
      estimateSupportedSetPartPrice([
        createSellOrder(1, "offline"),
        createSellOrder(19, "offline"),
        createSellOrder(19, "offline"),
        createSellOrder(20, "offline"),
        createSellOrder(20, "offline"),
      ]),
    ).toBeNull();
  });
});

describe("buildSetPricingBreakdown", () => {
  it("builds part estimates and set totals from the derived parts", async () => {
    const catalog = [
      createCatalogEntry("mesa_prime_set", "Mesa Prime Set"),
      createCatalogEntry("mesa_prime_blueprint", "Mesa Prime Blueprint"),
      createCatalogEntry(
        "mesa_prime_neuroptics_blueprint",
        "Mesa Prime Neuroptics Blueprint",
      ),
      createCatalogEntry(
        "mesa_prime_chassis_blueprint",
        "Mesa Prime Chassis Blueprint",
      ),
    ];

    const breakdown = await buildSetPricingBreakdown({
      catalog,
      itemSlug: "mesa_prime_set",
      listItemOrders: async (itemSlug) => {
        switch (itemSlug) {
          case "mesa_prime_blueprint":
            return [
              createSellOrder(1, "offline"),
              createSellOrder(1, "ingame"),
              createSellOrder(4, "offline"),
              createSellOrder(4, "offline"),
              createSellOrder(4, "offline"),
              createSellOrder(6, "offline"),
              createSellOrder(6, "offline"),
              createSellOrder(6, "offline"),
            ];
          case "mesa_prime_chassis_blueprint":
            return [
              createSellOrder(1, "offline"),
              createSellOrder(3, "offline"),
              createSellOrder(4, "offline"),
              createSellOrder(4, "offline"),
              createSellOrder(4, "offline"),
              createSellOrder(6, "offline"),
              createSellOrder(6, "offline"),
              createSellOrder(6, "offline"),
            ];
          case "mesa_prime_neuroptics_blueprint":
            return [
              createSellOrder(1, "offline"),
              createSellOrder(2, "offline"),
              createSellOrder(19, "offline"),
              createSellOrder(19, "offline"),
              createSellOrder(20, "offline"),
              createSellOrder(20, "offline"),
              createSellOrder(20, "offline"),
              createSellOrder(25, "offline"),
              createSellOrder(25, "offline"),
              createSellOrder(25, "offline"),
            ];
          default:
            return [];
        }
      },
    });

    expect(breakdown).toEqual({
      parts: [
        {
          estimatedPrice: 4,
          itemSlug: "mesa_prime_blueprint",
          name: "Mesa Prime Blueprint",
          variance: 2,
        },
        {
          estimatedPrice: 4,
          itemSlug: "mesa_prime_chassis_blueprint",
          name: "Mesa Prime Chassis Blueprint",
          variance: 2,
        },
        {
          estimatedPrice: 20,
          itemSlug: "mesa_prime_neuroptics_blueprint",
          name: "Mesa Prime Neuroptics Blueprint",
          variance: 5,
        },
      ],
      totalEstimatedPrice: 28,
      totalVariance: 9,
    });
  });

  it("keeps the workspace usable when a part lookup fails", async () => {
    const catalog = [
      createCatalogEntry("mesa_prime_set", "Mesa Prime Set"),
      createCatalogEntry("mesa_prime_blueprint", "Mesa Prime Blueprint"),
      createCatalogEntry(
        "mesa_prime_chassis_blueprint",
        "Mesa Prime Chassis Blueprint",
      ),
    ];

    const breakdown = await buildSetPricingBreakdown({
      catalog,
      itemSlug: "mesa_prime_set",
      listItemOrders: async (itemSlug) => {
        if (itemSlug === "mesa_prime_blueprint") {
          throw new Error("upstream failed");
        }

        return [createSellOrder(12, "online"), createSellOrder(12, "online")];
      },
    });

    expect(breakdown).toEqual({
      parts: [
        {
          estimatedPrice: null,
          itemSlug: "mesa_prime_blueprint",
          name: "Mesa Prime Blueprint",
          variance: null,
        },
        {
          estimatedPrice: null,
          itemSlug: "mesa_prime_chassis_blueprint",
          name: "Mesa Prime Chassis Blueprint",
          variance: null,
        },
      ],
      totalEstimatedPrice: null,
      totalVariance: null,
    });
  });
});
