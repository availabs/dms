const { verifyToken } = require('./utils/crypto');
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
  entry.time = Date.now(); // refresh TTL on access
  return entry.user;
}

function cacheUser(token, user) {
  tokenCache.set(token, { user, time: Date.now() });
}

/**
 * Verify a JWT token and build the full user object from the auth database.
 * Matches the reference auth() function behavior:
 *   1. Decode JWT to get { email, password (hash), project }
 *   2. Look up user in DB, verify password hash still matches
 *   3. Get user's groups + auth level for the embedded project
 *   4. Return full user object
 */
async function verifyAndGetUser(token, db) {
  const decoded = await verifyToken(token);

  const { rows: users } = await getUserByEmail(db, decoded.email);
  const userData = users[0];
  if (!userData || decoded.password !== userData.password) {
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
 * Create JWT auth middleware.
 * @param {string} authDbEnv - Database config name for the auth database
 * @returns {Function} Express middleware
 */
function createJwtMiddleware(authDbEnv) {
  const db = getDb(authDbEnv);

  return async function jwtAuth(req, res, next) {
    if (req.method === 'OPTIONS') return next();

    const token = req.headers.authorization;
    if (!token) {
      req.availAuthContext = { user: null };
      return next();
    }

    let user = null;
    try {
      user = getCachedUser(token);
      if (!user) {
        user = await verifyAndGetUser(token, db);
        if (user) cacheUser(token, user);
      }
    } catch (e) {
      user = null;
    }

    req.availAuthContext = { user };
    next();
  };
}

module.exports = { createJwtMiddleware, verifyAndGetUser, tokenCache };
