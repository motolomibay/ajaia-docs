import { useState } from 'react';
import { api } from '../api.js';

// Shown when another tab logged out or switched user. Edits in this tab are kept (the save queue holds them).
export default function SessionBanner({ user, onContinue, onLogin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function continueAs() {
    setBusy(true);
    setError('');
    try {
      await api('/login', { method: 'POST', body: { username: user.username } });
      onContinue();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="overlay" role="alertdialog" aria-labelledby="session-title">
      <div className="card dialog fade-in">
        <h3 id="session-title">Your session changed in another tab</h3>
        <p className="muted">
          Another tab signed out or switched user. This tab stopped saving so nothing is saved under the wrong
          account. Your unsaved edits here are kept.
        </p>
        {error && <p className="error small">{error}</p>}
        <div className="dialog-actions">
          <button className="ghost-btn" onClick={onLogin} disabled={busy}>Go to login</button>
          <button className="primary" onClick={continueAs} disabled={busy}>
            {busy ? 'Signing in…' : `Continue as ${user.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
