import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { api } from '../api.js';
import { createSaveQueue } from '../saveQueue.js';
import Toolbar from '../components/Toolbar.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';
import ShareDialog from '../components/ShareDialog.jsx';
import { getExpectedUser } from '../api.js';

// Only the formats the server keeps (see server/sanitize.js); everything else is switched off so what you see is
// exactly what gets saved.
const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    blockquote: false, code: false, codeBlock: false, strike: false, horizontalRule: false, link: false,
  }),
];

const STATUS_TEXT = {
  saved: 'All changes saved',
  saving: 'Saving…',
  retrying: 'Save failed – retrying…',
};

const ROLE_BADGE = { editor: 'Can edit', viewer: 'View only' };

export default function Editor({ user }) {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    setDoc(null);
    setLoadError(null);
    api(`/documents/${id}`).then(setDoc).catch(setLoadError);
  }, [id]);

  if (loadError) {
    const text = loadError.status === 403 ? 'You do not have access to this document.'
      : loadError.status === 404 || loadError.status === 400 ? 'This document does not exist.'
      : loadError.message;
    return (
      <div className="card notice">
        <p>{text}</p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }
  if (!doc) return <p className="muted">Loading…</p>;
  return <DocumentEditor key={doc.id} initial={doc} user={user} />;
}

function DocumentEditor({ initial, user }) {
  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [titleError, setTitleError] = useState('');
  const [status, setStatus] = useState({ state: 'saved' });
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const docId = initial.id;
  const role = initial.role;
  const canEdit = role === 'owner' || role === 'editor';

  const queue = useMemo(() => createSaveQueue(
    (content_html) => api(`/documents/${docId}`, { method: 'PATCH', body: { content_html } }),
    { onStatus: (state, err) => setStatus({ state, message: err?.message, status: err?.status }) },
  ), [docId]);

  const editor = useEditor({
    extensions,
    editable: canEdit, // viewers get a read-only document (the server also refuses their saves)
    content: initial.content_html,
    onUpdate: ({ editor: e }) => queue.schedule(e.getHTML()),
  });

  // Save anything pending when leaving the page; warn if the tab is closed with unsaved changes.
  const queueRef = useRef(queue);
  useEffect(() => {
    const warn = (ev) => { if (queueRef.current.busy) { ev.preventDefault(); ev.returnValue = ''; } };
    // If the tab closes anyway, send the pending text with keepalive so the request outlives the page.
    const onHide = () => {
      if (!queue.busy || !editor) return;
      const headers = { 'Content-Type': 'application/json' };
      const expected = getExpectedUser();
      if (expected !== null) headers['X-Expect-User'] = String(expected);
      fetch(`/api/documents/${docId}`, {
        method: 'PATCH', keepalive: true, credentials: 'same-origin', headers,
        body: JSON.stringify({ content_html: editor.getHTML() }),
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('pagehide', onHide);
      queue.flush().finally(() => queue.destroy());
    };
  }, [queue, editor, docId]);

  // After "Continue as …" in the session banner, send whatever is still unsaved.
  useEffect(() => {
    const retry = () => queue.flush();
    window.addEventListener('session-restored', retry);
    return () => window.removeEventListener('session-restored', retry);
  }, [queue]);

  async function saveTitle() {
    if (title === savedTitle) return;
    setTitleError('');
    try {
      const doc = await api(`/documents/${docId}`, { method: 'PATCH', body: { title } });
      setTitle(doc.title);
      setSavedTitle(doc.title);
    } catch (e) {
      setTitleError(e.message);
      setTitle(savedTitle); // keep the last good title
    }
  }

  async function restore(versionId) {
    await queue.flush(); // never let a pending autosave overwrite the restored content
    const doc = await api(`/documents/${docId}/versions/${versionId}/restore`, { method: 'POST' });
    editor.commands.setContent(doc.content_html, { emitUpdate: false });
    setTitle(doc.title);
    setSavedTitle(doc.title);
    setStatus({ state: 'saved' });
    setHistoryKey((k) => k + 1);
  }

  const statusText = status.state !== 'error' ? STATUS_TEXT[status.state]
    : status.status === 401 ? 'Not saved: signed out in another tab'
    : `Not saved: ${status.message}`;

  return (
    <div className="editor-page">
      <div className="editor-head">
        <Link to="/" className="back" title="Back to dashboard">←</Link>
        <div className="title-wrap">
          <input
            className="title-input"
            readOnly={!canEdit}
            value={title}
            maxLength={200}
            aria-label="Document title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          {titleError && <div className="error small">{titleError}</div>}
          {role !== 'owner' && (
            <div className="muted small owner-line">
              Owner: {initial.owner_name} <span className={`badge ${role}`}>{ROLE_BADGE[role]}</span>
            </div>
          )}
        </div>
        {canEdit && <span className={`status ${status.state}`} aria-live="polite">{statusText}</span>}
        {canEdit && (
          <button className="small-btn" onClick={() => { setShowHistory((s) => !s); setHistoryKey((k) => k + 1); }}>
            History
          </button>
        )}
        {role === 'owner' && <button className="primary" onClick={() => setShowShare(true)}>Share</button>}
      </div>
      {editor && canEdit && <Toolbar editor={editor} />}
      {role === 'viewer' && <div className="viewer-note">You have view-only access. Ask {initial.owner_name} for edit access.</div>}
      <div className="editor-body">
        <div className="paper">
          <EditorContent editor={editor} />
        </div>
        {showHistory && canEdit && (
          <HistoryPanel docId={docId} refreshKey={historyKey} onRestore={restore} onClose={() => setShowHistory(false)} />
        )}
      </div>
      {showShare && <ShareDialog doc={{ id: docId, title }} me={user} onClose={() => setShowShare(false)} />}
    </div>
  );
}
