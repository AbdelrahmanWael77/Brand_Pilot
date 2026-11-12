import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS companies (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'owner',
  PRIMARY KEY (user_id, company_id)
);
CREATE INDEX IF NOT EXISTS memberships_company ON memberships(company_id);
CREATE TABLE IF NOT EXISTS company_state (
  company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Knowledge mirror: rewritten from the state blob on every state save (see knowledge.js).
CREATE TABLE IF NOT EXISTS sources (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL,
  text       TEXT,
  demo       INTEGER NOT NULL DEFAULT 0,
  date       TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
);
CREATE TABLE IF NOT EXISTS facts (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  cat        TEXT NOT NULL,
  text       TEXT NOT NULL,
  type       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  src        TEXT,
  ev         TEXT NOT NULL,
  needs      INTEGER NOT NULL DEFAULT 0,
  date       TEXT NOT NULL,
  PRIMARY KEY (company_id, id)
);
CREATE INDEX IF NOT EXISTS facts_company_status ON facts(company_id, status);
`;

export function initSchema(db) {
  db.exec(SCHEMA);
}

/** Open (and create if needed) the BrandPilot database. Pass ':memory:' in tests. */
export function openDb(file = process.env.BRANDPILOT_DB || 'data/brandpilot.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  initSchema(db);
  return db;
}
