-- 001_init.sql
-- Initial schema for the 72H Millionaire project.  This migration defines
-- the core tables required to support user accounts, waves, passes,
-- deposit positions and referrals.  Additional tables (e.g. reward
-- ledgers, squads, risk flags) can be added in subsequent migrations.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Waves table. Each wave defines a 72 hour event window. The columns mirror
-- the Wave model so the bootstrap endpoint can return a complete payload.
CREATE TABLE IF NOT EXISTS waves (
  wave_id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','upcoming','live','closed','settling','archived','cancelled')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  min_lock_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  unlock_multiplier_bps INT NOT NULL DEFAULT 15000,
  price_freshness_ttl_seconds INT NOT NULL DEFAULT 3600,
  reward_budget NUMERIC(78,0) NOT NULL DEFAULT 0,
  direct_reward_rate_bps INT NOT NULL DEFAULT 100,
  per_invite_cap NUMERIC(78,0) NOT NULL DEFAULT 0,
  inviter_wave_cap NUMERIC(78,0) NOT NULL DEFAULT 0,
  claim_min_amount NUMERIC(78,0) NOT NULL DEFAULT 0,
  counted_member_cap INT,
  settle_delay_seconds INT NOT NULL DEFAULT 86400,
  deposits_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waves_start_before_end CHECK (start_time < end_time)
);

-- Admin submitted price rounds. In production, confirmed rows should be tied
-- to a chain transaction or signed administrator action.
CREATE TABLE IF NOT EXISTS price_rounds (
  round_id SERIAL PRIMARY KEY,
  price NUMERIC(38,0) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('submitted','confirmed','rejected')),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rush passes. Each user may claim at most one pass per wave.
CREATE TABLE IF NOT EXISTS rush_passes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wave_id INT NOT NULL REFERENCES waves(wave_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'claimed',
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, wave_id)
);

-- Positions table. Represents a token lock on-chain. In this simplified
-- version we store a reference to the on-chain position ID but do not
-- enforce foreign key constraints to chain tables. The actual on-chain
-- integration happens in the application layer.
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wave_id INT NOT NULL REFERENCES waves(wave_id) ON DELETE CASCADE,
  amount_raw NUMERIC(78,0) NOT NULL CHECK (amount_raw > 0),
  onchain_position_id NUMERIC(78,0) NOT NULL,
  entry_price NUMERIC(38,0) NOT NULL,
  unlock_multiplier_bps INT NOT NULL DEFAULT 15000,
  qualifies_for_activation BOOLEAN NOT NULL DEFAULT FALSE,
  is_first_qualifying_for_user BOOLEAN NOT NULL DEFAULT FALSE,
  withdrawn BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (onchain_position_id)
);

-- Referrals table. Stores inviter relationships. An invitee can have at most
-- one inviter. The relationship becomes locked once the invitee makes
-- their first qualifying lock.
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invitee_user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  inviter_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (inviter_user_id IS NULL OR inviter_user_id <> invitee_user_id)
);

-- Simple seed data for development.
INSERT INTO waves (code, name, status, start_time, end_time, min_lock_amount)
VALUES ('W001', 'First Wave', 'live', NOW(), NOW() + INTERVAL '72 hours', 1)
ON CONFLICT DO NOTHING;

INSERT INTO price_rounds (price, status, observed_at, submitted_at, confirmed_at)
VALUES (142000000, 'confirmed', NOW(), NOW(), NOW())
ON CONFLICT DO NOTHING;
