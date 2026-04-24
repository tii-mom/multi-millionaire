-- 005_production_chain_ops.sql
-- Production-readiness tables for wallet ownership, chain event review,
-- operational controls, and admin audit history.

CREATE TABLE IF NOT EXISTS wallet_bind_intents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  nonce TEXT NOT NULL UNIQUE,
  message_domain TEXT NOT NULL,
  signable_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','expired','cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_bindings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  normalized_address TEXT NOT NULL,
  wallet_type TEXT,
  status TEXT NOT NULL DEFAULT 'verified' CHECK (status IN ('pending','verified','revoked')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, normalized_address)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_bindings_one_primary
  ON wallet_bindings(user_id, chain_id)
  WHERE is_primary = TRUE AND status = 'verified';

CREATE INDEX IF NOT EXISTS idx_wallet_bindings_user_chain
  ON wallet_bindings(user_id, chain_id);

CREATE TABLE IF NOT EXISTS chain_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  contract_role TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INT NOT NULL,
  block_number BIGINT,
  block_time TIMESTAMPTZ,
  finalized BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  apply_status TEXT NOT NULL DEFAULT 'pending' CHECK (apply_status IN ('pending','applied','review_required','rejected')),
  review_reason TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_events_apply_status
  ON chain_events(apply_status);

CREATE INDEX IF NOT EXISTS idx_chain_events_tx
  ON chain_events(chain_id, tx_hash);

CREATE TABLE IF NOT EXISTS app_controls (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_controls (key, enabled, reason)
VALUES
  ('pause_deposits', FALSE, NULL),
  ('pause_reward_claims', FALSE, NULL),
  ('pause_referral_rewards', FALSE, NULL),
  ('maintenance_banner', FALSE, NULL)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity
  ON admin_audit_logs(entity_type, entity_id);
