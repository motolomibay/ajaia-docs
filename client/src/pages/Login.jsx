import { useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';

export default function Login({ users, onLogin }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function pick(username) {
    setError('');
    setBusy(username);
    try {
      onLogin(await api('/login', { method: 'POST', body: { username } }));
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  return (
    <div className="center">
      <div className="card login fade-in">
        <div className="logo lg">A</div>
        <h1>Ajaia Docs</h1>
        <p className="muted">Choose a demo account to continue.</p>
        <div className="userlist">
          {users.map((u) => (
            <button key={u.id} className="user" disabled={busy !== null} onClick={() => pick(u.username)}>
              <Avatar name={u.name} />
              <span className="user-name">{u.name}</span>
              <span className="muted small">{busy === u.username ? 'Signing in…' : `@${u.username}`}</span>
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <p className="muted small hint">Demo login: no passwords. Use different accounts to try sharing.</p>
      </div>
    </div>
  );
}
