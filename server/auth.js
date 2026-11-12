import express from 'express';
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'bp_session';
const SESSION_DAYS = 30;
const KEYLEN = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Only the SHA-256 of the session token is stored, so a leaked DB cannot be replayed as cookies.
const tokenId = (token) => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function cookieHeader(value, maxAgeSeconds) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs.join('; ');
}

function parseCredentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'invalid_email' };
  if (password.length < 8 || password.length > 200) return { error: 'invalid_password' };
  return { email, password };
}

export function createAuth(db) {
  const q = {
    userByEmail: db.prepare('SELECT id, email, password_hash FROM users WHERE email = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE id = ?'),
    sessionUser: db.prepare(
      `SELECT u.id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    ),
  };
  // Verified against when the email is unknown, so both failure paths cost one scrypt.
  const dummyHash = hashPassword(crypto.randomBytes(16).toString('hex'));

  function startSession(res, userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
    q.insertSession.run(tokenId(token), userId, expires);
    res.setHeader('Set-Cookie', cookieHeader(token, SESSION_DAYS * 86400));
  }

  /** Returns { id, email } for a valid, unexpired session cookie, else null. */
  function currentUser(req) {
    const token = readCookie(req, COOKIE);
    if (!token) return null;
    const id = tokenId(token);
    const row = q.sessionUser.get(id);
    if (!row) return null;
    if (row.expires_at <= new Date().toISOString()) {
      q.deleteSession.run(id);
      return null;
    }
    return { id: row.id, email: row.email };
  }

  function requireAuth(req, res, next) {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'unauthenticated' });
    req.user = user;
    next();
  }

  const router = express.Router();

  router.post('/register', async (req, res) => {
    const c = parseCredentials(req.body);
    if (c.error) return res.status(400).json({ error: c.error });
    if (q.userByEmail.get(c.email)) return res.status(409).json({ error: 'email_taken' });
    const user = { id: crypto.randomUUID(), email: c.email };
    const hash = await hashPassword(c.password);
    try {
      q.insertUser.run(user.id, user.email, hash, new Date().toISOString());
    } catch (e) {
      // Lost a race with a concurrent registration of the same email.
      if (/UNIQUE/.test(String(e?.message))) return res.status(409).json({ error: 'email_taken' });
      throw e;
    }
    startSession(res, user.id);
    res.status(201).json({ user });
  });

  router.post('/login', async (req, res) => {
    const c = parseCredentials(req.body);
    const row = c.error ? null : q.userByEmail.get(c.email);
    const ok = await verifyPassword(c.password ?? '', row ? row.password_hash : await dummyHash);
    if (!row || !ok) return res.status(401).json({ error: 'invalid_credentials' });
    startSession(res, row.id);
    res.json({ user: { id: row.id, email: row.email } });
  });

  router.post('/logout', (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) q.deleteSession.run(tokenId(token));
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

  return { router, requireAuth, currentUser };
}
