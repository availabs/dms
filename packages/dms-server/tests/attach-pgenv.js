// Test helper: attach `pgEnv` to `app` (its one `:dmsenv` row, dama/pgEnv.js) after a fixture wrote
// `data_manager` by direct SQL, and drop the auth snapshots so the next decision reads the new rows.
// The pgEnv's sources and views get no DMS rows: the auth layer reads them from the pgEnv.
const { ensureEnvRow } = require('../src/dama/pgEnv');
const { clearSnapshots } = require('../src/routes/auth');

module.exports = async function attachPgEnv(app, pgEnv) {
  const r = await ensureEnvRow({ app, pgEnv, apply: true });
  clearSnapshots();
  return r;
};
