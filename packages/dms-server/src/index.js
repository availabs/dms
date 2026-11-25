const express = require('express');
const compression = require('compression')
const falcorExpress = require('./utils/falcor-express');
const falcorRoutes = require('./routes');
const { createRequestLogger, logEntry } = require('./middleware/request-logger');
const { createJwtMiddleware } = require('./auth/jwt');
const { registerAuthRoutes } = require('./auth');
const { registerUploadRoutes } = require('./dama/upload');
const requestIp = require('request-ip');

// Install process-level safety nets before anything else, so nothing can
// escape before they are armed. These deliberately keep the process alive on
// an uncaught exception rather than exiting — see utils/process-safety.js for
// the reasoning and the DMS_EXIT_ON_UNCAUGHT escape hatch.
const { installProcessSafetyNets } = require('./utils/process-safety');
installProcessSafetyNets({ logEntry });

// Heap snapshot for OOM diagnosis — writes a .heapsnapshot file when heap exceeds threshold.
// Run with: node --max-old-space-size=8192 src/index.js
// Then open the .heapsnapshot in Chrome DevTools → Memory tab.
const HEAP_SNAPSHOT_THRESHOLD_MB = parseInt(process.env.DMS_HEAP_SNAPSHOT_MB, 10) || 0;
if (HEAP_SNAPSHOT_THRESHOLD_MB > 0) {
  const v8 = require('v8');
  const { writeFileSync } = require('fs');
  let _snapshotTaken = false;
  setInterval(() => {
    if (_snapshotTaken) return;
    const heapMB = process.memoryUsage().heapUsed / 1048576;
    if (heapMB > HEAP_SNAPSHOT_THRESHOLD_MB) {
      _snapshotTaken = true;
      const file = v8.writeHeapSnapshot();
      console.log(`[heap] Snapshot written to ${file} (heap was ${heapMB.toFixed(0)}MB)`);
    }
  }, 5000).unref();
}

const app = express();
app.use(compression())

// Site hosting: a request for a site's host gets that site's built client files
// and never reaches the API routes, CORS or auth middleware below. Sites live in
// the "<checkout>-sites" folder next to the app checkout (the same root the SSR
// mount uses); without that folder no request matches. See sites/index.js.
// Tenant hub (DMS_ROOT_DOMAIN): a tenant with a primary domain is served there; a page request on
// its other hosts is redirected first (utils/primaryRedirect.js). A no-op on every other server.
app.set('trust proxy', true); // req.protocol from nginx's X-Forwarded-Proto (also set below, for req.ip)
app.use(require('./utils/primaryRedirect').createPrimaryRedirect());

// A verified domain alias of a hub tenant is served by the site that serves the root domain.
const { resolveHost: resolveTenantHost, rootDomain: hubRootDomain } = require('./utils/subdomain');
const { createSitesMiddleware } = require('./sites');

// Per-site CSS compiled by the server (src/dms/planning/tasks/current/server-compiled-site-css.md). Its routes go
// before the hosted sites, whose fallback answers any unknown path with index.html. The candidate manifest is the
// served build's (DMS_DIST_DIR, as SSR uses it), or DMS_CSS_MANIFEST; without one the feature is off and pages
// keep the in-browser compiler.
const siteCss = require('./css/siteCss');
const appRoot = require('path').resolve(__dirname, '../../../../..');
const cssManifest = () => process.env.DMS_CSS_MANIFEST
  || (process.env.NODE_ENV === 'production'
    ? require('path').join(require('path').resolve(appRoot, process.env.DMS_DIST_DIR || 'dist'), 'client', '.dms', 'css-candidates.json')
    : null);
const siteType = () => process.env.DMS_TYPE || process.env.VITE_DMS_TYPE;
siteCss.registerRoutes(app, { defaultManifest: cssManifest });
// Installed plugins' files (plugins/routes.js; dms-plugin-system.md P2): public and immutable, before the hosted sites
const pluginRoutes = require('./plugins/routes');
const pluginStore = require('./plugins/store');
pluginRoutes.registerFileRoutes(app);
// an activation names an installed version (or gets the current one): checked on every general write of one
require('./routes/dms/write-checks').registerWriteCheck('plugin_activation', pluginStore.activationWriteCheck());

