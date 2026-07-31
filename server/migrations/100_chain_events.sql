-- 100_chain_events.sql
-- Draft storage for finalized and unfinalized contract logs.
-- This migration is intentionally not wired into the Sprint 1 deposit flow.

CREATE TABLE IF NOT EXISTS chain_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chain_id BIGINT NOT NULL,
  contract_address TEXT NOT NULL,
  event_name TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  log_index INT NOT NULL CHECK (log_index >= 0),
  block_number BIGINT NOT NULL CHECK (block_number >= 0),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  block_time TIMESTAMPTZ NOT NULL,
  finalized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (chain_id, tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_chain_events_contract_block
  ON chain_events(chain_id, contract_address, block_number);

CREATE INDEX IF NOT EXISTS idx_chain_events_name_finalized
  ON chain_events(event_name, finalized);
