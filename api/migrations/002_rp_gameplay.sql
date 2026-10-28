BEGIN;

CREATE TABLE IF NOT EXISTS public.rp_character_stats (
  character_id UUID PRIMARY KEY REFERENCES public.rp_characters(id) ON DELETE CASCADE,
  health NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (health >= 0 AND health <= 100),
  hunger SMALLINT NOT NULL DEFAULT 100 CHECK (hunger BETWEEN 0 AND 100),
  thirst SMALLINT NOT NULL DEFAULT 100 CHECK (thirst BETWEEN 0 AND 100),
  experience BIGINT NOT NULL DEFAULT 0 CHECK (experience >= 0),
  job_code VARCHAR(40) NOT NULL DEFAULT 'unemployed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rp_items (
  item_code VARCHAR(48) PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  stackable BOOLEAN NOT NULL DEFAULT true,
  metadata_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rp_character_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.rp_characters(id) ON DELETE CASCADE,
  item_code VARCHAR(48) NOT NULL REFERENCES public.rp_items(item_code),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 1000000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rp_character_inventory_character_idx
  ON public.rp_character_inventory(character_id);

ALTER TABLE public.rp_vehicles
  ADD COLUMN IF NOT EXISTS character_id UUID REFERENCES public.rp_characters(id) ON DELETE SET NULL;
ALTER TABLE public.rp_vehicles
  ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{"locked":true,"fuel":100,"health":1000}'::jsonb;
ALTER TABLE public.rp_vehicles
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.rp_wallet_operations (
  idempotency_key UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.rp_accounts(id) ON DELETE RESTRICT,
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount_ac NUMERIC(20,0) NOT NULL CHECK (amount_ac > 0),
  reason VARCHAR(32) NOT NULL CHECK (
    reason IN ('vehicle_purchase', 'vehicle_sale', 'mission_reward', 'job_reward', 'item_purchase', 'refund')
  ),
  reference VARCHAR(100) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  provider_transaction_id VARCHAR(120),
  balance_after_ac NUMERIC(20,0) CHECK (balance_after_ac >= 0),
  failure_code VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rp_wallet_operations_account_created_idx
  ON public.rp_wallet_operations(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.rp_moderation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES public.rp_accounts(id) ON DELETE SET NULL,
  actor_id VARCHAR(80) NOT NULL,
  action_code VARCHAR(24) NOT NULL CHECK (
    action_code IN ('warn', 'mute', 'kick', 'ban', 'unban', 'note')
  ),
  reason VARCHAR(300) NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rp_moderation_actions_account_created_idx
  ON public.rp_moderation_actions(account_id, created_at DESC);

INSERT INTO public.rp_items (item_code, display_name, stackable) VALUES
  ('water_bottle', 'Бутылка воды', true),
  ('sandwich', 'Сэндвич', true),
  ('phone', 'Телефон', false),
  ('repair_kit', 'Ремкомплект', true),
  ('first_aid_kit', 'Аптечка', true)
ON CONFLICT (item_code) DO NOTHING;

REVOKE ALL ON TABLE public.rp_character_stats, public.rp_items,
  public.rp_character_inventory, public.rp_wallet_operations,
  public.rp_moderation_actions FROM PUBLIC, rp_anon;

COMMIT;
