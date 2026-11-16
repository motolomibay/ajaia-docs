import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const SEED_USERS = [
  { username: 'alice', name: 'Alice' },
  { username: 'bob', name: 'Bob' },
  { username: 'carol', name: 'Carol' },
];

// Opens (or creates) the database, applies the schema and seeds users. Idempotent.
export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      name     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id           INTEGER PRIMARY KEY,
      owner_id     INTEGER NOT NULL REFERENCES users(id),
      title        TEXT NOT NULL,
      content_html TEXT NOT NULL DEFAULT '',
      updated_by   INTEGER NOT NULL REFERENCES users(id),
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
    CREATE TABLE IF NOT EXISTS document_versions (
      id           INTEGER PRIMARY KEY,
      document_id  INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      content_html TEXT NOT NULL,
      created_by   INTEGER NOT NULL REFERENCES users(id),
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id, id);
    CREATE TABLE IF NOT EXISTS shares (
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      role        TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
      created_at  TEXT NOT NULL,
      PRIMARY KEY (document_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id);
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO users (username, name) VALUES (?, ?)');
  for (const u of SEED_USERS) insert.run(u.username, u.name);
  return db;
}
