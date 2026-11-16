import { Router } from 'express';
import multer from 'multer';
import { marked } from 'marked';
import path from 'node:path';
import { requireUser } from '../auth.js';
import { sanitize } from '../sanitize.js';
import { HttpError, MAX_TITLE } from '../validate.js';

export const MAX_UPLOAD_BYTES = 1024 * 1024;
const TYPES = ['.txt', '.md'];

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Plain text: blank lines separate paragraphs, single newlines become line breaks. Nothing is interpreted as HTML.
export function textToHtml(text) {
  return text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)
    .map((block) => block.trim()).filter(Boolean)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br />')}</p>`)
    .join('');
}

export function markdownToHtml(md) {
  return marked.parse(md, { async: false, gfm: true });
}

// Upload a .txt or .md file (≤ 1 MB) → a new document owned by the uploader.
export function importRoutes(db, { now }) {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
  const insertDoc = db.prepare(`INSERT INTO documents (owner_id, title, content_html, updated_by, created_at, updated_at)
                                VALUES (?, ?, ?, ?, ?, ?)`);

  const receive = (req, res, next) => upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(413, 'File must be 1 MB or smaller'));
    if (err instanceof multer.MulterError) return next(new HttpError(400, 'Upload one file in the "file" field'));
    return next(err);
  });

  r.post('/documents/import', requireUser, receive, (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, 'Choose a file to upload');
    const ext = path.extname(file.originalname).toLowerCase();
    if (!TYPES.includes(ext)) throw new HttpError(415, 'Only .txt and .md files are supported');
    if (file.size === 0) throw new HttpError(400, 'The file is empty');

    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer).replace(/^﻿/, '');
    } catch {
      throw new HttpError(400, 'The file is not valid UTF-8 text');
    }
    if (text.includes('\u0000')) throw new HttpError(400, 'The file is not a text file');

    const html = sanitize(ext === '.md' ? markdownToHtml(text) : textToHtml(text)).replace(/>\s*\n\s*</g, '><').trim();
    const base = path.basename(file.originalname, path.extname(file.originalname)).trim();
    const title = (base || 'Imported document').slice(0, MAX_TITLE);
    const ts = new Date(now()).toISOString();
    const { lastInsertRowid } = insertDoc.run(req.user.id, title, html, req.user.id, ts, ts);
    res.status(201).json({ id: Number(lastInsertRowid), title });
  });

  return r;
}
