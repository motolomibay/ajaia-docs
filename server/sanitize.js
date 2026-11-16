import sanitizeHtml from 'sanitize-html';

// The only markup the editor produces. Anything else (scripts, event handlers, styles, links, images) is dropped.
const OPTIONS = {
  allowedTags: ['p', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 'ul', 'ol', 'li', 'br'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

export function sanitize(html) {
  return sanitizeHtml(html, OPTIONS);
}
