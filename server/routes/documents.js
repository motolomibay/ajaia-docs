import { Router } from 'express';
import { requireUser } from '../auth.js';
import { requireRole } from '../access.js';
import { sanitize } from '../sanitize.js';
import { HttpError, parseId, parseTitle, parseContent } from '../validate.js';
import { versionStore } from '../versions.js';

const DEFAULT_TITLE = 'Untitled document';

export function documentRoutes(db, { now }) {
  const r = Router();
  const versions = versionStore(db);

  const listOwned = db.prepare(`SELECT id, title, updated_at FROM documents WHERE owner_id = ? ORDER BY updated_at DESC, id DESC`);
  const insertDoc = db.prepare(`INSERT INTO documents (owner_id, title, content_html, updated_by, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?)`);
  const byId = db.prepare('SELECT * FROM documents WHERE id = ?');
  const updateDoc = db.prepare(`UPDATE documents SET title = ?, content_html = ?, updated_by = ?, updated_at = ? WHERE id = ?`);
  const listVersions = db.prepare(`SELECT v.id, v.title, v.created_at, u.name AS author
                                   FROM document_versions v JOIN users u ON u.id = v.created_by
                                   WHERE v.document_id = ? ORDER BY v.id DESC`);
  const versionById = db.prepare('SELECT * FROM document_versions WHERE id = ? AND document_id = ?');

  // Timestamps must strictly increase per document so "updated_at advances" holds even within one millisecond.
  function stamp(prev) {
    const t = now();
    const p = prev ? Date.parse(prev) : 0;
    return new Date(Math.max(t, p + 1)).toISOString();
  }

  const toClient = (doc, role) => ({
    id: doc.id, title: doc.title, content_html: doc.content_html,
    owner_id: doc.owner_id, created_at: doc.created_at, updated_at: doc.updated_at, role,
  });

  r.get('/documents', requireUser, (req, res) => {
    res.json({ owned: listOwned.all(req.user.id), shared: [] });
  });

  r.post('/documents', requireUser, (req, res) => {
    const title = req.body?.title === undefined ? DEFAULT_TITLE : parseTitle(req.body.title);
    const ts = stamp();
    const { lastInsertRowid } = insertDoc.run(req.user.id, title, '', req.user.id, ts, ts);
    res.status(201).json(toClient(byId.get(lastInsertRowid), 'owner'));
  });

  r.get('/documents/:id', requireRole(db, 'owner'), (req, res) => {
    res.json(toClient(req.doc, req.role));
  });

  const save = db.transaction((doc, title, content, userId) => {
    versions.maybeSnapshot(doc, now());
    updateDoc.run(title, content, userId, stamp(doc.updated_at), doc.id);
    return byId.get(doc.id);
  });

  r.patch('/documents/:id', requireRole(db, 'owner'), (req, res) => {
    const body = req.body ?? {};
    if (body.title === undefined && body.content_html === undefined) throw new HttpError(400, 'Nothing to update');
    const title = body.title === undefined ? req.doc.title : parseTitle(body.title);
    const content = body.content_html === undefined ? req.doc.content_html : sanitize(parseContent(body.content_html));
    res.json(toClient(save(req.doc, title, content, req.user.id), req.role));
  });

  r.get('/documents/:id/versions', requireRole(db, 'owner'), (req, res) => {
    res.json(listVersions.all(req.doc.id));
  });

  const restore = db.transaction((doc, version, userId) => {
    versions.snapshot(doc, new Date(now()).toISOString()); // so the restore itself can be undone
    updateDoc.run(version.title, version.content_html, userId, stamp(doc.updated_at), doc.id);
    return byId.get(doc.id);
  });

  r.post('/documents/:id/versions/:vid/restore', requireRole(db, 'owner'), (req, res) => {
    const version = versionById.get(parseId(req.params.vid), req.doc.id);
    if (!version) throw new HttpError(404, 'Version not found');
    res.json(toClient(restore(req.doc, version, req.user.id), req.role));
  });

  return r;
}
