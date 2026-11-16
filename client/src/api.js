// Thin fetch wrapper: JSON in/out, throws an Error with the server's message, status and code.

// The user this tab believes it is. Sent with every request so the server refuses (instead of silently running as
// someone else) if another tab logged out or switched user — all tabs share one login cookie.
let expectedUserId = null;
export function setExpectedUser(id) { expectedUserId = id ?? null; }
export function getExpectedUser() { return expectedUserId; }

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (expectedUserId !== null) headers['X-Expect-User'] = String(expectedUserId);
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    if (res.status === 401 && expectedUserId !== null) window.dispatchEvent(new Event('session-lost'));
    throw err;
  }
  return data;
}

// Tell other tabs when this tab logs in or out.
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ajaia-session') : null;
export function announceSession(userId) { channel?.postMessage({ userId: userId ?? null }); }
export function onSessionAnnounced(fn) {
  if (!channel) return () => {};
  const handler = (e) => fn(e.data?.userId ?? null);
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}
