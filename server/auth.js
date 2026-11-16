import { HttpError } from './validate.js';

// Mocked login: the signed cookie holds the user id. A tampered or unknown value means "not logged in".
export const COOKIE = 'uid';
// The browser tab tells us which user it believes it is. All tabs share one cookie, so if another tab logged out or
// switched user, this header no longer matches the cookie and the request is refused instead of running as someone else.
export const EXPECT_HEADER = 'x-expect-user';

export function loadUser(db) {
  const byId = db.prepare('SELECT id, username, name FROM users WHERE id = ?');
  return (req, _res, next) => {
    const raw = req.signedCookies?.[COOKIE];
    const id = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : null;
    req.user = id ? byId.get(id) ?? null : null;
    const expected = req.get(EXPECT_HEADER);
    if (expected !== undefined && String(req.user?.id ?? '') !== expected) {
      req.user = null;
      req.sessionChanged = true;
    }
    next();
  };
}

export function notLoggedIn(req) {
  return req.sessionChanged
    ? new HttpError(401, 'Your session changed in another tab', 'SESSION_CHANGED')
    : new HttpError(401, 'Please log in', 'LOGGED_OUT');
}

export function requireUser(req, _res, next) {
  if (!req.user) throw notLoggedIn(req);
  next();
}
