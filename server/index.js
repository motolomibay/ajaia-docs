import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp } from './app.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const prod = process.env.NODE_ENV === 'production';
const secret = process.env.SESSION_SECRET;
if (prod && !secret) {
  console.error('SESSION_SECRET must be set in production');
  process.exit(1);
}
const db = openDb(process.env.DB_FILE || path.join(root, 'data/app.db'));
const app = createApp({ db, secret, secure: prod });
const port = Number(process.env.PORT || 4540);
app.listen(port, '127.0.0.1', () => console.log(`ajaia-docs listening on http://127.0.0.1:${port}`));
