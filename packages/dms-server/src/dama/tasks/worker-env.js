/**
 * The environment a forked worker or a spawned tool gets: an allow-list, not the server's whole environment.
 *
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md, P0 (hazards) finding 4. Until this, the task fork
 * passed `{ ...process.env }`, so every worker process held the server's signing secrets (`JWT_SECRET`,
 * `DMS_DOMAIN_TOKEN_SECRET`), the CLI token and every other credential the server was started with.
 *
 * Kept: process basics (PATH, HOME, locale, temp dirs, proxies, CA bundles, Node's own options), and the prefixes the
 * worker chain reads: `DMS_` and `DAMA_` (database config dirs and split mode, storage, public URLs, task polling),
 * `AWS_` (S3 storage), `PG` (libpq for ogr2ogr / psql), `GDAL_` / `PROJ_` / `CPL_` / `OGR_` (the GDAL tools),
 * `LC_`. Then the server's own secrets inside those prefixes are taken out again (`DENY`). A worker that needs
 * another variable names it (`declared`), as a plugin's registration will (`env: [...]`, later).
 *
 * Not a security boundary: database passwords live in the config files the worker must read (per-plugin roles
 * would narrow that, a later tier). It keeps secrets a worker never needs out of its memory, its crash dumps and
 * anything it spawns.
 */

const BASICS = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'PWD', 'LANG', 'LANGUAGE', 'TZ', 'TERM',
  'TMPDIR', 'TMP', 'TEMP',
  'NODE_ENV', 'NODE_OPTIONS', 'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  'PUPPETEER_EXECUTABLE_PATH',
]);

const PREFIXES = ['DMS_', 'DAMA_', 'AWS_', 'PG', 'GDAL_', 'PROJ_', 'CPL_', 'OGR_', 'LC_'];

// The server's own secrets, which match a prefix above but no worker reads.
const DENY = new Set([
  'DMS_DOMAIN_TOKEN_SECRET',   // signs custom-domain verification tokens
  'DMS_AUTH_TOKEN',            // the CLI's token, when the server was started from a shell that had it
]);

/**
 * @param {object} [extra]     - variables to set on top (DAMA_TASK_ID and friends)
 * @param {object} [opts]
 * @param {string[]} [opts.declared] - further variable names the worker needs, copied when set
 * @param {object} [opts.from] - the environment to filter (default process.env; tests pass their own)
 * @returns {object} a new environment object
 */
function workerEnv(extra = {}, { declared = [], from = process.env } = {}) {
  const declaredSet = new Set(declared);
  const env = {};
  for (const [k, v] of Object.entries(from)) {
    if (v === undefined) continue;
    const allowed = BASICS.has(k) || declaredSet.has(k) || (PREFIXES.some(p => k.startsWith(p)) && !DENY.has(k));
    if (allowed) env[k] = v;
  }
  return { ...env, ...extra };
}

module.exports = { workerEnv, BASICS, PREFIXES, DENY };
