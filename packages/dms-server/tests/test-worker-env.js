/**
 * The environment forked workers and spawned tools get (src/dama/tasks/worker-env.js; dms-plugin-system.md P0
 * finding 4): an allow-list, not the server's whole environment. Covers: signing secrets and unrelated credentials
 * left out, the worker chain's variables kept, declared names added, extra values on top, and a real fork seeing
 * only the filtered set. No database.
 */
const assert = require('assert');
const path = require('path');
const { fork } = require('child_process');
const { workerEnv } = require('../src/dama/tasks/worker-env');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

const from = {
  PATH: '/usr/bin', HOME: '/home/x', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', NODE_ENV: 'production',
  DMS_DB_ENV: 'dms-pg', DMS_DB_CONFIG_DIRS: '/app/db-configs', DMS_SPLIT_MODE: 'per-app', DMS_STORAGE_TYPE: 's3',
  DMS_PUBLIC_URL: 'https://x', DAMA_SERVER_FILESTORAGE_PATH: '/var/files', DAMA_TASK_POLL_INTERVAL: '5000',
  AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b', PGHOST: 'db', GDAL_DATA: '/usr/share/gdal', PROJ_LIB: '/p',
  JWT_SECRET: 'sign', DMS_DOMAIN_TOKEN_SECRET: 'sign2', DMS_AUTH_TOKEN: 'cli', TRANSCOM_PASSWORD: 'tp',
  SMTP_PASS: 'mail', RANDOM_THING: 'r',
};

async function run() {
  console.log('\nworker env');
  const env = workerEnv({}, { from });
  await t('signing secrets and the CLI token are left out', () => {
    for (const k of ['JWT_SECRET', 'DMS_DOMAIN_TOKEN_SECRET', 'DMS_AUTH_TOKEN']) assert(!(k in env), k);
  });
  await t('credentials no worker reads are left out', () => {
    for (const k of ['TRANSCOM_PASSWORD', 'SMTP_PASS', 'RANDOM_THING']) assert(!(k in env), k);
  });
  await t('the worker chain keeps its variables (DB config, storage, GDAL, libpq, locale, basics)', () => {
    for (const k of ['PATH', 'HOME', 'LANG', 'LC_ALL', 'NODE_ENV', 'DMS_DB_ENV', 'DMS_DB_CONFIG_DIRS', 'DMS_SPLIT_MODE',
      'DMS_STORAGE_TYPE', 'DMS_PUBLIC_URL', 'DAMA_SERVER_FILESTORAGE_PATH', 'DAMA_TASK_POLL_INTERVAL',
      'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'PGHOST', 'GDAL_DATA', 'PROJ_LIB']) assert.strictEqual(env[k], from[k], k);
  });
  await t('a declared name is copied; extra values go on top', () => {
    const e = workerEnv({ DAMA_TASK_ID: '7', PATH: '/override' }, { from, declared: ['TRANSCOM_PASSWORD', 'NOT_SET'] });
    assert.strictEqual(e.TRANSCOM_PASSWORD, 'tp');
    assert(!('NOT_SET' in e));
    assert.strictEqual(e.DAMA_TASK_ID, '7');
    assert.strictEqual(e.PATH, '/override');
  });
  await t('a forked process sees only the filtered set', async () => {
    const prev = { JWT_SECRET: process.env.JWT_SECRET, DMS_DB_ENV: process.env.DMS_DB_ENV };
    process.env.JWT_SECRET = 'test-secret'; process.env.DMS_DB_ENV = 'dms-sqlite-test';
    try {
      const child = fork(path.join(__dirname, 'fixtures', 'print-env.js'), [], { env: workerEnv({ DAMA_TASK_ID: '1' }), stdio: ['ignore', 'pipe', 'inherit', 'ipc'] });
      const got = await new Promise((res, rej) => { child.on('message', res); child.on('error', rej); });
      assert(!got.includes('JWT_SECRET'), 'JWT_SECRET reached the child');
      assert(got.includes('DMS_DB_ENV') && got.includes('DAMA_TASK_ID') && got.includes('PATH'));
    } finally {
      for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
