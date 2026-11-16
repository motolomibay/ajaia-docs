export const MAX_TITLE = 200;
export const MAX_CONTENT_BYTES = 1024 * 1024;

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function parseId(raw) {
  if (!/^\d+$/.test(String(raw))) throw new HttpError(400, 'Invalid id');
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Invalid id');
  return id;
}

export function parseTitle(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Title must be text');
  const title = raw.trim();
  if (!title) throw new HttpError(400, 'Title cannot be empty');
  if (title.length > MAX_TITLE) throw new HttpError(400, `Title must be ${MAX_TITLE} characters or fewer`);
  return title;
}

export function parseContent(raw) {
  if (typeof raw !== 'string') throw new HttpError(400, 'Content must be text');
  if (Buffer.byteLength(raw, 'utf8') > MAX_CONTENT_BYTES) throw new HttpError(413, 'Document is too large (max 1 MB)');
  return raw;
}
