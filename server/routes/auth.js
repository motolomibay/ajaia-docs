import { Router } from 'express';
import { COOKIE, requireUser } from '../auth.js';

export function authRoutes(db, { secure }) {
  const r = Router();
  const all = db.prepare('SELECT id, username, name FROM users ORDER BY id');
  const byUsername = db.prepare('SELECT id, username, name FROM users WHERE username = ?');

  r.get('/users', (_req, res) => res.json(all.all()));

  r.post('/login', (req, res) => {
    const username = req.body?.username;
    if (typeof username !== 'string' || !username.trim()) {
      return res.status(400).json({ error: 'username is required' });
    }
    const user = byUsername.get(username.trim().toLowerCase());
    if (!user) return res.status(400).json({ error: 'Unknown user' });
    res.cookie(COOKIE, String(user.id), {
      signed: true, httpOnly: true, sameSite: 'lax', secure, maxAge: 7 * 24 * 3600 * 1000,
    });
    res.json(user);
  });

  r.post('/logout', (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  r.get('/me', requireUser, (req, res) => res.json(req.user));
  return r;
}
