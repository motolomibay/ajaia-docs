import { useEditorState } from '@tiptap/react';
import { splitSoftBreaksInSelection } from '../splitLines.js';

// Block formats apply to whole paragraphs, so split soft line breaks first (see splitLines.js).
const lines = (c) => c.command(splitSoftBreaksInSelection());

const BUTTONS = [
  { label: 'B', title: 'Bold (Ctrl+B)', cls: 'b', run: (c) => c.toggleBold(), active: (e) => e.isActive('bold') },
  { label: 'I', title: 'Italic (Ctrl+I)', cls: 'i', run: (c) => c.toggleItalic(), active: (e) => e.isActive('italic') },
  { label: 'U', title: 'Underline (Ctrl+U)', cls: 'u', run: (c) => c.toggleUnderline(), active: (e) => e.isActive('underline') },
  'sep',
  ...[1, 2, 3].map((level) => ({
    label: `H${level}`, title: `Heading ${level}`,
    run: (c) => lines(c).toggleHeading({ level }), active: (e) => e.isActive('heading', { level }),
  })),
  'sep',
  { label: '• List', title: 'Bulleted list', run: (c) => lines(c).toggleBulletList(), active: (e) => e.isActive('bulletList') },
  { label: '1. List', title: 'Numbered list', run: (c) => lines(c).toggleOrderedList(), active: (e) => e.isActive('orderedList') },
  'sep',
  { label: '↶', title: 'Undo (Ctrl+Z)', run: (c) => c.undo(), active: () => false },
  { label: '↷', title: 'Redo (Ctrl+Shift+Z)', run: (c) => c.redo(), active: () => false },
];

export default function Toolbar({ editor }) {
  // Re-render only when the active formats change, not on every keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => BUTTONS.map((b) => (b === 'sep' ? false : b.active(e))),
  });

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      {BUTTONS.map((b, i) => (b === 'sep'
        ? <span key={i} className="sep" />
        : (
          <button
            key={b.title}
            type="button"
            title={b.title}
            aria-pressed={active[i]}
            className={`tb ${b.cls || ''} ${active[i] ? 'on' : ''}`}
            onMouseDown={(ev) => ev.preventDefault()} // keep the selection in the editor
            onClick={() => b.run(editor.chain().focus()).run()}
          >
            {b.label}
          </button>
        )))}
    </div>
  );
}