app.use(createSitesMiddleware({
  sitesDir: `${appRoot}-sites`,
  aliasOf: (host) => (resolveTenantHost(host, hubRootDomain())?.alias ? hubRootDomain() : null),
  // a hosted build's index.html links its site's sheet: the app and type its deploy-info.json was built with,
  // compiled from that build's own candidate manifest
  transformIndex: async ({ dir, html }) => {
    const info = JSON.parse(require('fs').readFileSync(require('path').join(dir, 'deploy-info.json'), 'utf8'));
    const env = info.env || {};
    const sheet = await siteCss.sheetFor({
      app: env.VITE_DMS_APP, type: env.VITE_DMS_TYPE,
      manifestFile: require('path').join(dir, '.dms', 'css-candidates.json'),
    });
    return siteCss.applyToHtml(html, siteCss.headInfo(sheet));
  },
}));

const PORT = process.env.PORT || 3001;

app.use(express.raw({ limit: "500mb", type: "application/octet-stream" }));
app.use(express.text({ limit: "500mb", type: "text/*" }));
app.use(express.json({ limit: "500mb" })); // to support JSON-encoded bodies
app.use(express.urlencoded({
  limit: "100mb", extended: true,
})); // to support URL-encoded bodies
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', req.get('origin'));
  res.header('Cache-Control', 'no-store,no-cache,must-revalidate');
  res.header('Access-Control-Allow-Credentials', true);
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-DMS-App'
  );

  res.header(
    'Access-Control-Allow-Methods',
    'GET,PUT,POST,DELETE,PATCH,OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.end()
  }

  return next();
});

// #################################################################
// #################################################################
// #################################################################
// #################################################################

// THIS SETTING ALLOWS EXPRESS TO CORRECTLY IDENTIFY IP ADDRESSES
// WHILE SITTING BEHIND A REVERSE-PROXY (NGINX)
app.set('trust proxy', true);

// THIS MIDDLEWARE WILL DETECT THE IP ADDRESS OF REQUESTS
// AND SET IT ON THE REQUEST OBJECT AS: req.clientIp
app.use(requestIp.mw());

// #################################################################
// #################################################################
// #################################################################
// #################################################################

// When SSR is not enabled, show a simple status page at /
if (!process.env.DMS_SSR) {
  app.get('/', (req, res) => {
    res.send('DMS Server running. SSR is disabled — set DMS_SSR=1 to enable.');
  });
}

