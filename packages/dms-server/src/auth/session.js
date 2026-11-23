/**
 * The page host's session cookie (rsc-view-pages.md phase 1, ssr-session-cookie.md phase A).
 *
 * The browser keeps its sign-in token in localStorage and sends it to the API as a header, so a page request
 * carries nothing and the server rendered every page as a signed-out visitor. The client now also hands the
 * token to `POST /_session` on the page's own host, which keeps it in an HttpOnly cookie:
 *
 *   dms_session=<token>       signed in: the server renders pages as this user (verified, cached: jwt.js)
 *   dms_session=signed-out    signed out
 *   (no cookie)               unknown: rendered as today; the client writes the cookie on load
 *
 * The cookie is read ONLY to render pages (resolveSession, passed to the SSR mount). The API (/graph, the REST
 * routes) keeps requiring the Authorization header and ignores cookies, so a cross-site request that carries the
 * cookie can read or change nothing. `POST /_session` itself takes JSON from the page's own origin only, so
 * another site can't sign a visitor in as someone else.
 */
const { userForToken } = require('./jwt');
const { getDb } = require('../db');

const COOKIE = 'dms_session';
const SIGNED_OUT = 'signed-out';
const SIGNED_OUT_MAX_AGE = 30 * 24 * 3600;

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

// seconds until the token expires (its `exp` claim), at most a week; 0 if it has none or is past it
function secondsLeft(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.exp ? Math.max(0, Math.min(payload.exp - Math.floor(Date.now() / 1000), 7 * 24 * 3600)) : 0;
  } catch { return 0; }
}

function setCookie(req, res, value, maxAge) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.append('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`);
}

/**
 * `POST /_session` { token } signs the page host's cookie in (a valid token), {} signs it out.
 * @param {string} authDbEnv - the auth database's config name
 */
function createSessionRoute(authDbEnv, { db: dbOverride } = {}) {
  const db = dbOverride || getDb(authDbEnv);
  return async function sessionRoute(req, res) {
    // the page's own origin, as JSON (a cross-site form can't send that without a CORS preflight, which this
    // route never answers): no other site can set a visitor's session
    const origin = req.headers.origin;
    if (origin) {
      let originHost = null;
      try { originHost = new URL(origin).host; } catch { /* malformed */ }
      if (originHost !== req.headers.host) return res.status(403).json({ error: 'The session is set from the page itself' });
    }
    if (!String(req.headers['content-type'] || '').includes('application/json')) {
      return res.status(415).json({ error: 'JSON only' });
    }
    res.set('Cache-Control', 'no-store');
    const token = typeof req.body?.token === 'string' ? req.body.token : null;
    const user = token ? await userForToken(token, db) : null;
    const maxAge = user ? secondsLeft(token) : 0;
    if (!user || !maxAge) {
      setCookie(req, res, SIGNED_OUT, SIGNED_OUT_MAX_AGE);
      return res.json({ state: SIGNED_OUT });
    }
    setCookie(req, res, token, maxAge);
    return res.json({ state: 'user' });
  };
}

/**
 * For the SSR mount: who is asking for this page. Read once per request.
 * @returns {(req) => Promise<{ state: 'absent'|'signed-out'|'user', user: object|null, token: string|null }>}
 */
function createSessionResolver(authDbEnv, { db: dbOverride } = {}) {
  const db = dbOverride || getDb(authDbEnv);
  return async function resolveSession(req) {
    if (req.dmsSession) return req.dmsSession;
    const value = readCookie(req, COOKIE);
    let session;
    if (!value) session = { state: 'absent', user: null, token: null };
    else if (value === SIGNED_OUT) session = { state: SIGNED_OUT, user: null, token: null };
    else {
      const user = await userForToken(value, db);
      // a token that no longer verifies (expired, password changed): signed out
      session = user ? { state: 'user', user, token: value } : { state: SIGNED_OUT, user: null, token: null };
    }
    req.dmsSession = session;
    return session;
  };
}

module.exports = { createSessionRoute, createSessionResolver, readCookie, COOKIE };
