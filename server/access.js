import { HttpError, parseId } from './validate.js';
import { notLoggedIn } from './auth.js';

// Role of a user on a document: 'owner' | 'editor' | 'viewer' | null (no access).
export function getRole(db, userId, doc) {
  if (doc.owner_id === userId) return 'owner';
  const share = db.prepare('SELECT role FROM shares WHERE document_id = ? AND user_id = ?').get(doc.id, userId);
  return share?.role ?? null;
}

// Route guard: loads req.doc and req.role, or fails with 400/401/404/403.
export function requireRole(db, ...allowed) {
  const byId = db.prepare('SELECT * FROM documents WHERE id = ?');
  return (req, _res, next) => {
    if (!req.user) throw notLoggedIn(req);
    const doc = byId.get(parseId(req.params.id));
    if (!doc) throw new HttpError(404, 'Document not found');
    const role = getRole(db, req.user.id, doc);
    if (!role || !allowed.includes(role)) throw new HttpError(403, 'You do not have access to this document');
    req.doc = doc;
    req.role = role;
    next();
  };
}