// Request timeout — prevent requests from hanging forever and leaking memory.
// Graph requests get a longer timeout since they can involve recursive ref-following.
const REQUEST_TIMEOUT = 30_000; // 30s default
const GRAPH_TIMEOUT = 120_000;  // 2 min for Falcor graph requests
app.use((req, res, next) => {
  // A data type's declared long routes (its registration's `longRoutes`, e.g. routing's searches, 60 s+) keep
  // no app-level timeout; the core names none of them (dms-plugin-system.md, P0).
  if (require('./dama/datatypes').isLongRoute(req.method, req.path)) { next(); return; }
  const timeout = req.path.startsWith('/graph') ? GRAPH_TIMEOUT : REQUEST_TIMEOUT;
  req.setTimeout(timeout, () => {
    if (!res.headersSent) {
      console.warn(`[timeout] ${req.method} ${req.path} timed out after ${timeout}ms`);
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// Request logging middleware (enable with DMS_LOG_REQUESTS=1)
app.use(createRequestLogger());

// Static file serving — before auth so download links are publicly accessible
const storage = require('./dama/storage');
if (storage.type === 'local' && storage.dataDir) {
  app.use('/files', require('express').static(storage.dataDir));
}

// Auth routes — registered BEFORE JWT middleware (login/signup don't need auth)
const authDbEnv = process.env.DMS_AUTH_DB_ENV || 'auth-sqlite';
const { getDb, awaitReady } = require('./db');
registerAuthRoutes(app, getDb(authDbEnv));

// The page host's session cookie (auth/session.js): POST /_session from the page itself; read only by the SSR
// mount below to render pages as the signed-in user. The API never reads it.
const { createSessionRoute, createSessionResolver } = require('./auth/session');
app.post('/_session', createSessionRoute(authDbEnv));

// JWT auth middleware — validates Authorization header, attaches req.availAuthContext
app.use(createJwtMiddleware(authDbEnv));

// Access log — the guards' refusals, counted (GET /dms-admin/:app/access-log, `${app} Admin` / AVAIL only)
const { registerAccessLogRoutes } = require('./access-log');
registerAccessLogRoutes(app, { authDbEnv });

// Format declarations — what scripts/register-formats.js registered for a site, read-only (routes/auth/formats.js)
require('./routes/auth/formats').registerFormatRoutes(app);

// Who a row's own grants name (users, and the members of the groups named), for anyone who may read
// the row: GET /dms/:app/rows/:id/grantees (routes/auth/grantees.js)
require('./routes/auth/grantees').registerGranteeRoutes(app, { authDbEnv });

// Tenant domain aliases — the hub only (routes/domains; tenant-external-domains.md, Phase B)
require('./routes/domains').registerDomainRoutes(app);

// Deleting a tenant of the hub, with a backup first (routes/tenants; tenant-subdomain-uniqueness.md)
require('./routes/tenants').registerTenantRoutes(app);

// Installing a plugin release (plugins/routes.js): hub staff holding install-plugins, judged whatever DMS_AUTH_MODE says
pluginRoutes.registerAdminRoutes(app, {
  controller: require('./routes/dms/dms.route').controller,
  siteCan: require('./routes/auth').siteCan,
  requireUser: require('./routes/auth/requestUser').requireUser,
});

// A site's icon, app name and colours; its manifest, icons and service worker by Host (routes/appSettings;
// site-app-settings-pwa.md)
require('./routes/appSettings').registerAppSettingsRoutes(app);

// Deleting a pattern or a theme with what it owns, plan first, backup first (routes/dms/ownerDeleteHttp.js;
// safe-delete-removes-rows.md)
require('./routes/dms/ownerDeleteHttp').registerOwnerDeleteRoutes(app);

// The Storage pages: usage, and cleaning up rows nothing can reach, plan first, backup first
// (routes/dms/storageHttp.js; orphan-sweeper.md)
require('./routes/dms/storageHttp').registerStorageRoutes(app);

// Upload routes — DAMA-compatible file upload endpoints (after JWT so uploads are authenticated)
registerUploadRoutes(app);

// Schedule routes — cron schedules for data-type loaders (after JWT; mutations require auth)
const { registerScheduleRoutes } = require('./dama/tasks/schedule-routes');
registerScheduleRoutes(app);

// PDF export — renders site pages to one PDF as a background job (needs no permission; see src/pdf/index.js)
const { registerPdfRoutes } = require('./pdf');
registerPdfRoutes(app);

// Page visit tracking — fire-and-forget from the client on every page navigation.
// No auth required; user_id extracted from JWT if present.
app.post('/track/visit', async (req, res) => {
  try {
    const { app: visitApp, pageId, url, action } = req.body || {};
    if (!visitApp) return res.status(400).json({ error: 'app is required' });
    const userId = req.availAuthContext?.user?.id || null;
    const { getDb } = require('./db');
    const db = getDb(process.env.DMS_DB_ENV || 'dms-sqlite');
    const tbl = db.type === 'postgres' ? 'dms.page_visits' : 'page_visits';
    await db.promise(
      `INSERT INTO ${tbl} (app, page_id, url, action, ip, user_agent, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [visitApp, pageId || null, url || null, action || null, req.clientIp || null, req.headers['user-agent'] || null, userId]
    );
    res.status(204).end();
  } catch (e) {
    console.error('[track/visit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Log graph requests to console. Uses res.on('finish') so the parsed Falcor
// context (set by falcor-express on req._falcorContext) is always available,
// avoiding body-parser timing issues with URL-encoded POST bodies.
app.use('/graph', (req, res, next) => {
  res.on('finish', () => {
    const ctx = req._falcorContext;
    let method, detail = '';
    try {
      if (ctx?.method) {
        method = ctx.method.toUpperCase();
        if (ctx.callPath) {
          const cp = Array.isArray(ctx.callPath) ? ctx.callPath : JSON.parse(ctx.callPath);
          detail = cp.join('.');
          if (ctx.arguments) {
            const args = Array.isArray(ctx.arguments) ? ctx.arguments : JSON.parse(ctx.arguments);
            const preview = args.map(a => typeof a === 'string' ? a : Array.isArray(a) ? `[${a.length}]` : typeof a === 'object' ? `{${Object.keys(a || {}).slice(0,3).join(',')}}` : String(a));
            detail += ` [${preview.join(', ')}]`;
          }
        } else if (ctx.paths) {
          const paths = Array.isArray(ctx.paths) ? ctx.paths : JSON.parse(ctx.paths);
          detail = paths.slice(0, 3).map(p => Array.isArray(p) ? p.slice(0, 4).join('.') : String(p)).join(' | ');
          if (paths.length > 3) detail += ` (+${paths.length - 3} more)`;
        }
      } else {
        // Fallback: falcor-express didn't parse the request (bad payload, preflight, etc.)
        // Log HTTP method so GET vs POST unknowns are distinguishable.
        const params = req.method === 'POST' ? req.body : req.query;
        method = `${req.method}:${(params?.method || 'unknown').toUpperCase()}`;
      }
    } catch {}
    console.log(`[graph] ${method || 'UNKNOWN'} ${detail || '(no path info)'}`);
  });
  next();
});

const { getSubdomain } = require('./utils/subdomain');
const { requestApp } = require('./routes/auth/requestUser');

app.use(
  '/graph',
  falcorExpress.dataSourceRoute(function (req, res) {
    try {
      const { user = null } = req.availAuthContext || {};
      const subdomain = getSubdomain(req);
      const reqMeta = {
        ip: req.clientIp || null,
        userAgent: req.headers['user-agent'] || null,
        authState: user ? 'authenticated' : 'unauthenticated',
        // how the write arrived, for change history rows: the CLI sends 'cli', a browser nothing
        via: req.headers['x-dms-via'] || null,
      };
      return falcorRoutes({ user, subdomain, reqMeta, requestApp: requestApp(req) });
    } catch (e) {
      console.error('[graph] Error creating data source:', e);
      throw e;
    }
  })
);

// Sync routes — REST endpoints for bootstrap/delta/push
const { createSyncRoutes, startCompaction } = require('./routes/sync/sync');
const syncDbEnv = process.env.DMS_DB_ENV || 'dms-sqlite';
app.use(createSyncRoutes(syncDbEnv));

async function setupAndListen() {
  await awaitReady();

  // Register workers and plugins — always, so handlers are available
  // even when tasks are queued against arbitrary pgEnvs via upload routes
  const { registerUploadWorkers } = require('./dama/upload/workers');
  registerUploadWorkers();

  const { registerDatatype, mountDatatypeRoutes } = require('./dama/datatypes');
  registerDatatype('pmtiles', require('./dama/datatypes/pmtiles'));

  // App-owned datatype plugins — load via DMS_EXTRA_DATATYPES if set.
  // Resolved against cwd so relative paths (e.g. `./server/register-datatypes.js`)
  // work in dev without depending on dms-server's own location.
  const extraDatatypes = process.env.DMS_EXTRA_DATATYPES;

  if (extraDatatypes) {
    try {
      const registerExtra = require(require('path').resolve(extraDatatypes));
      registerExtra({ registerDatatype });
    } catch (e) {
      console.error(`[datatypes] Failed to load DMS_EXTRA_DATATYPES=${extraDatatypes}:`, e.message);
    }
  }

  // Installed plugins with server code (plugins/store.js): their current version, registered at start (code
  // installed since takes the next restart, D2), routes judged under enforce. A compiled-in data type wins.
  const { isDatatypeRegistered } = require('./dama/datatypes');
  const installedServer = pluginStore.registerInstalledServerPlugins(registerDatatype, { isRegistered: isDatatypeRegistered });
  if (installedServer.length) console.log(`[plugins] installed plugins with server code: ${installedServer.join(', ')}`);

  // Optional app-owned page-delete side effect — load via DMS_PAGE_DELETE_HOOK
  // if set. Same shape as DMS_EXTRA_DATATYPES above: an env var pointing at a
  // CommonJS module, resolved against cwd. The module's default export is a
  // single async function called by dms.controller.js's cascadePageDelete for
  // every deleted page row on every app this server hosts.
  const pageDeleteHookPath = process.env.DMS_PAGE_DELETE_HOOK;

  if (pageDeleteHookPath) {
    try {
      const onPageDeleted = require(require('path').resolve(pageDeleteHookPath));
      require('./routes/dms/dms.controller').setPageDeleteHook(onPageDeleted);
    } catch (e) {
      console.error(`[page-delete-hook] Failed to load DMS_PAGE_DELETE_HOOK=${pageDeleteHookPath}:`, e.message);
    }
  }

  // Mount plugin routes with shared helpers
  const tasks = require('./dama/tasks');
  const metadata = require('./dama/upload/metadata');
  const lineage = require('./dama/lineage');
  const damaDelete = require('./dama/delete');
  const { requireUser, requestUserId } = require('./routes/auth/requestUser');
  const { requireCan } = require('./routes/auth');
  const { authorizeViewAction } = require('./dama/upload/auth');
  const { getDb, loadConfig } = require('./db');
  // Plugin writes need a signed-in user (writeGate, mounted per plugin) and then the route's own permission.
  // Each helper answers the request itself (401 / 403) and returns null when the caller is refused.
  // For routes that used to answer anyone: authorizePublish(req, res, sourceId) (new source: create-source
  // on the named pattern; new version: create-view / update-source) and authorizeSourceWrite(req, res,
  // { sourceId, viewId }, perms) — both follow DMS_AUTH_MODE (dama/datatypes/auth.js).
  // Strict ones (login always): requireCan(req, res, { source: sourceId, perms: perms }) reads the pgEnv from
  // req.params.pgEnv; authorizeViewAction(req, res, viewId, perms, bodySourceId) checks the view's own source.
  // holdsSourcePermission(req, sourceId, perms) answers nothing: for what a reply carries (a secret only an
  // editor sees), judged as reads are (DMS_AUTH_MODE).
  mountDatatypeRoutes(app, {
    queueTask: tasks.queueTask,
    getTaskStatus: tasks.getTaskStatus,
    getTaskEvents: tasks.getTaskEvents,
    dispatchEvent: tasks.dispatchEvent,
    createDamaSource: metadata.createDamaSource,
    createDamaView: metadata.createDamaView,
    ensureSchema: metadata.ensureSchema,
    deleteDamaView: damaDelete.deleteDamaView,
    getViewLineage: lineage.getViewLineage,
    getSourceLineage: lineage.getSourceLineage,
    requireUser,
    // ONE guard per transport since 2026-11-03: name the subject with `source` or `pattern`.
    // `requireSourcePermission` / `requirePatternPermission` were the same question twice.
    requireCan,
    authorizeViewAction,
    ...require('./dama/datatypes/auth').pluginHelpers,
    requestUserId,
    getDb,
    loadConfig,
    storage: require('./dama/storage'),
  });

  // Task system — recover stalled tasks and start polling for all dama-role databases.
  const { findConfigsByRole, isReadOnly } = require('./db/config');
  const damaEnvs = new Set(findConfigsByRole('dama'));
  if (process.env.DAMA_DB_ENV) damaEnvs.add(process.env.DAMA_DB_ENV);

  if (damaEnvs.size > 0) {
    console.log(`[tasks] Initializing for dama envs: ${[...damaEnvs].join(', ')}`);
    for (const env of damaEnvs) {
      try {
        getDb(env); // ensure connection + table init is queued
      } catch (err) {
        console.warn(`[tasks] Could not load db for ${env}: ${err.message}`);
      }
    }
    await awaitReady(); // wait for all inits to complete

    // A read-only database never gets this server's jobs: recovering, claiming or firing them would write it.
    const readOnlyEnvs = [...damaEnvs].filter(env => isReadOnly(env));
    if (readOnlyEnvs.length) console.log(`[tasks] No task recovery, polling or schedules for read-only: ${readOnlyEnvs.join(', ')}`);

    const schedules = require('./dama/tasks/schedules');
    for (const env of damaEnvs) {
      if (readOnlyEnvs.includes(env)) continue;
      try {
        await tasks.recoverStalledTasks(env);
        tasks.startPolling(env);
        schedules.startScheduleSweep(env);
      } catch (err) {
        console.warn(`[tasks] Could not start polling for ${env}: ${err.message}`);
      }
    }
  }

  // DMS task system — parallel to DAMA's, but targeting the DMS db so DMS-
  // native workers (internal_table publish) don't depend on a DAMA pgEnv.
  try {
    const dmsTasks = require('./dms/tasks');
    await dmsTasks.recoverStalledTasks();
    // startPolling is a no-op until a handler is registered — safe to call.
    dmsTasks.startPolling();
  } catch (err) {
    console.warn(`[dms-tasks] Could not initialize: ${err.message}`);
  }

  // SSR: opt-in via DMS_SSR env var. `ssrHandle` also hears every change notice (notifyAll, below).
  let ssrHandle = null;
  if (process.env.DMS_SSR) {
    const path = require('path');
    const { mountSSR } = await import('../../dms/src/render/ssr2/express/setup.mjs');
    const pgEnvStr = process.env.DMS_PG_ENVS || process.env.VITE_DMS_PG_ENVS || '';
    const pgEnvs = pgEnvStr.split(',').filter(Boolean);

    // Where a production build lives: DMS_DIST_DIR (absolute, or relative to the project root; default
    // dist), holding client/ and server/entry-ssr.js as `vite build` writes them. A local production run
    // can keep its build in dist-ssr/, away from the dist/ the Netlify scripts upload (deploy/build_ssr.mjs
    // builds into the same setting). Dev mode (NODE_ENV not production) ignores it and serves from src/.
    const root = path.resolve(__dirname, '../../../../..');
    const distDir = path.resolve(root, process.env.DMS_DIST_DIR || 'dist');
    const ssr = await mountSSR(app, {
      root,
      serverEntry: '/src/entry-ssr.jsx',
      clientDir: path.join(distDir, 'client'),
      serverBundle: path.join(distDir, 'server', 'entry-ssr.js'),
      // the site's manifest, icons and service worker in the page head (routes/appSettings)
      getHeadTags: require('./routes/appSettings').headTags,
      // the site's server-compiled sheet (css/siteCss.js), for the build's <link data-dms-site-css>
      getSiteCss: async (req) => siteCss.headInfo(await siteCss.sheetFor({
        app: await require('./routes/appSettings/store').appForHost(req.headers.host),
        type: siteType(),
        manifestFile: cssManifest(),
      })),
      // who is asking for a page: the session cookie (rsc-view-pages.md phase 1)
      resolveSession: createSessionResolver(authDbEnv),
      handlerConfig: {
        apiHost: `http://localhost:${PORT}`,
        siteConfig: {
          app: process.env.DMS_APP || process.env.VITE_DMS_APP,
          type: process.env.DMS_TYPE || process.env.VITE_DMS_TYPE,
          baseUrl: process.env.DMS_BASE_URL || process.env.VITE_DMS_BASE_URL || '/list',
          authPath: process.env.DMS_AUTH_PATH || process.env.VITE_DMS_AUTH_PATH || '/auth',
        },
        pgEnvs,
        isMultiTenant: (process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1',
        rootDomain: process.env.DMS_ROOT_DOMAIN || process.env.VITE_DMS_ROOT_DOMAIN || '',
        // installed plugins a site turns on are imported from their version folder (plugins/store.js)
        resolvePluginUrl: (name, version) => pluginStore.ssrEntryUrl(name, version),
        // the longest a route's shared page data is kept without a change notice (render/ssr2/dataVersions.js)
        ...(process.env.DMS_SSR_DATA_MAX_AGE_MS !== undefined && Number.isFinite(Number(process.env.DMS_SSR_DATA_MAX_AGE_MS))
          ? { dataMaxAgeMs: Number(process.env.DMS_SSR_DATA_MAX_AGE_MS) } : {}),
      },
    });
    ssrHandle = ssr;
    // The hub: a tenant or domain change (alias verified / removed, primary moved, tenant added) changes
    // what a host renders, so the SSR handler's per-host route cache starts over (tenant-external-domains.md).
    if (ssr && ssr.invalidateRoutes) {
      require('./routes/domains/store').onChange(() => ssr.invalidateRoutes());
    }
  }

  // 404 catch-all — must be last middleware (after SSR if enabled)
  app.use((req, res, next) => {
    res.status(404).send("Invalid Request.");
  });

  const server = app.listen(PORT, () => {
    console.log(`DMS Server running on port ${PORT}`);
    try {
      console.log(`  Split mode: ${loadConfig(syncDbEnv).splitMode} (${syncDbEnv}; per-app unless the config or DMS_SPLIT_MODE says legacy)`);
    } catch (err) {
      console.log(`  Split mode: unknown (${syncDbEnv}: ${err.message})`);
    }
    const envEntries = Object.entries(process.env)
      .filter(([key]) => key.startsWith('DMS'));

    if (envEntries.length) {
      console.log('\nEnvironment:');
      for (const [key, value] of envEntries) {
        console.log(`  ${key}=${value}`);
      }
    }
    console.log('');
  });

  // WebSocket for sync — attach after server is listening
  const { initWebSocket, notifyChange } = require('./routes/sync/ws');
  const syncDb = getDb(syncDbEnv);
  initWebSocket(server, syncDb);
  startCompaction(syncDb, syncDb.type);

  // Wire change notifications: controller → WS broadcast, push endpoint → WS broadcast.
  //
  // This must be set on the instance dms.route.js serves its routes from, which it exports
  // as `.controller`. dms.controller.js's module default is a DIFFERENT instance (created at
  // import time, never used to serve a request) — and `_notifyChange` is private to each
  // controller closure, so setting it there silently leaves the Falcor path unnotified:
  // change_log rows get written, nothing is ever broadcast. That was the bug from sync's
  // first commit until 2026-10-21; see falcor-writes-not-broadcast.md.
  //
  // Still unwired, same cause: the per-dbEnv controller dama/upload/index.js:34 builds for
  // the file-upload publish handlers.
  //
  // Both also feed the per-site CSS: a saved row's new classes go into its app's sheet (css/siteCss.js), and the
  // server render: the app's pages are read again rather than served from its cache (ssr-logged-in-render-and-
  // stale-cache.md, issue 3).
  const notifyAll = (app, msg) => {
    notifyChange(app, msg);
    try { siteCss.noteChange(app, msg); } catch (e) { console.warn('[site-css] change not applied:', e.message); }
    try { ssrHandle?.noteChange?.(app, msg); } catch (e) { console.warn('[ssr] change not applied:', e.message); }
  };
  const dmsRoutes = require('./routes/dms/dms.route');
  dmsRoutes.controller.setNotifyChange(notifyAll);

  // Also wire the push endpoint's broadcast callback
  createSyncRoutes._notifyChange = notifyAll;
}

setupAndListen();
