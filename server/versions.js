export const SNAPSHOT_EVERY_MS = 60_000;
export const KEEP_VERSIONS = 10;

// Version store. All writes are meant to run inside the caller's transaction.
export function versionStore(db) {
  const newest = db.prepare('SELECT created_at FROM document_versions WHERE document_id = ? ORDER BY id DESC LIMIT 1');
  const insert = db.prepare(`INSERT INTO document_versions (document_id, title, content_html, created_by, created_at)
                             VALUES (?, ?, ?, ?, ?)`);
  const prune = db.prepare(`DELETE FROM document_versions WHERE document_id = ? AND id NOT IN
                            (SELECT id FROM document_versions WHERE document_id = ? ORDER BY id DESC LIMIT ?)`);

  function snapshot(doc, nowIso) {
    insert.run(doc.id, doc.title, doc.content_html, doc.updated_by, nowIso);
    prune.run(doc.id, doc.id, KEEP_VERSIONS);
  }

  return {
    snapshot,
    // Before an update: keep the current state if the newest version is older than 60 s (or there is none).
    // A brand-new empty document is not worth a version.
    maybeSnapshot(doc, now) {
      if (!doc.content_html) return false;
      const last = newest.get(doc.id);
      if (last && now - Date.parse(last.created_at) < SNAPSHOT_EVERY_MS) return false;
      snapshot(doc, new Date(now).toISOString());
      return true;
    },
  };
}
