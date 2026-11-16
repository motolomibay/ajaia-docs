import express from 'express';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUser } from './auth.js';
import { authRoutes } from './routes/auth.js';
import { documentRoutes } from './routes/documents.js';
import { HttpError } from './validate.js';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');

export function createApp({ db, secret = 'dev-secret-change-me', secure = false, now = Date.now }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser(secret));
  app.use(loadUser(db));

  app.use('/api', authRoutes(db, { secure }));
  app.use('/api', documentRoutes(db, { now }));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built SPA; any non-API path falls back to index.html.
  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  }

  // Every error becomes JSON; no stack traces leak.
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const error = err instanceof HttpError ? err.message
      : status === 413 ? 'Request too large'
      : err.type === 'entity.parse.failed' ? 'Invalid JSON body'
      : status >= 500 ? 'Something went wrong' : err.message;
    res.status(status).json({ error });
  });
  return app;
}
