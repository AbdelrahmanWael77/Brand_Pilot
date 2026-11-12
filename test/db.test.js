import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, initSchema } from '../server/db.js';

const now = () => new Date().toISOString();

test('schema init is idempotent', () => {
  const db = openDb(':memory:');
  assert.doesNotThrow(() => initSchema(db));
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  assert.deepEqual(tables, ['campaign_assets', 'campaign_mirror', 'campaigns', 'companies', 'company_state', 'data_mirror', 'data_rows', 'facts', 'memberships', 'report_schedules', 'reports', 'sessions', 'sources', 'users']);
  db.close();
});

test('user, company and membership round-trip', () => {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)').run('u1', 'a@example.com', 'hash', now());
  db.prepare('INSERT INTO companies (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run('c1', 'FlowNest', 'u1', now());
  db.prepare('INSERT INTO memberships (user_id, company_id, role) VALUES (?, ?, ?)').run('u1', 'c1', 'owner');

  const row = db
    .prepare(
      `SELECT u.email, c.name, m.role FROM memberships m
       JOIN users u ON u.id = m.user_id JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = ?`,
    )
    .get('u1');
  assert.deepEqual({ ...row }, { email: 'a@example.com', name: 'FlowNest', role: 'owner' });
  db.close();
});

test('duplicate email is rejected, case-insensitively', () => {
  const db = openDb(':memory:');
  const ins = db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
  ins.run('u1', 'a@example.com', 'hash', now());
  assert.throws(() => ins.run('u2', 'A@Example.com', 'hash', now()), /UNIQUE/);
  db.close();
});

test('foreign keys are enforced', () => {
  const db = openDb(':memory:');
  assert.throws(
    () => db.prepare('INSERT INTO memberships (user_id, company_id, role) VALUES (?, ?, ?)').run('nobody', 'nothing', 'owner'),
    /FOREIGN KEY/,
  );
  db.close();
});
