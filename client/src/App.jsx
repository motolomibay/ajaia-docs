import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out

  useEffect(() => {
    api('/me').then(setUser).catch(() => setUser(null));
  }, []);

  async function logout() {
    await api('/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }

  if (user === undefined) return <div className="center muted">Loading…</div>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Ajaia Docs</span>
        <span className="who">
          Signed in as <strong>{user.name}</strong>
          <button className="link" onClick={logout}>Switch user</button>
        </span>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
