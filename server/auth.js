// Mocked login: the signed cookie holds the user id. A tampered or unknown value means "not logged in".
export const COOKIE = 'uid';

export function loadUser(db) {
  const byId = db.prepare('SELECT id, username, name FROM users WHERE id = ?');
  return (req, _res, next) => {
    const raw = req.signedCookies?.[COOKIE];
    const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
    req.user = id ? byId.get(id) ?? null : null;
    next();
  };
}

export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in' });
  next();
}
