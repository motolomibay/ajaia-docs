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
  `);
  const insert = db.prepare('INSERT OR IGNORE INTO users (username, name) VALUES (?, ?)');
  for (const u of SEED_USERS) insert.run(u.username, u.name);
  return db;
}
