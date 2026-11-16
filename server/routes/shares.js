import { Router } from 'express';
import { requireRole } from '../access.js';
import { HttpError, parseId } from '../validate.js';

const ROLES = ['editor', 'viewer'];

function parseRole(raw) {
  if (!ROLES.includes(raw)) throw new HttpError(400, 'Role must be "editor" or "viewer"');
  return raw;
}

// Only the owner can see, grant, change or revoke access.
export function shareRoutes(db, { now }) {
  const r = Router();
  const owner = requireRole(db, 'owner');
  const list = db.prepare(`SELECT u.id AS user_id, u.username, u.name, s.role
                           FROM shares s JOIN users u ON u.id = s.user_id
                           WHERE s.document_id = ? ORDER BY u.name`);
  const userByName = db.prepare('SELECT id FROM users WHERE username = ?');
  const upsert = db.prepare(`INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
                             ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`);
  const setRole = db.prepare('UPDATE shares SET role = ? WHERE document_id = ? AND user_id = ?');
  const remove = db.prepare('DELETE FROM shares WHERE document_id = ? AND user_id = ?');

  r.get('/documents/:id/shares', owner, (req, res) => res.json(list.all(req.doc.id)));

  r.post('/documents/:id/shares', owner, (req, res) => {
    const { username, role } = req.body ?? {};
    if (typeof username !== 'string' || !username.trim()) throw new HttpError(400, 'Choose a user to share with');
    const target = userByName.get(username.trim().toLowerCase());
    if (!target) throw new HttpError(400, 'Unknown user');
    if (target.id === req.user.id) throw new HttpError(400, 'You already own this document');
    upsert.run(req.doc.id, target.id, parseRole(role), new Date(now()).toISOString());
    res.status(201).json(list.all(req.doc.id));
  });

  r.patch('/documents/:id/shares/:userId', owner, (req, res) => {
    const { changes } = setRole.run(parseRole(req.body?.role), req.doc.id, parseId(req.params.userId));
    if (!changes) throw new HttpError(404, 'This user does not have access');
    res.json(list.all(req.doc.id));
  });

  r.delete('/documents/:id/shares/:userId', owner, (req, res) => {
    const { changes } = remove.run(req.doc.id, parseId(req.params.userId));
    if (!changes) throw new HttpError(404, 'This user does not have access');
    res.json(list.all(req.doc.id));
  });

  return r;
}
