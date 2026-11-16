import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

const ROLE_LABEL = { editor: 'Can edit', viewer: 'Can view' };

// Owner-only: grant access with a role, change a role, or revoke access.
export default function ShareDialog({ doc, me, onClose }) {
  const [users, setUsers] = useState([]);
  const [shares, setShares] = useState(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/users').then(setUsers).catch((e) => setError(e.message));
    api(`/documents/${doc.id}/shares`).then(setShares).catch((e) => setError(e.message));
  }, [doc.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      setShares(await fn());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function share(e) {
    e.preventDefault();
    const ok = await run(() => api(`/documents/${doc.id}/shares`, { method: 'POST', body: { username, role } }));
    if (ok) setUsername('');
  }

  const sharedIds = new Set((shares ?? []).map((s) => s.user_id));
  const candidates = users.filter((u) => u.id !== me.id && !sharedIds.has(u.id));

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card dialog share fade-in" role="dialog" aria-labelledby="share-title">
        <div className="dialog-head">
          <h3 id="share-title">Share “{doc.title}”</h3>
          <button className="link" onClick={onClose} aria-label="Close">Close</button>
        </div>

        <form className="share-form" onSubmit={share}>
          <select value={username} onChange={(e) => setUsername(e.target.value)} aria-label="User" disabled={busy}>
            <option value="">{candidates.length ? 'Choose a person…' : 'Everyone already has access'}</option>
            {candidates.map((u) => <option key={u.id} value={u.username}>{u.name}</option>)}
          </select>
          <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" disabled={busy}>
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="primary" disabled={busy || !username}>Share</button>
        </form>
        {error && <p className="error small">{error}</p>}

        <h4>People with access</h4>
        <ul className="people">
          <li>
            <Avatar name={me.name} size="sm" />
            <span className="person">{me.name} <span className="muted small">(you)</span></span>
            <span className="muted small">Owner</span>
          </li>
          {shares === null ? <li className="muted small">Loading…</li> : shares.map((s) => (
            <li key={s.user_id}>
              <Avatar name={s.name} size="sm" />
              <span className="person">{s.name}</span>
              <select
                value={s.role}
                disabled={busy}
                aria-label={`Role for ${s.name}`}
                onChange={(e) => run(() => api(`/documents/${doc.id}/shares/${s.user_id}`, { method: 'PATCH', body: { role: e.target.value } }))}
              >
                <option value="editor">{ROLE_LABEL.editor}</option>
                <option value="viewer">{ROLE_LABEL.viewer}</option>
              </select>
              <button
                className="link danger"
                disabled={busy}
                onClick={() => run(() => api(`/documents/${doc.id}/shares/${s.user_id}`, { method: 'DELETE' }))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">Editors can edit and restore history. Viewers can only read.</p>
      </div>
    </div>
  );
}
