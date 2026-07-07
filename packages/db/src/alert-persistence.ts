import type {
  SellerObservation,
  WatchAlert,
} from "@warframe-market-tracker/alert-engine";

import {
  buildAlertNotificationFingerprint,
  dedupeAlertNotifications,
} from "./alert-notification-fingerprint";
import {
  replaceSellerObservationRowsWithDriver,
  type SellerObservationTransactionDriver,
} from "./seller-observation-replacement";

type AlertNotificationInsertChain = {
  onConflictDoNothing: () => {
    returning: (
      fields: Record<string, unknown>,
    ) => Promise<Array<{ fingerprint: string }>>;
  };
};

type AlertPersistenceDriver = SellerObservationTransactionDriver & {
  insert: (table: unknown) => {
    values: (
      rows: unknown[],
    ) => Promise<unknown> | AlertNotificationInsertChain;
  };
};

type DatabaseLike = {
  transaction: <T>(callback: (tx: unknown) => Promise<T>) => Promise<T>;
};

function buildAlertRows(input: { entries: WatchAlert[]; userId: string }) {
  return input.entries.map((entry) => ({
    createdAt: new Date(),
    id: crypto.randomUUID(),
    itemSlug: entry.itemSlug,
    lastSeen: new Date(entry.lastSeen),
    observedAt: new Date(entry.observedAt),
    platinum: entry.platinum,
    ruleId: entry.ruleId,
    sellerId: entry.sellerId,
    sellerName: entry.sellerName,
    sellerSlug: entry.sellerSlug,
    status: entry.status,
    userId: input.userId,
  }));
}

export async function persistAlertRowsWithDriver(input: {
  alertNotificationsTable: unknown;
  alertsTable: unknown;
  driver: AlertPersistenceDriver;
  entries: WatchAlert[];
  fingerprintColumn: unknown;
  userId: string;
}): Promise<WatchAlert[]> {
  if (input.entries.length === 0) {
    return [];
  }

  const dedupedEntries = dedupeAlertNotifications(input.entries);
  const entriesByFingerprint = new Map(
    dedupedEntries.map((entry) => [
      buildAlertNotificationFingerprint(entry),
      entry,
    ]),
  );
  const notificationInsert = input.driver
    .insert(input.alertNotificationsTable)
    .values(
      dedupedEntries.map((entry) => ({
        createdAt: new Date(),
        fingerprint: buildAlertNotificationFingerprint(entry),
        userId: input.userId,
      })),
    ) as unknown as AlertNotificationInsertChain;
  const insertedFingerprints = await notificationInsert
    .onConflictDoNothing()
    .returning({
      fingerprint: input.fingerprintColumn,
    });
  const newEntries = insertedFingerprints
    .map(({ fingerprint }) => entriesByFingerprint.get(fingerprint))
    .filter((entry): entry is WatchAlert => entry !== undefined);

  if (newEntries.length === 0) {
    return [];
  }

  await input.driver
    .insert(input.alertsTable)
    .values(buildAlertRows({ entries: newEntries, userId: input.userId }));

  return newEntries;
}

export async function persistAlertRows(input: {
  alertNotificationsTable: unknown;
  alertsTable: unknown;
  db: DatabaseLike;
  entries: WatchAlert[];
  fingerprintColumn: unknown;
  userId: string;
}): Promise<WatchAlert[]> {
  return input.db.transaction((tx) =>
    persistAlertRowsWithDriver({
      alertNotificationsTable: input.alertNotificationsTable,
      alertsTable: input.alertsTable,
      driver: tx as AlertPersistenceDriver,
      entries: input.entries,
      fingerprintColumn: input.fingerprintColumn,
      userId: input.userId,
    }),
  );
}

export async function persistRuleEvaluation(input: {
  alerts: WatchAlert[];
  alertNotificationsTable: unknown;
  alertsTable: unknown;
  db: DatabaseLike;
  fingerprintColumn: unknown;
  observations: SellerObservation[];
  ruleId: string;
  sellerObservationsTable: unknown;
  userId: string;
  whereRuleId: (ruleId: string) => unknown;
}): Promise<WatchAlert[]> {
  return input.db.transaction(async (tx) => {
    const createdAlerts = await persistAlertRowsWithDriver({
      alertNotificationsTable: input.alertNotificationsTable,
      alertsTable: input.alertsTable,
      driver: tx as AlertPersistenceDriver,
      entries: input.alerts,
      fingerprintColumn: input.fingerprintColumn,
      userId: input.userId,
    });

    await replaceSellerObservationRowsWithDriver({
      driver: tx as AlertPersistenceDriver,
      now: new Date(),
      observationsByRuleId: {
        [input.ruleId]: input.observations,
      },
      rulePredicate: input.whereRuleId(input.ruleId),
      sellerObservationsTable: input.sellerObservationsTable,
    });

    return createdAlerts;
  });
}

export async function persistEvaluationBatch(input: {
  alertNotificationsTable: unknown;
  alertsTable: unknown;
  db: DatabaseLike;
  entries: Array<{
    alerts: WatchAlert[];
    observations: SellerObservation[];
    ruleId: string;
  }>;
  fingerprintColumn: unknown;
  sellerObservationsTable: unknown;
  userId: string;
  whereRuleIds: (ruleIds: string[]) => unknown;
}): Promise<WatchAlert[]> {
  if (input.entries.length === 0) {
    return [];
  }

  return input.db.transaction(async (tx) => {
    const createdAlerts = await persistAlertRowsWithDriver({
      alertNotificationsTable: input.alertNotificationsTable,
      alertsTable: input.alertsTable,
      driver: tx as AlertPersistenceDriver,
      entries: input.entries.flatMap((entry) => entry.alerts),
      fingerprintColumn: input.fingerprintColumn,
      userId: input.userId,
    });

    await replaceSellerObservationRowsWithDriver({
      driver: tx as AlertPersistenceDriver,
      now: new Date(),
      observationsByRuleId: Object.fromEntries(
        input.entries.map((entry) => [entry.ruleId, entry.observations]),
      ),
      rulePredicate: input.whereRuleIds(
        input.entries.map((entry) => entry.ruleId),
      ),
      sellerObservationsTable: input.sellerObservationsTable,
    });

    return createdAlerts;
  });
}
