import type { SellerObservation } from "@warframe-market-tracker/alert-engine";

type SellerObservationRow = {
  alertState: string | null;
  lastSeen: Date;
  platinum: number;
  ruleId: string;
  sellerId: string;
  sellerSlug: string;
  status: string;
  updatedAt: Date;
};

type TransactionDriver = {
  delete: (table: unknown) => {
    where: (predicate: unknown) => Promise<unknown>;
  };
  insert: (table: unknown) => {
    values: (rows: unknown[]) => Promise<unknown>;
  };
};

type DatabaseLike = {
  transaction: (callback: (tx: unknown) => Promise<void>) => Promise<void>;
};

export function buildSellerObservationRows(input: {
  now: Date;
  observations: SellerObservation[];
  ruleId: string;
}): SellerObservationRow[] {
  return input.observations.map((observation) => ({
    alertState: observation.alertState ?? null,
    lastSeen: new Date(observation.lastSeen),
    platinum: observation.platinum,
    ruleId: input.ruleId,
    sellerId: observation.sellerId,
    sellerSlug: observation.sellerSlug,
    status: observation.status,
    updatedAt: input.now,
  }));
}

export function buildSellerObservationBatchRows(input: {
  now: Date;
  observationsByRuleId: Record<string, SellerObservation[]>;
}): SellerObservationRow[] {
  return Object.entries(input.observationsByRuleId).flatMap(
    ([ruleId, observations]) =>
      buildSellerObservationRows({
        now: input.now,
        observations,
        ruleId,
      }),
  );
}

export type SellerObservationTransactionDriver = {
  delete: (table: unknown) => {
    where: (predicate: unknown) => Promise<unknown>;
  };
  insert: (table: unknown) => {
    values: (rows: unknown[]) => Promise<unknown>;
  };
};

export async function replaceSellerObservationRowsWithDriver(input: {
  driver: SellerObservationTransactionDriver;
  now: Date;
  observationsByRuleId: Record<string, SellerObservation[]>;
  rulePredicate: unknown;
  sellerObservationsTable: unknown;
}) {
  await input.driver
    .delete(input.sellerObservationsTable)
    .where(input.rulePredicate);

  const rows = buildSellerObservationBatchRows({
    now: input.now,
    observationsByRuleId: input.observationsByRuleId,
  });

  if (rows.length === 0) {
    return;
  }

  await input.driver.insert(input.sellerObservationsTable).values(rows);
}

export async function replaceSellerObservationRows(input: {
  db: DatabaseLike;
  now?: () => Date;
  observations: SellerObservation[];
  ruleId: string;
  sellerObservationsTable: unknown;
  whereRuleId: (ruleId: string) => unknown;
}): Promise<void> {
  const now = input.now ?? (() => new Date());

  await input.db.transaction(async (tx) => {
    await replaceSellerObservationRowsWithDriver({
      driver: tx as TransactionDriver,
      now: now(),
      observationsByRuleId: {
        [input.ruleId]: input.observations,
      },
      rulePredicate: input.whereRuleId(input.ruleId),
      sellerObservationsTable: input.sellerObservationsTable,
    });
  });
}

export async function replaceSellerObservationRowsByRuleId(input: {
  db: DatabaseLike;
  now?: () => Date;
  observationsByRuleId: Record<string, SellerObservation[]>;
  ruleIds: string[];
  sellerObservationsTable: unknown;
  whereRuleIds: (ruleIds: string[]) => unknown;
}): Promise<void> {
  const now = input.now ?? (() => new Date());

  await input.db.transaction(async (tx) => {
    await replaceSellerObservationRowsWithDriver({
      driver: tx as TransactionDriver,
      now: now(),
      observationsByRuleId: input.observationsByRuleId,
      rulePredicate: input.whereRuleIds(input.ruleIds),
      sellerObservationsTable: input.sellerObservationsTable,
    });
  });
}
