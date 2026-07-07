import { describe, expect, it } from "bun:test";

import {
  evaluateWatchRule,
  type MarketOrder,
  type SellerObservation,
  type WatchRule,
} from "../src/index";

const baseRule: WatchRule = {
  crossplay: true,
  id: "rule-1",
  itemSlug: "arcane_barrier",
  maxPlatinum: 10,
  platform: "pc",
};

function createOrder(overrides: Partial<MarketOrder>): MarketOrder {
  return {
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
    ...overrides,
  };
}

describe("evaluateWatchRule", () => {
  it("creates an alert when a previously offline qualifying seller becomes ingame", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:00:00Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "offline",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:05:00Z",
      orders: [
        createOrder({
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:05:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([
      {
        itemSlug: "arcane_barrier",
        lastSeen: "2026-03-21T00:05:00.000Z",
        observedAt: "2026-03-21T00:05:00Z",
        platinum: 9,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "vash2000",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:05:00.000Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("does not create duplicate alerts while the same seller stays online in the same session", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:06:00Z",
      orders: [
        createOrder({
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:05:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:05:00.000Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("does not create duplicate alerts when an online seller heartbeat updates last seen", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:06:00Z",
      orders: [
        createOrder({
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:06:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:06:00.000Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("alerts again when the same seller lowers the price in the same session", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:06:00Z",
      orders: [
        createOrder({
          platinum: 7,
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:05:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([
      {
        itemSlug: "arcane_barrier",
        lastSeen: "2026-03-21T00:05:00.000Z",
        observedAt: "2026-03-21T00:06:00Z",
        platinum: 7,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "vash2000",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:05:00.000Z",
        platinum: 7,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("does not alert again when the same seller raises the price in the same session", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00Z",
        platinum: 7,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:06:00Z",
      orders: [
        createOrder({
          platinum: 9,
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:05:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:05:00.000Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("does not alert when a lower price is still offline in the same session", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "offline",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:06:00Z",
      orders: [
        createOrder({
          platinum: 7,
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:05:00Z",
            slug: "vash2000",
            status: "offline",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:05:00.000Z",
        platinum: 7,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "offline",
      },
    ]);
  });

  it("does not treat equivalent timestamp formats as a new session", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00.000Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:06:00Z",
      orders: [
        createOrder({
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:05:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual(previous);
  });

  it("drops sellers that stop qualifying by price or visibility", () => {
    const previous: SellerObservation[] = [
      {
        lastSeen: "2026-03-21T00:05:00Z",
        platinum: 9,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "offline",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-21T00:07:00Z",
      orders: [
        createOrder({
          platinum: 12,
          visible: false,
        }),
      ],
      previous,
      rule: baseRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual([]);
  });

  it("stores one observation per seller when multiple qualifying orders exist", () => {
    const result = evaluateWatchRule({
      now: "2026-03-21T00:07:00Z",
      orders: [
        createOrder({
          id: "order-1",
          platinum: 9,
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:07:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 7,
          user: {
            id: "seller-1",
            ingameName: "vash2000",
            lastSeen: "2026-03-21T00:07:00Z",
            slug: "vash2000",
            status: "ingame",
          },
        }),
      ],
      previous: [],
      rule: baseRule,
    });

    expect(result.alerts).toEqual([
      {
        itemSlug: "arcane_barrier",
        lastSeen: "2026-03-21T00:07:00.000Z",
        observedAt: "2026-03-21T00:07:00Z",
        platinum: 7,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "vash2000",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
    expect(result.observations).toEqual([
      {
        lastSeen: "2026-03-21T00:07:00.000Z",
        platinum: 7,
        sellerId: "seller-1",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("does not alert for a stale extreme outlier on an expensive item", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "gauss_prime_set",
      maxPlatinum: 35,
    };

    const result = evaluateWatchRule({
      now: "2026-03-26T13:08:09Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-25T20:16:14Z",
          user: {
            id: "seller-1",
            ingameName: "xpertenno",
            lastSeen: "2026-03-26T13:08:09Z",
            slug: "xpertenno",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 35,
          updatedAt: "2026-03-26T13:00:00Z",
          user: {
            id: "seller-2",
            ingameName: "lofivibe",
            lastSeen: "2026-03-26T02:03:52Z",
            slug: "lofivibe",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: expensiveRule,
    });

    expect(result.alerts).toEqual([]);
  });

  it("keeps a stale unsupported suspicious outlier pending across repeated polls", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "gauss_prime_set",
      maxPlatinum: 35,
    };
    const suspiciousOrder = createOrder({
      platinum: 1,
      updatedAt: "2026-03-25T20:16:14Z",
      user: {
        id: "seller-1",
        ingameName: "mimibost",
        lastSeen: "2026-03-27T04:30:00Z",
        slug: "mimibost",
        status: "ingame",
      },
    });
    const supportedCluster = [
      createOrder({
        id: "order-2",
        platinum: 35,
        updatedAt: "2026-03-27T00:38:00Z",
        user: {
          id: "seller-2",
          ingameName: "lofivibe",
          lastSeen: "2026-03-27T00:38:00Z",
          slug: "lofivibe",
          status: "offline",
        },
      }),
      createOrder({
        id: "order-3",
        platinum: 35,
        updatedAt: "2026-03-27T00:20:00Z",
        user: {
          id: "seller-3",
          ingameName: "gn1it",
          lastSeen: "2026-03-27T00:20:00Z",
          slug: "gn1it",
          status: "offline",
        },
      }),
      createOrder({
        id: "order-4",
        platinum: 35,
        updatedAt: "2026-03-27T03:26:00Z",
        user: {
          id: "seller-4",
          ingameName: "hijikata_718",
          lastSeen: "2026-03-27T03:26:00Z",
          slug: "hijikata_718",
          status: "offline",
        },
      }),
    ];

    const firstResult = evaluateWatchRule({
      now: "2026-03-27T04:30:05Z",
      orders: [suspiciousOrder, ...supportedCluster],
      previous: [],
      rule: expensiveRule,
    });

    expect(firstResult.alerts).toEqual([]);
    expect(firstResult.observations).toEqual([
      {
        alertState: "pending",
        lastSeen: "2026-03-27T04:30:00.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "mimibost",
        status: "ingame",
      },
      {
        lastSeen: "2026-03-27T00:38:00.000Z",
        platinum: 35,
        sellerId: "seller-2",
        sellerSlug: "lofivibe",
        status: "offline",
      },
      {
        lastSeen: "2026-03-27T00:20:00.000Z",
        platinum: 35,
        sellerId: "seller-3",
        sellerSlug: "gn1it",
        status: "offline",
      },
      {
        lastSeen: "2026-03-27T03:26:00.000Z",
        platinum: 35,
        sellerId: "seller-4",
        sellerSlug: "hijikata_718",
        status: "offline",
      },
    ]);

    const secondResult = evaluateWatchRule({
      now: "2026-03-27T04:30:35Z",
      orders: [suspiciousOrder, ...supportedCluster],
      previous: firstResult.observations,
      rule: expensiveRule,
    });

    expect(secondResult.alerts).toEqual([]);
    expect(secondResult.observations).toEqual([
      {
        alertState: "pending",
        lastSeen: "2026-03-27T04:30:00.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "mimibost",
        status: "ingame",
      },
      {
        lastSeen: "2026-03-27T00:38:00.000Z",
        platinum: 35,
        sellerId: "seller-2",
        sellerSlug: "lofivibe",
        status: "offline",
      },
      {
        lastSeen: "2026-03-27T00:20:00.000Z",
        platinum: 35,
        sellerId: "seller-3",
        sellerSlug: "gn1it",
        status: "offline",
      },
      {
        lastSeen: "2026-03-27T03:26:00.000Z",
        platinum: 35,
        sellerId: "seller-4",
        sellerSlug: "hijikata_718",
        status: "offline",
      },
    ]);
  });

  it("keeps a fresh unsupported suspicious outlier pending even after additional polls", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "mesa_prime_set",
      maxPlatinum: 36,
    };
    const suspiciousOrder = createOrder({
      platinum: 1,
      updatedAt: "2026-03-26T15:27:50Z",
      user: {
        id: "seller-1",
        ingameName: "bobrstylgoodgame",
        lastSeen: "2026-03-26T15:28:03Z",
        slug: "bobrstylgoodgame",
        status: "ingame",
      },
    });
    const comparisonOrder = createOrder({
      id: "order-2",
      platinum: 50,
      updatedAt: "2026-03-26T15:27:40Z",
      user: {
        id: "seller-2",
        ingameName: "sleepin-sheepin",
        lastSeen: "2026-03-26T02:50:32Z",
        slug: "sleepin-sheepin",
        status: "offline",
      },
    });

    const firstResult = evaluateWatchRule({
      now: "2026-03-26T15:28:03Z",
      orders: [suspiciousOrder, comparisonOrder],
      previous: [],
      rule: expensiveRule,
    });

    expect(firstResult.alerts).toEqual([]);
    expect(firstResult.observations).toEqual([
      {
        alertState: "pending",
        lastSeen: "2026-03-26T15:28:03.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "bobrstylgoodgame",
        status: "ingame",
      },
    ]);

    const secondResult = evaluateWatchRule({
      now: "2026-03-26T15:28:33Z",
      orders: [suspiciousOrder, comparisonOrder],
      previous: firstResult.observations,
      rule: expensiveRule,
    });

    expect(secondResult.alerts).toEqual([]);
    expect(secondResult.observations).toEqual([
      {
        alertState: "pending",
        lastSeen: "2026-03-26T15:28:03.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "bobrstylgoodgame",
        status: "ingame",
      },
    ]);
  });

  it("keeps a very fresh suspicious outlier pending across a second fast poll", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "khora_prime_neuroptics_blueprint",
      maxPlatinum: 21,
    };
    const suspiciousOrder = createOrder({
      platinum: 1,
      updatedAt: "2026-03-28T06:19:24Z",
      user: {
        id: "seller-1",
        ingameName: "GaDenged",
        lastSeen: "2026-03-28T06:19:30Z",
        slug: "gadenged",
        status: "ingame",
      },
    });
    const supportedCluster = [
      createOrder({
        id: "order-2",
        platinum: 20,
        updatedAt: "2026-03-28T06:15:00Z",
        user: {
          id: "seller-2",
          ingameName: "legendin69",
          lastSeen: "2026-03-28T06:15:00Z",
          slug: "legendin69",
          status: "offline",
        },
      }),
      createOrder({
        id: "order-3",
        platinum: 20,
        updatedAt: "2026-03-28T05:50:00Z",
        user: {
          id: "seller-3",
          ingameName: "knot_adm",
          lastSeen: "2026-03-28T05:50:00Z",
          slug: "knot_adm",
          status: "offline",
        },
      }),
      createOrder({
        id: "order-4",
        platinum: 20,
        updatedAt: "2026-03-28T02:28:00Z",
        user: {
          id: "seller-4",
          ingameName: "wipscoolsen",
          lastSeen: "2026-03-28T02:28:00Z",
          slug: "wipscoolsen",
          status: "offline",
        },
      }),
    ];

    const firstResult = evaluateWatchRule({
      now: "2026-03-28T06:19:30Z",
      orders: [suspiciousOrder, ...supportedCluster],
      previous: [],
      rule: expensiveRule,
    });

    const secondResult = evaluateWatchRule({
      now: "2026-03-28T06:19:33Z",
      orders: [suspiciousOrder, ...supportedCluster],
      previous: firstResult.observations,
      rule: expensiveRule,
    });

    expect(secondResult.alerts).toEqual([]);
    expect(secondResult.observations).toEqual([
      {
        alertState: "pending",
        lastSeen: "2026-03-28T06:19:30.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "gadenged",
        status: "ingame",
      },
      {
        lastSeen: "2026-03-28T06:15:00.000Z",
        platinum: 20,
        sellerId: "seller-2",
        sellerSlug: "legendin69",
        status: "offline",
      },
      {
        lastSeen: "2026-03-28T05:50:00.000Z",
        platinum: 20,
        sellerId: "seller-3",
        sellerSlug: "knot_adm",
        status: "offline",
      },
      {
        lastSeen: "2026-03-28T02:28:00.000Z",
        platinum: 20,
        sellerId: "seller-4",
        sellerSlug: "wipscoolsen",
        status: "offline",
      },
    ]);
  });

  it("does not create duplicate alerts after a suspicious outlier is confirmed", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "mesa_prime_set",
      maxPlatinum: 36,
    };
    const previous: SellerObservation[] = [
      {
        alertState: "sent",
        lastSeen: "2026-03-26T15:28:03.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "bobrstylgoodgame",
        status: "ingame",
      },
    ];

    const result = evaluateWatchRule({
      now: "2026-03-26T15:29:03Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-26T15:27:50Z",
          user: {
            id: "seller-1",
            ingameName: "bobrstylgoodgame",
            lastSeen: "2026-03-26T15:28:03Z",
            slug: "bobrstylgoodgame",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 50,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-2",
            ingameName: "sleepin-sheepin",
            lastSeen: "2026-03-26T02:50:32Z",
            slug: "sleepin-sheepin",
            status: "offline",
          },
        }),
      ],
      previous,
      rule: expensiveRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual(previous);
  });

  it("alerts when a pending suspicious price becomes believable on the next poll", () => {
    const cheapRule: WatchRule = {
      ...baseRule,
      itemSlug: "ammo_drum",
      maxPlatinum: 4,
    };
    const suspiciousPrice = createOrder({
      platinum: 1,
      updatedAt: "2026-03-26T15:27:50Z",
      user: {
        id: "seller-1",
        ingameName: "cheap-seller",
        lastSeen: "2026-03-26T15:28:03Z",
        slug: "cheap-seller",
        status: "ingame",
      },
    });

    const firstResult = evaluateWatchRule({
      now: "2026-03-26T15:28:03Z",
      orders: [suspiciousPrice],
      previous: [],
      rule: cheapRule,
    });

    expect(firstResult.alerts).toEqual([]);
    expect(firstResult.observations).toEqual([
      {
        alertState: "pending",
        lastSeen: "2026-03-26T15:28:03.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "cheap-seller",
        status: "ingame",
      },
    ]);

    const secondResult = evaluateWatchRule({
      now: "2026-03-26T15:28:33Z",
      orders: [
        suspiciousPrice,
        createOrder({
          id: "order-2",
          platinum: 2,
          updatedAt: "2026-03-26T15:28:20Z",
          user: {
            id: "seller-2",
            ingameName: "second-cheapest",
            lastSeen: "2026-03-26T15:20:00Z",
            slug: "second-cheapest",
            status: "offline",
          },
        }),
      ],
      previous: firstResult.observations,
      rule: cheapRule,
    });

    expect(secondResult.alerts).toEqual([
      {
        itemSlug: "ammo_drum",
        lastSeen: "2026-03-26T15:28:03.000Z",
        observedAt: "2026-03-26T15:28:33Z",
        platinum: 1,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "cheap-seller",
        sellerSlug: "cheap-seller",
        status: "ingame",
      },
    ]);
    expect(secondResult.observations).toEqual([
      {
        alertState: "sent",
        lastSeen: "2026-03-26T15:28:03.000Z",
        platinum: 1,
        sellerId: "seller-1",
        sellerSlug: "cheap-seller",
        status: "ingame",
      },
      {
        lastSeen: "2026-03-26T15:20:00.000Z",
        platinum: 2,
        sellerId: "seller-2",
        sellerSlug: "second-cheapest",
        status: "offline",
      },
    ]);
  });

  it("alerts when a pending suspicious seller corrects the price into a believable range", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "gauss_prime_set",
      maxPlatinum: 36,
    };

    const firstResult = evaluateWatchRule({
      now: "2026-03-26T15:28:03Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-26T15:27:50Z",
          user: {
            id: "seller-1",
            ingameName: "bobrstylgoodgame",
            lastSeen: "2026-03-26T15:28:03Z",
            slug: "bobrstylgoodgame",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 50,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-2",
            ingameName: "sleepin-sheepin",
            lastSeen: "2026-03-26T02:50:32Z",
            slug: "sleepin-sheepin",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: expensiveRule,
    });

    expect(firstResult.alerts).toEqual([]);

    const secondResult = evaluateWatchRule({
      now: "2026-03-26T15:28:33Z",
      orders: [
        createOrder({
          platinum: 18,
          updatedAt: "2026-03-26T15:28:20Z",
          user: {
            id: "seller-1",
            ingameName: "bobrstylgoodgame",
            lastSeen: "2026-03-26T15:28:03Z",
            slug: "bobrstylgoodgame",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 35,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-2",
            ingameName: "sleepin-sheepin",
            lastSeen: "2026-03-26T02:50:32Z",
            slug: "sleepin-sheepin",
            status: "offline",
          },
        }),
      ],
      previous: firstResult.observations,
      rule: expensiveRule,
    });

    expect(secondResult.alerts).toEqual([
      {
        itemSlug: "gauss_prime_set",
        lastSeen: "2026-03-26T15:28:03.000Z",
        observedAt: "2026-03-26T15:28:33Z",
        platinum: 18,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "bobrstylgoodgame",
        sellerSlug: "bobrstylgoodgame",
        status: "ingame",
      },
    ]);
    expect(secondResult.observations).toEqual([
      {
        alertState: "sent",
        lastSeen: "2026-03-26T15:28:03.000Z",
        platinum: 18,
        sellerId: "seller-1",
        sellerSlug: "bobrstylgoodgame",
        status: "ingame",
      },
      {
        lastSeen: "2026-03-26T02:50:32.000Z",
        platinum: 35,
        sellerId: "seller-2",
        sellerSlug: "sleepin-sheepin",
        status: "offline",
      },
    ]);
  });

  it("keeps a suspicious singleton pending even if the seller last-seen timestamp advances", () => {
    const expensiveRule: WatchRule = {
      ...baseRule,
      itemSlug: "mesa_prime_set",
      maxPlatinum: 36,
    };

    const firstResult = evaluateWatchRule({
      now: "2026-03-26T15:28:03Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-26T15:27:50Z",
          user: {
            id: "seller-1",
            ingameName: "bobrstylgoodgame",
            lastSeen: "2026-03-26T15:28:03Z",
            slug: "bobrstylgoodgame",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 50,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-2",
            ingameName: "sleepin-sheepin",
            lastSeen: "2026-03-26T02:50:32Z",
            slug: "sleepin-sheepin",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: expensiveRule,
    });

    const secondResult = evaluateWatchRule({
      now: "2026-03-26T15:28:33Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-26T15:28:20Z",
          user: {
            id: "seller-1",
            ingameName: "bobrstylgoodgame",
            lastSeen: "2026-03-26T15:28:30Z",
            slug: "bobrstylgoodgame",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 50,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-2",
            ingameName: "sleepin-sheepin",
            lastSeen: "2026-03-26T02:50:32Z",
            slug: "sleepin-sheepin",
            status: "offline",
          },
        }),
      ],
      previous: firstResult.observations,
      rule: expensiveRule,
    });

    expect(secondResult.alerts).toEqual([]);
    expect(secondResult.observations).toContainEqual({
      alertState: "pending",
      lastSeen: "2026-03-26T15:28:30.000Z",
      platinum: 1,
      sellerId: "seller-1",
      sellerSlug: "bobrstylgoodgame",
      status: "ingame",
    });

    const thirdResult = evaluateWatchRule({
      now: "2026-03-26T15:29:10Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-26T15:29:00Z",
          user: {
            id: "seller-1",
            ingameName: "bobrstylgoodgame",
            lastSeen: "2026-03-26T15:29:05Z",
            slug: "bobrstylgoodgame",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 50,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-2",
            ingameName: "sleepin-sheepin",
            lastSeen: "2026-03-26T02:50:32Z",
            slug: "sleepin-sheepin",
            status: "offline",
          },
        }),
      ],
      previous: secondResult.observations,
      rule: expensiveRule,
    });

    expect(thirdResult.alerts).toEqual([]);
    expect(thirdResult.observations).toContainEqual({
      alertState: "pending",
      lastSeen: "2026-03-26T15:29:05.000Z",
      platinum: 1,
      sellerId: "seller-1",
      sellerSlug: "bobrstylgoodgame",
      status: "ingame",
    });
  });

  it("alerts immediately when a 1p price matches the current cheap-item cluster", () => {
    const cheapRule: WatchRule = {
      ...baseRule,
      itemSlug: "ammo_drum",
      maxPlatinum: 4,
    };

    const result = evaluateWatchRule({
      now: "2026-03-26T15:28:03Z",
      orders: [
        createOrder({
          platinum: 1,
          updatedAt: "2026-03-26T15:27:50Z",
          user: {
            id: "seller-1",
            ingameName: "cheap-seller",
            lastSeen: "2026-03-26T15:28:03Z",
            slug: "cheap-seller",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 2,
          updatedAt: "2026-03-26T15:27:45Z",
          user: {
            id: "seller-2",
            ingameName: "second-cheapest",
            lastSeen: "2026-03-26T15:20:00Z",
            slug: "second-cheapest",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-3",
          platinum: 3,
          updatedAt: "2026-03-26T15:27:40Z",
          user: {
            id: "seller-3",
            ingameName: "third-cheapest",
            lastSeen: "2026-03-26T15:18:00Z",
            slug: "third-cheapest",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: cheapRule,
    });

    expect(result.alerts).toEqual([
      {
        itemSlug: "ammo_drum",
        lastSeen: "2026-03-26T15:28:03.000Z",
        observedAt: "2026-03-26T15:28:03Z",
        platinum: 1,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "cheap-seller",
        sellerSlug: "cheap-seller",
        status: "ingame",
      },
    ]);
  });

  it("keeps an unsupported near-threshold singleton pending until the market confirms it", () => {
    const rule: WatchRule = {
      ...baseRule,
      itemSlug: "mesa_prime_set",
      maxPlatinum: 40,
    };

    const result = evaluateWatchRule({
      now: "2026-04-01T00:00:00Z",
      orders: [
        createOrder({
          platinum: 21,
          user: {
            id: "seller-1",
            ingameName: "almost-too-good",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "almost-too-good",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 50,
          user: {
            id: "seller-2",
            ingameName: "market-floor-a",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "market-floor-a",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-3",
          platinum: 50,
          user: {
            id: "seller-3",
            ingameName: "market-floor-b",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "market-floor-b",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toContainEqual({
      alertState: "pending",
      lastSeen: "2026-04-01T00:00:00.000Z",
      platinum: 21,
      sellerId: "seller-1",
      sellerSlug: "almost-too-good",
      status: "ingame",
    });
  });

  it("ignores ranked sell orders when evaluating alerts for unranked items", () => {
    const cheapRule: WatchRule = {
      ...baseRule,
      itemSlug: "ammo_drum",
      maxPlatinum: 4,
    };

    const result = evaluateWatchRule({
      now: "2026-04-01T00:00:00Z",
      orders: [
        createOrder({
          platinum: 1,
          rank: 5,
          user: {
            id: "seller-1",
            ingameName: "ranked-mod-seller",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "ranked-mod-seller",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 9,
          user: {
            id: "seller-2",
            ingameName: "unranked-seller",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "unranked-seller",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: cheapRule,
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toEqual([]);
  });

  it("treats missing rank as unranked when evaluating ordinary sell orders", () => {
    const result = evaluateWatchRule({
      now: "2026-04-01T00:00:00Z",
      orders: [
        {
          ...createOrder({
            platinum: 9,
            user: {
              id: "seller-1",
              ingameName: "vash2000",
              lastSeen: "2026-04-01T00:00:00Z",
              slug: "vash2000",
              status: "ingame",
            },
          }),
          rank: undefined as unknown as number,
        },
      ],
      previous: [],
      rule: baseRule,
    });

    expect(result.alerts).toEqual([
      {
        itemSlug: "arcane_barrier",
        lastSeen: "2026-04-01T00:00:00.000Z",
        observedAt: "2026-04-01T00:00:00Z",
        platinum: 9,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "vash2000",
        sellerSlug: "vash2000",
        status: "ingame",
      },
    ]);
  });

  it("alerts when a 1p seller is supported by a cheap 1-2-4-4-4 market floor", () => {
    const result = evaluateWatchRule({
      now: "2026-04-01T00:00:00Z",
      orders: [
        createOrder({
          platinum: 1,
          user: {
            id: "seller-1",
            ingameName: "cheap-floor",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "cheap-floor",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 2,
          user: {
            id: "seller-2",
            ingameName: "cheap-floor-2",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "cheap-floor-2",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-3",
          platinum: 4,
          user: {
            id: "seller-3",
            ingameName: "cheap-floor-3",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "cheap-floor-3",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-4",
          platinum: 4,
          user: {
            id: "seller-4",
            ingameName: "cheap-floor-4",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "cheap-floor-4",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-5",
          platinum: 4,
          user: {
            id: "seller-5",
            ingameName: "cheap-floor-5",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "cheap-floor-5",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: {
        ...baseRule,
        itemSlug: "cheap_item",
        maxPlatinum: 40,
      },
    });

    expect(result.alerts).toEqual([
      {
        itemSlug: "cheap_item",
        lastSeen: "2026-04-01T00:00:00.000Z",
        observedAt: "2026-04-01T00:00:00Z",
        platinum: 1,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerName: "cheap-floor",
        sellerSlug: "cheap-floor",
        status: "ingame",
      },
    ]);
  });

  it("keeps a 1p seller pending when the supported market is 38-39-39-39", () => {
    const result = evaluateWatchRule({
      now: "2026-04-01T00:00:00Z",
      orders: [
        createOrder({
          platinum: 1,
          user: {
            id: "seller-1",
            ingameName: "fat-finger",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "fat-finger",
            status: "ingame",
          },
        }),
        createOrder({
          id: "order-2",
          platinum: 38,
          user: {
            id: "seller-2",
            ingameName: "real-floor-2",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "real-floor-2",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-3",
          platinum: 39,
          user: {
            id: "seller-3",
            ingameName: "real-floor-3",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "real-floor-3",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-4",
          platinum: 39,
          user: {
            id: "seller-4",
            ingameName: "real-floor-4",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "real-floor-4",
            status: "offline",
          },
        }),
        createOrder({
          id: "order-5",
          platinum: 39,
          user: {
            id: "seller-5",
            ingameName: "real-floor-5",
            lastSeen: "2026-04-01T00:00:00Z",
            slug: "real-floor-5",
            status: "offline",
          },
        }),
      ],
      previous: [],
      rule: {
        ...baseRule,
        itemSlug: "expensive_item",
        maxPlatinum: 40,
      },
    });

    expect(result.alerts).toEqual([]);
    expect(result.observations).toContainEqual({
      alertState: "pending",
      lastSeen: "2026-04-01T00:00:00.000Z",
      platinum: 1,
      sellerId: "seller-1",
      sellerSlug: "fat-finger",
      status: "ingame",
    });
  });
});
