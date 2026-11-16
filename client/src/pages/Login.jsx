import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/users').then(setUsers).catch((e) => setError(e.message));
  }, []);

  async function pick(username) {
    setError('');
    try {
      onLogin(await api('/login', { method: 'POST', body: { username } }));
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="center">
      <div className="card login">
        <h1>Ajaia Docs</h1>
        <p className="muted">Demo login: pick a user. (No passwords; seeded accounts for reviewing sharing.)</p>
        <div className="userlist">
          {users.map((u) => (
            <button key={u.id} className="user" onClick={() => pick(u.username)}>
              <span className="avatar">{u.name[0]}</span>
              {u.name}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
