const { verifyToken, tokenMatchesPassword } = require('./utils/crypto');
const { getUserByEmail, getUserGroups } = require('./utils/queries');
const { getDb } = require('../db');

// Token cache with 5-minute TTL
const TOKEN_TTL = 5 * 60 * 1000;
const tokenCache = new Map();

// Periodic cleanup every 60 seconds
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenCache) {
    if (now - entry.time > TOKEN_TTL) tokenCache.delete(key);
  }
}, 60_000);
cleanupInterval.unref();

function getCachedUser(token) {
  const entry = tokenCache.get(token);
  if (!entry) return null;
  if (Date.now() - entry.time > TOKEN_TTL) {
    tokenCache.delete(token);
    return null;
  }
  // The TTL counts from verification, not from last use: a sliding TTL kept a token in steady use
  // cached forever, past a password change or a removed group. (auth/index.js also empties the cache
  // on those changes.)
  return entry.user;
}

function cacheUser(token, user) {
  tokenCache.set(token, { user, time: Date.now() });
}

/**
 * Verify a JWT token and build the full user object from the auth database.
 * Matches the reference auth() function behavior:
 *   1. Decode JWT to get { email, pw (a stamp of the password hash), project }
 *   2. Look up user in DB, verify the token was issued against their current password
 *   3. Get user's groups + auth level for the embedded project
 *   4. Return full user object
 */
async function verifyAndGetUser(token, db) {
  const decoded = await verifyToken(token);

  const { rows: users } = await getUserByEmail(db, decoded.email);
  const userData = users[0];
  if (!userData || !tokenMatchesPassword(decoded, userData.password)) {
    throw new Error('Invalid user');
  }

  const project = decoded.project;

  let groups = [];
  if (project) {
    const result = await getUserGroups(db, decoded.email, project);
    groups = result.rows;
  }

  const authLevel = groups.reduce((max, g) => Math.max(max, g.auth_level || 0), 0);

  return {
    id: userData.id,
    email: userData.email,
    authLevel,
    token,
    project,
    groups: groups.map(g => g.name),
    meta: groups.map(g => ({ group: g.name, meta: g.meta, authLevel: g.auth_level })),
    authed: true,
  };
}

/**
 * Expected auth failures — bad/expired token (verifyToken rejects with a
 * string) or a user that no longer exists / changed password. These are the
 * caller's problem and are served quietly as anonymous. Anything else is an
 * auth INFRASTRUCTURE failure (DB/network) and must not be silent: swallowing
 * those made every affected request anonymous with zero trace, which
 * downstream turned into no-access stubs and default-themed sites.
 */
function isExpectedAuthFailure(e) {
  if (typeof e === 'string') return true;           // verifyToken: 'Token cannot be verified'
  return e?.message === 'Invalid user';             // verifyAndGetUser: lookup/password mismatch
}

/**
 * The user a token names, from the cache or verified (and cached); null for a bad, expired or revoked token.
 * Shared by the API's header check (below) and the page host's session cookie (session.js).
 */
async function userForToken(token, db) {
  if (!token) return null;
  try {
    let user = getCachedUser(token);
    if (!user) {
      user = await verifyAndGetUser(token, db);
      if (user) cacheUser(token, user);
    }
    return user || null;
  } catch (e) {
    if (!isExpectedAuthFailure(e)) {
      console.warn('[auth] token verification failed (infrastructure):', e?.message || e);
    }
    return null;
  }
}

/**
 * Create JWT auth middleware.
 * @param {string} authDbEnv - Database config name for the auth database
 * @param {Object} [overrides] - Test injection: { db } bypasses getDb(authDbEnv)
 * @returns {Function} Express middleware
 */
function createJwtMiddleware(authDbEnv, { db: dbOverride } = {}) {
  const db = dbOverride || getDb(authDbEnv);

  return async function jwtAuth(req, res, next) {
    if (req.method === 'OPTIONS') return next();

    // Accept both a bare token (app clients) and the standard
    // "Bearer <token>" form (dms CLI, generic HTTP tooling).
    const rawAuth = req.headers.authorization;
    if (!rawAuth) {
      req.availAuthContext = { user: null };
      return next();
    }
    const token = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;

    const user = await userForToken(token, db);
    req.availAuthContext = { user };
    next();
  };
}

module.exports = { createJwtMiddleware, verifyAndGetUser, userForToken, tokenCache };
