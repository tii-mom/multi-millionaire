-- 004_risk.sql
-- Risk review flags for users, positions, and reward ledgers.

CREATE TABLE IF NOT EXISTS risk_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user','position','reward_ledger')),
  entity_id TEXT NOT NULL,
  flag_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL CHECK (status IN ('open','reviewing','resolved','dismissed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_flags_entity ON risk_flags(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_risk_flags_status ON risk_flags(status);
CREATE INDEX IF NOT EXISTS idx_risk_flags_type ON risk_flags(flag_type);
