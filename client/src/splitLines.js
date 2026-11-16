import { TextSelection } from '@tiptap/pm/state';

// A soft line break (Shift+Enter, some pastes and phone keyboards) keeps two visual lines in ONE paragraph, so a
// heading or list would change both. Before a block-level format, turn the soft breaks inside the selected top-level
// blocks into real paragraph splits; then only the lines the user selected get the new format.
export const splitSoftBreaksInSelection = () => ({ tr, dispatch }) => {
  const { from, to } = tr.selection;
  const breaks = [];
  tr.doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isTextblock) return true;
    if (parent === tr.doc) {
      node.forEach((child, offset) => {
        if (child.type.name === 'hardBreak') breaks.push(pos + 1 + offset);
      });
    }
    return false;
  });
  if (dispatch) {
    for (const pos of breaks.reverse()) {
      tr.delete(pos, pos + 1);
      tr.split(pos);
    }
    // A selection that ends at the very start of a line (e.g. "select to end of line" landing after the break, or a
    // drag to the next line) should not pull that next line into the format.
    const sel = tr.selection;
    if (!sel.empty && sel.$to.parentOffset === 0 && sel.$to.depth > 0) {
      const end = sel.$to.before() - 1;
      if (end > sel.from) tr.setSelection(TextSelection.create(tr.doc, sel.from, end));
    }
  }
  return true;
};
