-- 006_merkle_rewards.sql
-- Merkle-claim reward distribution readiness tables.

CREATE TABLE IF NOT EXISTS merkle_reward_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain_id TEXT NOT NULL,
  token_address TEXT NOT NULL,
  merkle_root TEXT NOT NULL,
  total_amount_raw NUMERIC(78, 0) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','active','superseded','settled')),
  published_tx_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_merkle_reward_batches_status
  ON merkle_reward_batches(status);

CREATE TABLE IF NOT EXISTS merkle_reward_proofs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID NOT NULL REFERENCES merkle_reward_batches(id) ON DELETE CASCADE,
  reward_ledger_id UUID NOT NULL REFERENCES reward_ledgers(id) ON DELETE CASCADE,
  beneficiary_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beneficiary_wallet TEXT NOT NULL,
  amount_raw NUMERIC(78, 0) NOT NULL,
  leaf_hash TEXT NOT NULL,
  proof JSONB NOT NULL DEFAULT '[]'::jsonb,
  claim_status TEXT NOT NULL DEFAULT 'proof_available' CHECK (claim_status IN ('proof_available','claim_pending','claimed','rejected')),
  claim_tx_hash TEXT,
  claim_chain_event_id UUID REFERENCES chain_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reward_ledger_id),
  UNIQUE (batch_id, beneficiary_wallet, amount_raw, reward_ledger_id)
);

CREATE INDEX IF NOT EXISTS idx_merkle_reward_proofs_beneficiary
  ON merkle_reward_proofs(beneficiary_user_id, claim_status);

CREATE INDEX IF NOT EXISTS idx_merkle_reward_proofs_batch
  ON merkle_reward_proofs(batch_id);
