import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import postgres from "postgres";

import type {
  SellerObservation,
  WatchAlert,
  WatchRule,
} from "@warframe-market-tracker/alert-engine";
import {
  persistAlertRows,
  persistEvaluationBatch,
  persistRuleEvaluation,
} from "./alert-persistence";
import {
  decryptDiscordBotToken,
  encryptDiscordBotToken,
  parseAppSecretsMasterKey,
} from "./discord-token-crypto";
import {
  replaceSellerObservationRows,
  replaceSellerObservationRowsByRuleId,
} from "./seller-observation-replacement";

export const DEFAULT_USER_ID = "local-demo-user";

const appUsers = pgTable("app_users", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  email: text("email"),
  id: text("id").primaryKey(),
});

const userSettings = pgTable("user_settings", {
  discordBotToken: text("discord_bot_token"),
  discordBotTokenCiphertext: text("discord_bot_token_ciphertext"),
  discordBotTokenIv: text("discord_bot_token_iv"),
  discordBotTokenKeyVersion: integer("discord_bot_token_key_version"),
  discordChannelId: text("discord_channel_id"),
  discordEnabled: boolean("discord_enabled").notNull(),
  trackingPaused: boolean("tracking_paused").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  userId: text("user_id")
    .primaryKey()
    .references(() => appUsers.id, { onDelete: "cascade" }),
});

const watchRules = pgTable("watch_rules", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  crossplay: boolean("crossplay").notNull(),
  enabled: boolean("enabled").notNull(),
  id: text("id").primaryKey(),
  itemSlug: text("item_slug").notNull(),
  maxPlatinum: integer("max_platinum").notNull(),
  platform: text("platform").notNull(),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
});

const alerts = pgTable("alerts", {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  id: text("id").primaryKey(),
  itemSlug: text("item_slug").notNull(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  platinum: integer("platinum").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  ruleId: text("rule_id")
    .notNull()
    .references(() => watchRules.id, { onDelete: "cascade" }),
  sellerId: text("seller_id").notNull(),
  sellerName: text("seller_name").notNull(),
  sellerSlug: text("seller_slug").notNull(),
  status: text("status").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),
});

const alertNotifications = pgTable(
  "alert_notifications",
  {
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    fingerprint: text("fingerprint").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.fingerprint] })],
);

const sellerObservations = pgTable(
  "seller_observations",
  {
    alertState: text("alert_state"),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    platinum: integer("platinum").notNull(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => watchRules.id, { onDelete: "cascade" }),
    sellerId: text("seller_id").notNull(),
    sellerSlug: text("seller_slug").notNull(),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.ruleId, table.sellerId] })],
);

export interface CreateWatchRuleInput {
  crossplay: boolean;
  itemSlug: string;
  maxPlatinum: number;
  platform: "pc";
}

export interface WatchRuleRecord extends WatchRule {
  createdAt: string;
  enabled: boolean;
  sortOrder: number;
  updatedAt: string;
  userId: string;
}

export interface AlertRecord extends WatchAlert {
  createdAt: string;
  id: string;
  readAt: string | null;
  userId: string;
}

export interface UserSettings {
  discordBotToken: string | null;
  discordChannelId: string | null;
  discordEnabled: boolean;
  trackingPaused: boolean;
}

export interface UserSettingsState {
  discordChannelId: string | null;
  discordEnabled: boolean;
  hasDiscordBotToken: boolean;
  trackingPaused: boolean;
}

export const PRESERVE_DISCORD_BOT_TOKEN = Symbol("preserve-discord-bot-token");

export interface UpdateUserSettingsInput {
  discordBotToken: string | null | typeof PRESERVE_DISCORD_BOT_TOKEN;
  discordChannelId: string | null;
  discordEnabled: boolean;
  trackingPaused: boolean;
}

export interface DashboardSnapshot {
  alerts: AlertRecord[];
  rules: WatchRuleRecord[];
}

export interface RuleEvaluationBatchEntry {
  alerts: WatchAlert[];
  observations: SellerObservation[];
  ruleId: string;
}

export type ResetSeed = "demo" | "empty";

let database: PostgresJsDatabase | undefined;
let queryClient: ReturnType<typeof postgres> | undefined;
let schemaReady: Promise<void> | undefined;
let cachedAppSecretsMasterKey:
  | {
      source: string | null;
      value: Uint8Array | null;
    }
  | undefined;

