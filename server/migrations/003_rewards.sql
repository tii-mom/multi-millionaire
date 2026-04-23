-- 003_rewards.sql
-- Reward ledger and future batch publication tables.

CREATE TABLE IF NOT EXISTS reward_ledgers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beneficiary_user_id UUID NOT NULL REFERENCES users(id),
  source_user_id UUID NOT NULL REFERENCES users(id),
  source_position_id UUID NOT NULL REFERENCES positions(id),
  wave_id INT NOT NULL REFERENCES waves(wave_id),
  reward_type TEXT NOT NULL DEFAULT 'direct_referral',
  gross_amount NUMERIC(78,0) NOT NULL,
  final_amount NUMERIC(78,0) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','claimed','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_position_id, reward_type)
);

CREATE TABLE IF NOT EXISTS reward_batches (
  id SERIAL PRIMARY KEY,
  wave_id INT NOT NULL REFERENCES waves(wave_id),
  merkle_root TEXT,
  total_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reward_ledgers_beneficiary_status ON reward_ledgers(beneficiary_user_id, status);
CREATE INDEX IF NOT EXISTS idx_reward_ledgers_source_position ON reward_ledgers(source_position_id);
CREATE INDEX IF NOT EXISTS idx_reward_batches_wave_id ON reward_batches(wave_id);
