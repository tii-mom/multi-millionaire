-- 002_squads.sql
-- Squad tables for wave-scoped team formation and leaderboard aggregation.

CREATE TABLE IF NOT EXISTS squads (
  id SERIAL PRIMARY KEY,
  wave_id INT NOT NULL REFERENCES waves(wave_id),
  name TEXT NOT NULL,
  captain_user_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','frozen','archived')),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS squad_members (
  id SERIAL PRIMARY KEY,
  wave_id INT NOT NULL REFERENCES waves(wave_id),
  squad_id INT NOT NULL REFERENCES squads(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('captain','member')),
  status TEXT NOT NULL DEFAULT 'joined_pending' CHECK (status IN ('joined_pending','activated','removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  UNIQUE (wave_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_squads_wave_id ON squads(wave_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_wave_squad ON squad_members(wave_id, squad_id);
CREATE INDEX IF NOT EXISTS idx_squad_members_user_wave ON squad_members(user_id, wave_id);
