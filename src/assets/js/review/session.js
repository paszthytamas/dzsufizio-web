import config from './config.js';

const validToken = /^[A-Za-z0-9_-]{43}$/;
export const reviewId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readReviewSession() {
  const current = new URL(location.href);
  const root = new URL(document.querySelector('.brand').href);
  const key = 'dzsufizio.review:' + root.pathname;
  const invitation = new URLSearchParams(current.hash.slice(1));
  let token = '';
  if (invitation.has('review')) {
    token = invitation.get('review') || '';
    const note = invitation.get('note');
    if (reviewId.test(note || '')) current.searchParams.set('review-note', note);
    current.hash = '';
    history.replaceState(history.state, '', current);
    try {
      if (validToken.test(token)) sessionStorage.setItem(key, token);
      else sessionStorage.removeItem(key);
    } catch { /* Session storage may be disabled by the browser. */ }
  } else {
    try { token = sessionStorage.getItem(key) || ''; } catch { /* Same-page use still works. */ }
  }
  if (!validToken.test(token) || !config) return null;
  const route = current.pathname.slice(root.pathname.length).replace(/index\.html$/, '');
  if (current.origin !== root.origin || !current.pathname.startsWith(root.pathname) ||
      !/^([a-z0-9-]+\/)*$/.test(route)) return null;

  return {
    root, route,
    invited: invitation.has('review'),
    jumpTo: current.searchParams.get('review-note'),
    clear() {
      try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
      current.searchParams.delete('review-note');
      location.replace(current);
    },
    async rpc(name, args = {}) {
      const response = await fetch(config.restUrl + '/rpc/' + name, {
        method: 'POST',
        headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...args, p_token: token }),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('network');
      const result = await response.json();
      if (!result?.ok) throw new Error(result?.error || 'network');
      return result;
    },
  };
}
