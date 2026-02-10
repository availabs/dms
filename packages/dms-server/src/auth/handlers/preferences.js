/**
 * Preferences handlers.
 * Each function takes (db, body) where body is req.body from Express.
 */

const { verifyAndGetUserData } = require('./auth');

/** POST /preferences — get preferences for authenticated user in a project */
async function getPreferences(db, { token, project }) {
  const userData = await verifyAndGetUserData(db, token);

  const { rows } = await db.query(
    'SELECT preferences FROM user_preferences WHERE user_email = $1 AND project_name = $2',
    [userData.email, project]
  );
  const raw = rows[0]?.preferences;
  if (!raw) return null;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/** POST /preferences/update — upsert preferences (merge with existing) */
async function updatePreferences(db, { token, project, preferences }) {
  const userData = await verifyAndGetUserData(db, token);

  // Get current preferences
  const { rows } = await db.query(
    'SELECT preferences FROM user_preferences WHERE user_email = $1 AND project_name = $2',
    [userData.email, project]
  );

  const current = rows[0]?.preferences;
  if (!current) {
    // Insert new
    const prefsJson = typeof preferences === 'string' ? preferences : JSON.stringify(preferences);
    await db.query(
      'INSERT INTO user_preferences (user_email, project_name, preferences) VALUES ($1, $2, $3)',
      [userData.email, project, prefsJson]
    );
    return preferences;
  }

  // Merge with existing
  const parsed = typeof current === 'string' ? JSON.parse(current) : current;
  const merged = { ...parsed, ...preferences };
  const mergedJson = JSON.stringify(merged);
  await db.query(
    'UPDATE user_preferences SET preferences = $1 WHERE user_email = $2 AND project_name = $3',
    [mergedJson, userData.email, project]
  );
  return merged;
}

module.exports = {
  getPreferences,
  updatePreferences,
};