type PostgresNotice = {
  code?: string;
  message?: string;
  severity?: string;
  severity_local?: string;
};

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return databaseUrl;
}

function getDatabase() {
  if (database) {
    return database;
  }

  if (!queryClient) {
    queryClient = postgres(getDatabaseUrl(), {
      max: 1,
      onnotice(notice) {
        if (isIgnorableSchemaNotice(notice)) {
          return;
        }

        console.warn("[db] notice", notice);
      },
    });
  }

  database = drizzle(queryClient);
  return database;
}

export function isIgnorableSchemaNotice(notice: PostgresNotice) {
  const message = notice.message?.toLowerCase() ?? "";

  return (
    (notice.code === "42P07" || notice.code === "42701") &&
    message.includes("already exists") &&
    message.includes("skipping")
  );
}

function getAppSecretsMasterKey(): Uint8Array | null {
  const source = process.env.APP_SECRETS_MASTER_KEY?.trim() ?? null;

  if (
    cachedAppSecretsMasterKey &&
    cachedAppSecretsMasterKey.source === source
  ) {
    return cachedAppSecretsMasterKey.value;
  }

  const value = source ? parseAppSecretsMasterKey(source) : null;
  cachedAppSecretsMasterKey = {
    source,
    value,
  };
  return value;
}

function hasEncryptedDiscordBotToken(
  record: typeof userSettings.$inferSelect,
): boolean {
  return Boolean(
    record.discordBotTokenCiphertext &&
    record.discordBotTokenIv &&
    record.discordBotTokenKeyVersion !== null,
  );
}

function hasPlaintextDiscordBotToken(
  record: typeof userSettings.$inferSelect,
): boolean {
  return Boolean(record.discordBotToken?.trim());
}

async function buildEncryptedDiscordBotTokenColumns(token: string) {
  const masterKey = getAppSecretsMasterKey();

  if (!masterKey) {
    throw new Error(
      "APP_SECRETS_MASTER_KEY is required to store Discord bot tokens securely",
    );
  }

  return encryptDiscordBotToken({
    masterKey,
    token,
  });
}

function mapEncryptedDiscordBotTokenColumns(input: {
  ciphertext: string;
  iv: string;
  keyVersion: number;
}) {
  return {
    discordBotToken: null,
    discordBotTokenCiphertext: input.ciphertext,
    discordBotTokenIv: input.iv,
    discordBotTokenKeyVersion: input.keyVersion,
  };
}

async function buildPreservedDiscordBotTokenColumns(
  record: typeof userSettings.$inferSelect | undefined,
) {
  if (!record) {
    return {
      discordBotToken: null,
      discordBotTokenCiphertext: null,
      discordBotTokenIv: null,
      discordBotTokenKeyVersion: null,
    };
  }

  if (hasEncryptedDiscordBotToken(record)) {
    return {
      discordBotToken: null,
      discordBotTokenCiphertext: record.discordBotTokenCiphertext,
      discordBotTokenIv: record.discordBotTokenIv,
      discordBotTokenKeyVersion: record.discordBotTokenKeyVersion,
    };
  }

  if (!hasPlaintextDiscordBotToken(record)) {
    return {
      discordBotToken: null,
      discordBotTokenCiphertext: null,
      discordBotTokenIv: null,
      discordBotTokenKeyVersion: null,
    };
  }

  const encryptedColumns = await buildEncryptedDiscordBotTokenColumns(
    record.discordBotToken!,
  );

  return mapEncryptedDiscordBotTokenColumns(encryptedColumns);
}

async function readDiscordBotTokenFromRecord(input: {
  record: typeof userSettings.$inferSelect;
  persistMigration: (value: {
    discordBotToken: null;
    discordBotTokenCiphertext: string;
    discordBotTokenIv: string;
    discordBotTokenKeyVersion: number;
  }) => Promise<void>;
}): Promise<string | null> {
  if (hasEncryptedDiscordBotToken(input.record)) {
    const masterKey = getAppSecretsMasterKey();

    if (!masterKey) {
      throw new Error(
        "APP_SECRETS_MASTER_KEY is required to decrypt Discord bot tokens",
      );
    }

    return decryptDiscordBotToken({
      ciphertext: input.record.discordBotTokenCiphertext!,
      iv: input.record.discordBotTokenIv!,
      keyVersion: input.record.discordBotTokenKeyVersion!,
      masterKey,
    }).catch((error) => {
      console.error("[db] Discord token decryption failed", error);
      throw error;
    });
  }

  if (!hasPlaintextDiscordBotToken(input.record)) {
    return null;
  }

  const encryptedColumns = await buildEncryptedDiscordBotTokenColumns(
    input.record.discordBotToken!,
  );

  await input.persistMigration({
    ...mapEncryptedDiscordBotTokenColumns(encryptedColumns),
  });

  return input.record.discordBotToken!;
}

