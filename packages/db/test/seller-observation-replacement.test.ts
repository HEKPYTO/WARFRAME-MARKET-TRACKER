import { describe, expect, it } from "bun:test";

import type { SellerObservation } from "@warframe-market-tracker/alert-engine";

import {
  buildSellerObservationBatchRows,
  buildSellerObservationRows,
  replaceSellerObservationRowsByRuleId,
  replaceSellerObservationRows,
} from "../src/seller-observation-replacement";

const baseObservation: SellerObservation = {
  alertState: "pending",
  lastSeen: "2026-03-27T00:00:00.000Z",
  platinum: 9,
  sellerId: "seller-1",
  sellerSlug: "seller-1",
  status: "online",
};

describe("buildSellerObservationRows", () => {
  it("maps alert-engine observations into persistent rows", () => {
    const now = new Date("2026-03-27T00:05:00.000Z");

    expect(
      buildSellerObservationRows({
        now,
        observations: [baseObservation],
        ruleId: "rule-1",
      }),
    ).toEqual([
      {
        alertState: "pending",
        lastSeen: new Date("2026-03-27T00:00:00.000Z"),
        platinum: 9,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerSlug: "seller-1",
        status: "online",
        updatedAt: now,
      },
    ]);
  });
});

describe("buildSellerObservationBatchRows", () => {
  it("maps multiple rule observation groups into persistent rows", () => {
    const now = new Date("2026-03-27T00:05:00.000Z");

    expect(
      buildSellerObservationBatchRows({
        now,
        observationsByRuleId: {
          "rule-1": [baseObservation],
          "rule-2": [
            {
              ...baseObservation,
              platinum: 12,
              sellerId: "seller-2",
              sellerSlug: "seller-2",
            },
          ],
        },
      }),
    ).toEqual([
      {
        alertState: "pending",
        lastSeen: new Date("2026-03-27T00:00:00.000Z"),
        platinum: 9,
        ruleId: "rule-1",
        sellerId: "seller-1",
        sellerSlug: "seller-1",
        status: "online",
        updatedAt: now,
      },
      {
        alertState: "pending",
        lastSeen: new Date("2026-03-27T00:00:00.000Z"),
        platinum: 12,
        ruleId: "rule-2",
        sellerId: "seller-2",
        sellerSlug: "seller-2",
        status: "online",
        updatedAt: now,
      },
    ]);
  });
});

describe("replaceSellerObservationRows", () => {
  it("replaces observations inside a single transaction", async () => {
    const events: string[] = [];

    await replaceSellerObservationRows({
      db: {
        async transaction(callback) {
          events.push("transaction:start");
          await callback({
            delete() {
              events.push("delete");
              return {
                async where(_predicate: unknown) {
                  events.push("delete:where");
                },
              };
            },
            insert() {
              events.push("insert");
              return {
                async values(_rows: unknown[]) {
                  events.push("insert:values");
                },
              };
            },
          });
          events.push("transaction:end");
        },
      },
      now: () => new Date("2026-03-27T00:05:00.000Z"),
      observations: [baseObservation],
      ruleId: "rule-1",
      sellerObservationsTable: { name: "seller_observations" },
      whereRuleId: (ruleId) => ({ ruleId }),
    });

    expect(events).toEqual([
      "transaction:start",
      "delete",
      "delete:where",
      "insert",
      "insert:values",
      "transaction:end",
    ]);
  });

  it("replaces observations for multiple rules inside a single transaction", async () => {
    const events: string[] = [];

    await replaceSellerObservationRowsByRuleId({
      db: {
        async transaction(callback) {
          events.push("transaction:start");
          await callback({
            delete() {
              events.push("delete");
              return {
                async where(_predicate: unknown) {
                  events.push("delete:where");
                },
              };
            },
            insert() {
              events.push("insert");
              return {
                async values(_rows: unknown[]) {
                  events.push("insert:values");
                },
              };
            },
          });
          events.push("transaction:end");
        },
      },
      now: () => new Date("2026-03-27T00:05:00.000Z"),
      observationsByRuleId: {
        "rule-1": [baseObservation],
        "rule-2": [
          {
            ...baseObservation,
            sellerId: "seller-2",
            sellerSlug: "seller-2",
          },
        ],
      },
      ruleIds: ["rule-1", "rule-2"],
      sellerObservationsTable: { name: "seller_observations" },
      whereRuleIds: (ruleIds) => ({ ruleIds }),
    });

    expect(events).toEqual([
      "transaction:start",
      "delete",
      "delete:where",
      "insert",
      "insert:values",
      "transaction:end",
    ]);
  });

  it("skips the insert when there are no observations to persist", async () => {
    const events: string[] = [];

    await replaceSellerObservationRows({
      db: {
        async transaction(callback) {
          await callback({
            delete() {
              events.push("delete");
              return {
                async where(_predicate: unknown) {
                  events.push("delete:where");
                },
              };
            },
            insert() {
              events.push("insert");
              return {
                async values(_rows: unknown[]) {
                  events.push("insert:values");
                },
              };
            },
          });
        },
      },
      observations: [],
      ruleId: "rule-1",
      sellerObservationsTable: { name: "seller_observations" },
      whereRuleId: (ruleId) => ({ ruleId }),
    });

    expect(events).toEqual(["delete", "delete:where"]);
  });
});
