BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS rp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rp_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES rp_accounts(id) ON DELETE CASCADE,
  character_name VARCHAR(24) NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  location JSONB NOT NULL DEFAULT '{"world":0,"interior":0,"x":0,"y":0,"z":3}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, character_name)
);
CREATE TABLE IF NOT EXISTS rp_account_links (
  account_id UUID PRIMARY KEY REFERENCES rp_accounts(id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rp_link_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES rp_accounts(id) ON DELETE CASCADE,
  code_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS rp_link_codes_account_idx ON rp_link_codes(account_id);
CREATE INDEX IF NOT EXISTS rp_link_codes_expiry_idx ON rp_link_codes(expires_at) WHERE consumed_at IS NULL;
CREATE TABLE IF NOT EXISTS rp_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES rp_accounts(id) ON DELETE CASCADE,
  model_id INTEGER NOT NULL CHECK (model_id > 0),
  display_name VARCHAR(80) NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rp_vehicles_account_idx ON rp_vehicles(account_id);
-- No balance_ac column: the existing ALLCOINS API remains the only source of truth for AC.
COMMIT;