async function ensureSchema() {
  if (schemaReady) {
    return schemaReady;
  }

  const db = getDatabase();

  schemaReady = (async () => {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
        discord_bot_token TEXT,
        discord_bot_token_ciphertext TEXT,
        discord_bot_token_iv TEXT,
        discord_bot_token_key_version INTEGER,
        discord_channel_id TEXT,
        discord_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        tracking_paused BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      ALTER TABLE user_settings
      ADD COLUMN IF NOT EXISTS discord_bot_token_ciphertext TEXT
    `);

    await db.execute(`
      ALTER TABLE user_settings
      ADD COLUMN IF NOT EXISTS discord_bot_token_iv TEXT
    `);

    await db.execute(`
      ALTER TABLE user_settings
      ADD COLUMN IF NOT EXISTS discord_bot_token_key_version INTEGER
    `);

    await db.execute(`
      ALTER TABLE user_settings
      ADD COLUMN IF NOT EXISTS discord_enabled BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await db.execute(`
      ALTER TABLE user_settings
      ADD COLUMN IF NOT EXISTS tracking_paused BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await db.execute(`
      UPDATE user_settings
      SET discord_enabled = TRUE
      WHERE discord_enabled = FALSE
        AND discord_channel_id IS NOT NULL
        AND (
          discord_bot_token_ciphertext IS NOT NULL
          OR discord_bot_token IS NOT NULL
        )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS alert_notifications (
        user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        fingerprint TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, fingerprint)
      )
    `);

    await db.execute(`
      ALTER TABLE watch_rules
      ADD COLUMN IF NOT EXISTS sort_order INTEGER
    `);

    await db.execute(`
      WITH ordered_rules AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY created_at ASC, id ASC
          ) AS next_sort_order
        FROM watch_rules
      )
      UPDATE watch_rules AS target
      SET sort_order = ordered_rules.next_sort_order
      FROM ordered_rules
      WHERE target.id = ordered_rules.id
        AND target.sort_order IS NULL
    `);

    await db.execute(`
      ALTER TABLE watch_rules
      ALTER COLUMN sort_order SET NOT NULL
    `);

    await db.execute(`
      ALTER TABLE seller_observations
      ADD COLUMN IF NOT EXISTS alert_state TEXT
    `);
  })();

  return schemaReady;
}

async function ensureDefaultUser() {
  await ensureSchema();
  const db = getDatabase();

  await db
    .insert(appUsers)
    .values({
      createdAt: new Date(),
      email: null,
      id: DEFAULT_USER_ID,
    })
    .onConflictDoNothing();
}

function mapRuleRecord(
  record: typeof watchRules.$inferSelect,
): WatchRuleRecord {
  return {
    createdAt: record.createdAt.toISOString(),
    crossplay: record.crossplay,
    enabled: record.enabled,
    id: record.id,
    itemSlug: record.itemSlug,
    maxPlatinum: record.maxPlatinum,
    platform: record.platform as "pc",
    sortOrder: record.sortOrder,
    updatedAt: record.updatedAt.toISOString(),
    userId: record.userId,
  };
}

function mapAlertRecord(record: typeof alerts.$inferSelect): AlertRecord {
  return {
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    itemSlug: record.itemSlug,
    lastSeen: record.lastSeen.toISOString(),
    observedAt: record.observedAt.toISOString(),
    platinum: record.platinum,
    readAt: record.readAt?.toISOString() ?? null,
    ruleId: record.ruleId,
    sellerId: record.sellerId,
    sellerName: record.sellerName,
    sellerSlug: record.sellerSlug,
    status: record.status as WatchAlert["status"],
    userId: record.userId,
  };
}

function mapObservationRecord(
  record: typeof sellerObservations.$inferSelect,
): SellerObservation {
  const observation: SellerObservation = {
    lastSeen: record.lastSeen.toISOString(),
    platinum: record.platinum,
    sellerId: record.sellerId,
    sellerSlug: record.sellerSlug,
    status: record.status as SellerObservation["status"],
  };

  if (record.alertState === "pending" || record.alertState === "sent") {
    observation.alertState = record.alertState;
  }

  return observation;
}

export async function listDashboardSnapshot(): Promise<DashboardSnapshot> {
  await ensureDefaultUser();
  const [alerts, rules] = await Promise.all([listAlerts(), listWatchRules()]);

  return {
    alerts,
    rules,
  };
}

export async function listWatchRules(): Promise<WatchRuleRecord[]> {
  await ensureDefaultUser();
  const db = getDatabase();
  const records = await db
    .select()
    .from(watchRules)
    .where(eq(watchRules.userId, DEFAULT_USER_ID))
    .orderBy(asc(watchRules.sortOrder), asc(watchRules.createdAt));

  return records.map(mapRuleRecord);
}

export async function getWatchRule(
  ruleId: string,
): Promise<WatchRuleRecord | null> {
  await ensureDefaultUser();
  const db = getDatabase();
  const [record] = await db
    .select()
    .from(watchRules)
    .where(
      and(eq(watchRules.id, ruleId), eq(watchRules.userId, DEFAULT_USER_ID)),
    )
    .limit(1);

  return record ? mapRuleRecord(record) : null;
}

export async function createWatchRule(
  input: CreateWatchRuleInput,
): Promise<WatchRuleRecord> {
  await ensureDefaultUser();
  const db = getDatabase();
  const [lastRule] = await db
    .select({
      sortOrder: watchRules.sortOrder,
    })
    .from(watchRules)
    .where(eq(watchRules.userId, DEFAULT_USER_ID))
    .orderBy(desc(watchRules.sortOrder))
    .limit(1);
  const [record] = await db
    .insert(watchRules)
    .values({
      createdAt: new Date(),
      crossplay: input.crossplay,
      enabled: true,
      id: crypto.randomUUID(),
      itemSlug: input.itemSlug,
      maxPlatinum: input.maxPlatinum,
      platform: input.platform,
      sortOrder: (lastRule?.sortOrder ?? 0) + 1,
      updatedAt: new Date(),
      userId: DEFAULT_USER_ID,
    })
    .returning();

  if (!record) {
    throw new Error("failed to create watch rule");
  }

  return mapRuleRecord(record);
}

export async function resetDemoState(seed: ResetSeed): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await db.transaction(async (tx) => {
    await tx
      .delete(userSettings)
      .where(eq(userSettings.userId, DEFAULT_USER_ID));
    await tx
      .delete(alertNotifications)
      .where(eq(alertNotifications.userId, DEFAULT_USER_ID));
    await tx.delete(alerts).where(eq(alerts.userId, DEFAULT_USER_ID));
    await tx.delete(watchRules).where(eq(watchRules.userId, DEFAULT_USER_ID));

    if (seed === "demo") {
      const [demoRule] = await tx
        .insert(watchRules)
        .values({
          createdAt: new Date(),
          crossplay: true,
          enabled: true,
          id: crypto.randomUUID(),
          itemSlug: "arcane_barrier",
          maxPlatinum: 10,
          platform: "pc",
          sortOrder: 1,
          updatedAt: new Date(),
          userId: DEFAULT_USER_ID,
        })
        .returning();

      if (demoRule) {
        await tx.insert(alerts).values({
          createdAt: new Date(),
          id: crypto.randomUUID(),
          itemSlug: demoRule.itemSlug,
          lastSeen: new Date(),
          observedAt: new Date(),
          platinum: 9,
          readAt: null,
          ruleId: demoRule.id,
          sellerId: "demo-seller-1",
          sellerName: "LotusRelay",
          sellerSlug: "lotusrelay",
          status: "online",
          userId: DEFAULT_USER_ID,
        });
      }
    }
  });
}

export async function updateWatchRule(
  ruleId: string,
  input: {
    enabled?: boolean;
    maxPlatinum?: number;
  },
): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();
  const nextValues: {
    enabled?: boolean;
    maxPlatinum?: number;
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (input.enabled !== undefined) {
    nextValues.enabled = input.enabled;
  }

  if (input.maxPlatinum !== undefined) {
    nextValues.maxPlatinum = input.maxPlatinum;
  }

  await db
    .update(watchRules)
    .set(nextValues)
    .where(
      and(eq(watchRules.id, ruleId), eq(watchRules.userId, DEFAULT_USER_ID)),
    );
}

export async function deleteWatchRule(ruleId: string): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await db
    .delete(watchRules)
    .where(
      and(eq(watchRules.id, ruleId), eq(watchRules.userId, DEFAULT_USER_ID)),
    );
}

export async function listEnabledWatchRules(): Promise<WatchRuleRecord[]> {
  await ensureDefaultUser();
  const db = getDatabase();
  const records = await db
    .select()
    .from(watchRules)
    .where(
      and(eq(watchRules.enabled, true), eq(watchRules.userId, DEFAULT_USER_ID)),
    )
    .orderBy(asc(watchRules.sortOrder), asc(watchRules.createdAt));

  return records.map(mapRuleRecord);
}

export async function getUserSettings(): Promise<UserSettings | null> {
  await ensureDefaultUser();
  const db = getDatabase();
  const [record] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, DEFAULT_USER_ID))
    .limit(1);

  if (!record) {
    return null;
  }

  const discordBotToken = await readDiscordBotTokenFromRecord({
    record,
    persistMigration: async (value) => {
      await db
        .update(userSettings)
        .set({
          ...value,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, record.userId));
    },
  });

  return {
    discordBotToken,
    discordChannelId: record.discordChannelId,
    discordEnabled: record.discordEnabled,
    trackingPaused: record.trackingPaused,
  };
}

export async function getUserSettingsState(): Promise<UserSettingsState | null> {
  await ensureDefaultUser();
  const db = getDatabase();
  let [record] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, DEFAULT_USER_ID))
    .limit(1);

  if (!record) {
    return null;
  }

  if (
    !hasEncryptedDiscordBotToken(record) &&
    hasPlaintextDiscordBotToken(record)
  ) {
    try {
      const encryptedColumns = await buildEncryptedDiscordBotTokenColumns(
        record.discordBotToken!,
      );

      await db
        .update(userSettings)
        .set({
          ...mapEncryptedDiscordBotTokenColumns(encryptedColumns),
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, record.userId));

      [record] = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, DEFAULT_USER_ID))
        .limit(1);
    } catch {
      // Keep reporting presence even if migration cannot happen yet.
    }
  }

  if (!record) {
    return null;
  }

  return {
    discordChannelId: record.discordChannelId,
    discordEnabled: record.discordEnabled,
    hasDiscordBotToken:
      hasEncryptedDiscordBotToken(record) ||
      hasPlaintextDiscordBotToken(record),
    trackingPaused: record.trackingPaused,
  };
}

export async function updateUserSettings(
  input: UpdateUserSettingsInput,
): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();
  const [existingRecord] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, DEFAULT_USER_ID))
    .limit(1);
  const discordBotTokenColumns =
    input.discordBotToken === PRESERVE_DISCORD_BOT_TOKEN
      ? await buildPreservedDiscordBotTokenColumns(existingRecord)
      : input.discordBotToken === null
        ? {
            discordBotToken: null,
            discordBotTokenCiphertext: null,
            discordBotTokenIv: null,
            discordBotTokenKeyVersion: null,
          }
        : mapEncryptedDiscordBotTokenColumns(
            await buildEncryptedDiscordBotTokenColumns(input.discordBotToken),
          );

  await db
    .insert(userSettings)
    .values({
      ...discordBotTokenColumns,
      discordChannelId: input.discordChannelId,
      discordEnabled: input.discordEnabled,
      trackingPaused: input.trackingPaused,
      updatedAt: new Date(),
      userId: DEFAULT_USER_ID,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        ...discordBotTokenColumns,
        discordChannelId: input.discordChannelId,
        discordEnabled: input.discordEnabled,
        trackingPaused: input.trackingPaused,
        updatedAt: new Date(),
      },
    });
}

export async function reorderWatchRules(ruleIds: string[]): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await db.transaction(async (tx) => {
    for (const [index, ruleId] of ruleIds.entries()) {
      await tx
        .update(watchRules)
        .set({
          sortOrder: index + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(watchRules.id, ruleId),
            eq(watchRules.userId, DEFAULT_USER_ID),
          ),
        );
    }
  });
}

export async function listAlerts(limit = 20): Promise<AlertRecord[]> {
  await ensureDefaultUser();
  const db = getDatabase();
  const records = await db
    .select()
    .from(alerts)
    .where(eq(alerts.userId, DEFAULT_USER_ID))
    .orderBy(desc(alerts.createdAt))
    .limit(limit);

  return records.map(mapAlertRecord);
}

export async function markAlertRead(alertId: string): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await db
    .update(alerts)
    .set({
      readAt: new Date(),
    })
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, DEFAULT_USER_ID)));
}

export async function deleteAlert(alertId: string): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await db
    .delete(alerts)
    .where(and(eq(alerts.id, alertId), eq(alerts.userId, DEFAULT_USER_ID)));
}

export async function clearAlertsForUser(): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await db.delete(alerts).where(eq(alerts.userId, DEFAULT_USER_ID));
}

export async function getSellerObservations(
  ruleId: string,
): Promise<SellerObservation[]> {
  await ensureDefaultUser();
  const db = getDatabase();
  const records = await db
    .select()
    .from(sellerObservations)
    .where(eq(sellerObservations.ruleId, ruleId));

  return records.map(mapObservationRecord);
}

export async function getSellerObservationsByRuleIds(
  ruleIds: string[],
): Promise<Record<string, SellerObservation[]>> {
  if (ruleIds.length === 0) {
    return {};
  }

  await ensureDefaultUser();
  const db = getDatabase();
  const records = await db
    .select()
    .from(sellerObservations)
    .where(inArray(sellerObservations.ruleId, ruleIds));
  const observationsByRuleId: Record<string, SellerObservation[]> =
    Object.fromEntries(ruleIds.map((ruleId) => [ruleId, []]));

  for (const record of records) {
    observationsByRuleId[record.ruleId] ??= [];
    observationsByRuleId[record.ruleId]!.push(mapObservationRecord(record));
  }

  return observationsByRuleId;
}

export async function replaceSellerObservations(
  ruleId: string,
  observations: SellerObservation[],
): Promise<void> {
  await ensureDefaultUser();
  const db = getDatabase();

  await replaceSellerObservationRows({
    db,
    observations,
    ruleId,
    sellerObservationsTable: sellerObservations,
    whereRuleId: (currentRuleId) =>
      eq(sellerObservations.ruleId, currentRuleId),
  });
}

export async function replaceSellerObservationsByRuleIds(
  observationsByRuleId: Record<string, SellerObservation[]>,
): Promise<void> {
  const ruleIds = Object.keys(observationsByRuleId);

  if (ruleIds.length === 0) {
    return;
  }

  await ensureDefaultUser();
  const db = getDatabase();

  await replaceSellerObservationRowsByRuleId({
    db,
    observationsByRuleId,
    ruleIds,
    sellerObservationsTable: sellerObservations,
    whereRuleIds: (currentRuleIds) =>
      inArray(sellerObservations.ruleId, currentRuleIds),
  });
}

export async function createAlerts(
  entries: WatchAlert[],
): Promise<WatchAlert[]> {
  if (entries.length === 0) {
    return [];
  }

  await ensureDefaultUser();
  const db = getDatabase();
  return persistAlertRows({
    alertNotificationsTable: alertNotifications,
    alertsTable: alerts,
    db,
    entries,
    fingerprintColumn: alertNotifications.fingerprint,
    userId: DEFAULT_USER_ID,
  });
}

export async function syncRuleEvaluation(
  ruleId: string,
  entries: {
    alerts: WatchAlert[];
    observations: SellerObservation[];
  },
): Promise<WatchAlert[]> {
  await ensureDefaultUser();
  const db = getDatabase();

  return persistRuleEvaluation({
    alerts: entries.alerts,
    alertNotificationsTable: alertNotifications,
    alertsTable: alerts,
    db,
    fingerprintColumn: alertNotifications.fingerprint,
    observations: entries.observations,
    ruleId,
    sellerObservationsTable: sellerObservations,
    userId: DEFAULT_USER_ID,
    whereRuleId: (currentRuleId) =>
      eq(sellerObservations.ruleId, currentRuleId),
  });
}

export async function syncItemEvaluationBatch(
  entries: RuleEvaluationBatchEntry[],
): Promise<WatchAlert[]> {
  if (entries.length === 0) {
    return [];
  }

  await ensureDefaultUser();
  const db = getDatabase();

  return persistEvaluationBatch({
    alertNotificationsTable: alertNotifications,
    alertsTable: alerts,
    db,
    entries,
    fingerprintColumn: alertNotifications.fingerprint,
    sellerObservationsTable: sellerObservations,
    userId: DEFAULT_USER_ID,
    whereRuleIds: (ruleIds) => inArray(sellerObservations.ruleId, ruleIds),
  });
}
