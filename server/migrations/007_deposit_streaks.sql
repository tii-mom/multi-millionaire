-- Deposit streak goals and reward ledger source metadata.

CREATE TABLE IF NOT EXISTS deposit_streak_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wave_id INT NOT NULL REFERENCES waves(wave_id) ON DELETE CASCADE,
  target_usd9 NUMERIC(78,0) NOT NULL CHECK (target_usd9 > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled','expired')),
  started_at TIMESTAMPTZ,
  completed_week_at TIMESTAMPTZ,
  completed_month_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_streak_goals_active
  ON deposit_streak_goals(user_id, wave_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_deposit_streak_goals_user_wave
  ON deposit_streak_goals(user_id, wave_id, created_at DESC);

ALTER TABLE reward_ledgers
  ALTER COLUMN source_position_id DROP NOT NULL;

ALTER TABLE reward_ledgers
  ADD COLUMN IF NOT EXISTS source_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_ledgers_source_ref
  ON reward_ledgers(beneficiary_user_id, wave_id, reward_type, source_ref)
  WHERE source_ref IS NOT NULL;

INSERT INTO app_controls (key, enabled, reason)
VALUES ('pause_deposit_streak_rewards', FALSE, NULL)
ON CONFLICT (key) DO NOTHING;
