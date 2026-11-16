import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { formatTime } from '../format.js';

export default function Dashboard({ user }) {
  const [docs, setDocs] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const [loadError, setLoadError] = useState('');

  function load() {
    setLoadError('');
    api('/documents').then(setDocs).catch((e) => setLoadError(e.message));
  }
  useEffect(load, []);

  async function create() {
    setCreating(true);
    setError('');
    try {
      const doc = await api('/documents', { method: 'POST', body: {} });
      navigate(`/docs/${doc.id}`);
    } catch (e) {
      setError(e.message);
      setCreating(false);
    }
  }

  return (
    <div className="dashboard">
      <div className="dash-head">
        <h2>Welcome, {user.name}</h2>
        <button className="primary" onClick={create} disabled={creating}>
          {creating ? 'Creating…' : '+ New document'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {loadError && (
        <p className="error">
          Could not load your documents: {loadError}{' '}
          <button className="link" onClick={load}>Retry</button>
        </p>
      )}
      <section>
        <h3>My documents</h3>
        {!docs ? <p className="muted">{loadError ? '—' : 'Loading…'}</p>
          : docs.owned.length === 0 ? <p className="muted empty">No documents yet. Create one to get started.</p>
          : <DocList docs={docs.owned} />}
      </section>
      <section>
        <h3>Shared with me</h3>
        {!docs ? <p className="muted">{loadError ? '—' : 'Loading…'}</p>
          : docs.shared.length === 0 ? <p className="muted empty">Nothing has been shared with you yet.</p>
          : <DocList docs={docs.shared} />}
      </section>
    </div>
  );
}

function DocList({ docs }) {
  return (
    <ul className="doclist">
      {docs.map((d) => (
        <li key={d.id}>
          <Link to={`/docs/${d.id}`}>{d.title}</Link>
          <span className="muted small">Edited {formatTime(d.updated_at)}</span>
        </li>
      ))}
    </ul>
  );
}
