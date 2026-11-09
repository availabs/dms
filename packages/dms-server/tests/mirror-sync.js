// Test helper: make `app`'s mirror of `pgEnv` equal to the pgEnv (dama/mirror.js reconcile) after a
// fixture wrote `data_manager` by direct SQL, make `app` the ONLY registered mirror of the test pgEnv
// (suites use timestamped apps; a growing list would have the hooks chase dead apps), and drop the
// auth snapshots so the next decision reads the new rows.
const mirror = require('../src/dama/mirror');
const { clearSnapshots } = require('../src/routes/auth');
const { getSettings, setSettings } = require('../src/routes/uda/uda.tasks.controller');

module.exports = async function syncMirror(app, pgEnv) {
  const r = await mirror.reconcile({ app, pgEnv, apply: true });
  let settings; try { settings = JSON.parse(await getSettings(pgEnv)) || {}; } catch { settings = {}; }
  if (!Array.isArray(settings.mirror_apps) || settings.mirror_apps.length !== 1 || settings.mirror_apps[0] !== app) {
    await setSettings(pgEnv, JSON.stringify({ ...settings, mirror_apps: [app] }));
  }
  mirror.forgetMirrorApps();
  clearSnapshots();
  return r;
};
