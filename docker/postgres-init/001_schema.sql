CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watch_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  item_slug TEXT NOT NULL,
  max_platinum INTEGER NOT NULL CHECK (max_platinum > 0),
  platform TEXT NOT NULL,
  crossplay BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  discord_bot_token TEXT,
  discord_bot_token_ciphertext TEXT,
  discord_bot_token_iv TEXT,
  discord_bot_token_key_version INTEGER,
  discord_channel_id TEXT,
  discord_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_notifications (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL REFERENCES watch_rules(id) ON DELETE CASCADE,
  item_slug TEXT NOT NULL,
  seller_id TEXT NOT NULL,
  seller_slug TEXT NOT NULL,
  seller_name TEXT NOT NULL,
  platinum INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_rule_created_at_idx
  ON alerts (rule_id, created_at DESC);

CREATE TABLE IF NOT EXISTS seller_observations (
  rule_id TEXT NOT NULL REFERENCES watch_rules(id) ON DELETE CASCADE,
  seller_id TEXT NOT NULL,
  seller_slug TEXT NOT NULL,
  platinum INTEGER NOT NULL,
  status TEXT NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (rule_id, seller_id)
);

INSERT INTO app_users (id, email)
VALUES ('local-demo-user', NULL)
ON CONFLICT (id) DO NOTHING;
