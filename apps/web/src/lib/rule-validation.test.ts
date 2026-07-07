import { describe, expect, it } from "bun:test";

import type { MarketOrder } from "@warframe-market-tracker/alert-engine";

import {
  MarketClientError,
  MarketClientTimeoutError,
} from "@warframe-market-tracker/market-client";

import { assertTrackableItemSlug } from "./rule-validation";

function createOrder(): MarketOrder {
  return {
    id: "order-1",
    itemId: "item-1",
    platinum: 12,
    quantity: 1,
    rank: 0,
    type: "sell",
    updatedAt: "2026-03-27T00:00:00.000Z",
    user: {
      id: "seller-1",
      ingameName: "seller-1",
      lastSeen: "2026-03-27T00:00:00.000Z",
      slug: "seller-1",
      status: "online",
    },
    visible: true,
  };
}

describe("assertTrackableItemSlug", () => {
  it("returns the fetched orders for valid item slugs", async () => {
    const orders = [createOrder()];

    await expect(
      assertTrackableItemSlug("arcane_barrier", {
        async getItemOrders() {
          return orders;
        },
      }),
    ).resolves.toBe(orders);
  });

  it("returns a 422 validation error for unknown item slugs", async () => {
    await expect(
      assertTrackableItemSlug("definitely_fake_slug", {
        async getItemOrders() {
          throw new MarketClientError(404, "Not Found");
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "Unknown item slug",
        status: 422,
      }),
    );
  });

  it("returns a 502 validation error when the marketplace is unavailable", async () => {
    await expect(
      assertTrackableItemSlug("arcane_barrier", {
        async getItemOrders() {
          throw new MarketClientError(503, "Service Unavailable");
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "Unable to validate item slug",
        status: 502,
      }),
    );
  });

  it("returns a 503 validation error when the marketplace times out", async () => {
    await expect(
      assertTrackableItemSlug("arcane_barrier", {
        async getItemOrders() {
          throw new MarketClientTimeoutError(10_000);
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message: "Market data timed out upstream. Try again shortly.",
        status: 503,
      }),
    );
  });

  it("returns a 503 validation error when the marketplace is rate limited", async () => {
    await expect(
      assertTrackableItemSlug("arcane_barrier", {
        async getItemOrders() {
          throw new MarketClientError(429, "Too Many Requests");
        },
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        message:
          "Market data is temporarily rate limited upstream. Try again shortly.",
        status: 503,
      }),
    );
  });
});
