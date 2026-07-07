import { describe, expect, it } from "bun:test";
import type {
  SellerObservation,
  WatchAlert,
} from "@warframe-market-tracker/alert-engine";

import {
  persistAlertRows,
  persistEvaluationBatch,
  persistRuleEvaluation,
} from "../src/alert-persistence";

const baseAlert: WatchAlert = {
  itemSlug: "arcane_barrier",
  lastSeen: "2026-03-25T00:00:00.000Z",
  observedAt: "2026-03-25T00:00:00.000Z",
  platinum: 10,
  ruleId: "rule-1",
  sellerId: "seller-1",
  sellerName: "vash2000",
  sellerSlug: "vash2000",
  status: "online",
};

const baseObservation: SellerObservation = {
  lastSeen: "2026-03-25T00:00:00.000Z",
  platinum: 10,
  sellerId: "seller-1",
  sellerSlug: "vash2000",
  status: "online",
};

function createFakeDb(events: string[]) {
  return {
    async transaction<T>(callback: (tx: unknown) => Promise<T>) {
      events.push("transaction:start");

      const result = await callback({
        delete() {
          events.push("delete");
          return {
            async where(_predicate: unknown) {
              events.push("delete:where");
            },
          };
        },
        insert(table: unknown) {
          events.push(`insert:${String(table)}`);

          return {
            values(rows: unknown[]) {
              events.push(`values:${String(table)}:${rows.length}`);

              if (table === "alert_notifications") {
                return {
                  onConflictDoNothing() {
                    events.push("notifications:onConflictDoNothing");

                    return {
                      async returning(_fields: unknown) {
                        events.push("notifications:returning");

                        return [
                          {
                            fingerprint:
                              "arcane_barrier::seller-1::10::2026-03-25T00:00:00.000Z",
                          },
                        ];
                      },
                    };
                  },
                };
              }

              return Promise.resolve();
            },
          };
        },
      });

      events.push("transaction:end");

      return result;
    },
  };
}

describe("persistAlertRows", () => {
  it("wraps notification and alert inserts in a single transaction", async () => {
    const events: string[] = [];

    await persistAlertRows({
      alertsTable: "alerts",
      alertNotificationsTable: "alert_notifications",
      db: createFakeDb(events),
      entries: [baseAlert],
      fingerprintColumn: "fingerprint",
      userId: "local-demo-user",
    });

    expect(events).toEqual([
      "transaction:start",
      "insert:alert_notifications",
      "values:alert_notifications:1",
      "notifications:onConflictDoNothing",
      "notifications:returning",
      "insert:alerts",
      "values:alerts:1",
      "transaction:end",
    ]);
  });
});

describe("persistRuleEvaluation", () => {
  it("persists alerts and seller observations inside the same transaction", async () => {
    const events: string[] = [];

    await persistRuleEvaluation({
      alerts: [baseAlert],
      alertsTable: "alerts",
      alertNotificationsTable: "alert_notifications",
      db: createFakeDb(events),
      fingerprintColumn: "fingerprint",
      observations: [baseObservation],
      ruleId: "rule-1",
      sellerObservationsTable: "seller_observations",
      userId: "local-demo-user",
      whereRuleId: (ruleId) => ({ ruleId }),
    });

    expect(events).toEqual([
      "transaction:start",
      "insert:alert_notifications",
      "values:alert_notifications:1",
      "notifications:onConflictDoNothing",
      "notifications:returning",
      "insert:alerts",
      "values:alerts:1",
      "delete",
      "delete:where",
      "insert:seller_observations",
      "values:seller_observations:1",
      "transaction:end",
    ]);
  });
});

describe("persistEvaluationBatch", () => {
  it("persists batch alerts and observation replacement inside the same transaction", async () => {
    const events: string[] = [];

    await persistEvaluationBatch({
      alertsTable: "alerts",
      alertNotificationsTable: "alert_notifications",
      db: createFakeDb(events),
      entries: [
        {
          alerts: [baseAlert],
          observations: [baseObservation],
          ruleId: "rule-1",
        },
      ],
      fingerprintColumn: "fingerprint",
      sellerObservationsTable: "seller_observations",
      userId: "local-demo-user",
      whereRuleIds: (ruleIds) => ({ ruleIds }),
    });

    expect(events).toEqual([
      "transaction:start",
      "insert:alert_notifications",
      "values:alert_notifications:1",
      "notifications:onConflictDoNothing",
      "notifications:returning",
      "insert:alerts",
      "values:alerts:1",
      "delete",
      "delete:where",
      "insert:seller_observations",
      "values:seller_observations:1",
      "transaction:end",
    ]);
  });
});
