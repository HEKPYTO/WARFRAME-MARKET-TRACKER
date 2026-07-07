import { describe, expect, it } from "bun:test";

import type { MarketOrder } from "@warframe-market-tracker/alert-engine";
import type { ItemCatalogEntry } from "@warframe-market-tracker/market-client";

import {
  buildPrimeWarframeGraphRows,
  getPrimeWarframeGraphPrice,
  listPrimeWarframeSetEntries,
} from "./prime-warframe-price-graph-lib";

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
    updatedAt: "2026-03-30T00:00:00.000Z",
    user: {
      id: `${status}-${price}-${Math.random()}`,
      ingameName: `${status}-${price}`,
      lastSeen: "2026-03-30T00:00:00.000Z",
      slug: `${status}-${price}`,
      status,
    },
    visible: true,
  };
}

describe("listPrimeWarframeSetEntries", () => {
  it("keeps only prime warframe sets with the expected blueprint parts", () => {
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
      createCatalogEntry("braton_prime_set", "Braton Prime Set"),
      createCatalogEntry("braton_prime_barrel", "Braton Prime Barrel"),
      createCatalogEntry("braton_prime_blueprint", "Braton Prime Blueprint"),
      createCatalogEntry("braton_prime_receiver", "Braton Prime Receiver"),
      createCatalogEntry("braton_prime_stock", "Braton Prime Stock"),
    ];

    expect(listPrimeWarframeSetEntries(catalog)).toEqual([
      createCatalogEntry("mesa_prime_set", "Mesa Prime Set"),
    ]);
  });
});

describe("buildPrimeWarframeGraphRows", () => {
  it("sorts rows by prime release order", () => {
    expect(
      buildPrimeWarframeGraphRows([
        {
          name: "Volt Prime",
          partEstimatedTotal: 105,
          setPrice: 65,
        },
        {
          name: "Mesa Prime",
          partEstimatedTotal: 40,
          setPrice: 55,
        },
        {
          name: "Saryn Prime",
          partEstimatedTotal: 80,
          setPrice: 78,
        },
      ]),
    ).toEqual([
      {
        absoluteGap: 40,
        name: "Volt Prime",
        partEstimatedTotal: 105,
        setPrice: 65,
      },
      {
        absoluteGap: 2,
        name: "Saryn Prime",
        partEstimatedTotal: 80,
        setPrice: 78,
      },
      {
        absoluteGap: 15,
        name: "Mesa Prime",
        partEstimatedTotal: 40,
        setPrice: 55,
      },
    ]);
  });

  it("places Voruna Prime after Gyre Prime but before unknown future primes", () => {
    expect(
      buildPrimeWarframeGraphRows([
        {
          name: "Future Prime",
          partEstimatedTotal: 90,
          setPrice: 85,
        },
        {
          name: "Voruna Prime",
          partEstimatedTotal: 75,
          setPrice: 60,
        },
        {
          name: "Gyre Prime",
          partEstimatedTotal: 55,
          setPrice: 50,
        },
      ]).map((row) => row.name),
    ).toEqual(["Gyre Prime", "Voruna Prime", "Future Prime"]);
  });
});

describe("getPrimeWarframeGraphPrice", () => {
  it("returns a supported 1p cluster using individual part pricing semantics", () => {
    expect(
      getPrimeWarframeGraphPrice([
        createSellOrder(1, "offline"),
        createSellOrder(1, "online"),
        createSellOrder(1, "ingame"),
        createSellOrder(4, "online"),
      ]),
    ).toBe(1);
  });
});
