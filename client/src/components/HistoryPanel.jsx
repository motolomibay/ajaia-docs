import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatTime } from '../format.js';

export default function HistoryPanel({ docId, onRestore, onClose, refreshKey }) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api(`/documents/${docId}/versions`).then(setVersions).catch((e) => setError(e.message));
  }, [docId, refreshKey]);

  async function restore(v) {
    if (!window.confirm(`Restore the version from ${formatTime(v.created_at)}? Your current text is kept in history.`)) return;
    setBusy(v.id);
    setError('');
    try {
      await onRestore(v.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="history">
      <div className="history-head">
        <strong>Version history</strong>
        <button className="link" onClick={onClose}>Close</button>
      </div>
      <p className="muted small">Last 10 versions, saved at most once a minute while editing.</p>
      {error && <p className="error small">{error}</p>}
      {!versions ? <p className="muted small">Loading…</p>
        : versions.length === 0 ? <p className="muted small">No earlier versions yet.</p>
        : (
          <ul>
            {versions.map((v) => (
              <li key={v.id}>
                <div>
                  <div>{formatTime(v.created_at)}</div>
                  <div className="muted small">{v.author} · {v.title}</div>
                </div>
                <button className="small-btn" disabled={busy !== null} onClick={() => restore(v)}>
                  {busy === v.id ? 'Restoring…' : 'Restore'}
                </button>
              </li>
            ))}
          </ul>
        )}
    </aside>
  );
}
