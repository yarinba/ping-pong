CREATE TABLE IF NOT EXISTS pings (
  id            UUID PRIMARY KEY,
  message       TEXT NOT NULL,
  response      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pings_created_at ON pings (created_at DESC);
