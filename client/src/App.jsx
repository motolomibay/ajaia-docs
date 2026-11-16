import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Editor from './pages/Editor.jsx';
import Avatar from './components/Avatar.jsx';

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading, null = logged out
  const [users, setUsers] = useState(null);
  const [bootError, setBootError] = useState('');
  const navigate = useNavigate();

  // Load the session and the user list together, so the login screen appears complete in one step (no flash).
  useEffect(() => {
    Promise.all([
      api('/me').catch((e) => (e.status === 401 ? null : Promise.reject(e))),
      api('/users'),
    ]).then(([me, list]) => { setUsers(list); setUser(me); })
      .catch((e) => setBootError(e.message));
  }, []);

  async function logout() {
    setUser(null); // switch immediately; the user list is already loaded
    navigate('/');
    await api('/logout', { method: 'POST' }).catch(() => {});
  }

  if (bootError) {
    return (
      <div className="center">
        <div className="card notice">
          <p className="error">Could not reach the server: {bootError}</p>
          <button className="small-btn" onClick={() => window.location.reload()}>Try again</button>
        </div>
      </div>
    );
  }
  if (user === undefined) return <div className="center" aria-busy="true" />;
  if (!user) return <Login users={users} onLogin={setUser} />;

  return (
    <div className="shell fade-in">
      <header className="topbar">
        <Link to="/" className="brand"><span className="logo">A</span><span>Ajaia Docs</span></Link>
        <div className="account">
          <Avatar name={user.name} size="sm" />
          <span className="acct-name">{user.name}</span>
          <button className="ghost-btn" onClick={logout}>Switch user</button>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard user={user} />} />
          <Route path="/docs/:id" element={<Editor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
