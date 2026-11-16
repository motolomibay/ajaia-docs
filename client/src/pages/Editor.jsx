import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { api } from '../api.js';
import { createSaveQueue } from '../saveQueue.js';
import Toolbar from '../components/Toolbar.jsx';
import HistoryPanel from '../components/HistoryPanel.jsx';

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

export default function Editor() {
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
  return <DocumentEditor key={doc.id} initial={doc} />;
}

function DocumentEditor({ initial }) {
  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [titleError, setTitleError] = useState('');
  const [status, setStatus] = useState({ state: 'saved' });
  const [showHistory, setShowHistory] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const docId = initial.id;

  const queue = useMemo(() => createSaveQueue(
    (content_html) => api(`/documents/${docId}`, { method: 'PATCH', body: { content_html } }),
    { onStatus: (state, err) => setStatus({ state, message: err?.message }) },
  ), [docId]);

  const editor = useEditor({
    extensions,
    content: initial.content_html,
    onUpdate: ({ editor: e }) => queue.schedule(e.getHTML()),
  });

  // Save anything pending when leaving the page; warn if the tab is closed with unsaved changes.
  const queueRef = useRef(queue);
  useEffect(() => {
    const warn = (ev) => { if (queueRef.current.busy) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); queue.flush().finally(() => queue.destroy()); };
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

  const statusText = status.state === 'error' ? `Not saved: ${status.message}` : STATUS_TEXT[status.state];

  return (
    <div className="editor-page">
      <div className="editor-head">
        <Link to="/" className="back" title="Back to dashboard">←</Link>
        <div className="title-wrap">
          <input
            className="title-input"
            value={title}
            maxLength={200}
            aria-label="Document title"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          />
          {titleError && <div className="error small">{titleError}</div>}
        </div>
        <span className={`status ${status.state}`} aria-live="polite">{statusText}</span>
        <button className="small-btn" onClick={() => { setShowHistory((s) => !s); setHistoryKey((k) => k + 1); }}>
          History
        </button>
      </div>
      {editor && <Toolbar editor={editor} />}
      <div className="editor-body">
        <div className="paper">
          <EditorContent editor={editor} />
        </div>
        {showHistory && (
          <HistoryPanel docId={docId} refreshKey={historyKey} onRestore={restore} onClose={() => setShowHistory(false)} />
        )}
      </div>
    </div>
  );
}
