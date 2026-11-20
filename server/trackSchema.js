/** P6: the saved plan and the one-time evaluation of each step that became a campaign or task (see track.js). */
export const TRACK_SCHEMA = `
CREATE TABLE IF NOT EXISTS track_steps (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('campaign', 'task')),
  ref             TEXT NOT NULL,
  rec_id          TEXT NOT NULL,
  title_en        TEXT,
  title_ar        TEXT,
  metric          TEXT,
  scope_key       TEXT,
  scope_value     TEXT,
  direction       TEXT CHECK (direction IN ('up', 'down')),
  baseline        REAL,
  baseline_n      INTEGER,
  baseline_from   TEXT,
  baseline_to     TEXT,
  target          REAL,
  window_days     INTEGER NOT NULL,
  start           TEXT NOT NULL,
  window_end      TEXT NOT NULL,
  created_by      TEXT,
  created_at      TEXT NOT NULL,
  data_hash       TEXT,
  outcome         TEXT CHECK (outcome IN ('met', 'no_change', 'not_met', 'inconclusive')),
  result          REAL,
  result_n        INTEGER,
  evaluated_at    TEXT,
  trail_id        TEXT,
  UNIQUE (company_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS track_steps_company ON track_steps (company_id, created_at);
`;
