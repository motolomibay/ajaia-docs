import { useRef, useState } from 'react';
import { getExpectedUser } from '../api.js';

const TYPES = ['.txt', '.md'];
const MAX_BYTES = 1024 * 1024;

// Import a .txt or .md file as a new document. Checked here for quick feedback; the server enforces the same rules.
export default function UploadButton({ onUploaded }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function upload(file) {
    setError('');
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!file.name.includes('.') || !TYPES.includes(ext)) return setError('Only .txt and .md files are supported');
    if (file.size > MAX_BYTES) return setError('File must be 1 MB or smaller');
    if (file.size === 0) return setError('The file is empty');

    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const headers = {};
      const expected = getExpectedUser();
      if (expected !== null) headers['X-Expect-User'] = String(expected);
      const res = await fetch('/api/documents/import', { method: 'POST', body: form, headers, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) window.dispatchEvent(new Event('session-lost'));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      onUploaded(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="upload">
      <input
        ref={input}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        hidden
        onChange={(e) => e.target.files[0] && upload(e.target.files[0])}
      />
      <button className="ghost-btn" onClick={() => input.current.click()} disabled={busy}>
        {busy ? 'Uploading…' : '⤒ Upload file'}
      </button>
      <span className="muted small">.txt or .md · max 1 MB</span>
      {error && <span className="error small" role="alert">{error}</span>}
    </div>
  );
}
