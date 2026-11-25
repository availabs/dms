'use strict';
/**
 * A site's app settings (site-app-settings-pwa.md; the store is ./store.js).
 *
 * Editing, for hub staff (`manage-tenants` on the hub) or the site's own admins (`manage-themes` on its
 * site row):
 *
 *     GET  /tenants/:tenant/app-settings          the settings, with a data-URL preview of the 192px icon
 *     POST /tenants/:tenant/app-settings          { name, short_name, theme_color, background_color }
 *     POST /tenants/:tenant/app-settings/icon     the image as the body (application/octet-stream)
 *     POST /tenants/:tenant/app-settings/icon/remove
 *
 * The same four under `/hub/app-settings` are the server's own site (the hub's, or a single-tenant
 * server's), and under `/_dms/apps/:app/app-settings` any app with a site row on this server (an app's own
 * Settings page, on every server: app-settings-pages.md). The tenant routes are mounted on a multi-tenant
 * server only.
 *
 * Public, answered for the site the request's Host shows:
 *
 *     GET /manifest.webmanifest    GET /icon-<size>.png    GET /favicon.ico    GET /sw.js
 *
 * And `headTags(req)`, the page head's tags for that site, which the SSR middleware adds.
 */
const { requireUser } = require('../auth/requestUser');
const { siteCan } = require('../auth');
const domains = require('../domains/store');
const store = require('./store');

// an app name as the routes take it: what a per-app table name is built from, nothing else
const APP_NAME = /^[\w.+-]+$/;
const fail = (res, e) => res.status(e.status || 500).json({ error: e.message });
const esc = (s) => `${s}`.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The editor's app, after judging the caller; null once answered. */
async function editable(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  let app = store.hubApp();
  if (req.params.app !== undefined) {
    app = req.params.app;
    if (!APP_NAME.test(app) || !(await store.siteRowOf(app))) { res.status(404).json({ error: `no app "${app}" on this server` }); return null; }
  } else if (req.params.tenant !== undefined) {
    const row = await domains.tenantBySubdomain(req.params.tenant, { fresh: true });
    if (!row || !row.data.app) { res.status(404).json({ error: `no tenant "${req.params.tenant}"` }); return null; }
    app = row.data.app;
  }
  const isStaff = store.multiTenant() && await siteCan(store.hubApp(), user, ['manage-tenants']);
  if (!isStaff && !(await siteCan(app, user, ['manage-themes']))) {
    res.status(403).json({ error: 'Not authorized: needs manage-themes on this site' });
    return null;
  }
  return { app, user };
}

/** What the editor shows: the settings, the names it falls back to, and the icon as a data URL. */
async function describe(app) {
  const { siteName, settings } = await store.read(app, { fresh: true });
  let preview = null;
  const icon = await store.readIcon(app, 'icon-192');
  if (icon) preview = `data:image/png;base64,${(await store.streamToBuffer(icon.stream)).toString('base64')}`;
  return { settings: settings || {}, fallbackName: siteName || process.env.VITE_DMS_TITLE || '', preview };
}

/** The name the site goes by: its settings, then the site row's name, then the build's title. */
function nameOf(siteName, settings = {}) {
  const name = settings.name || siteName || process.env.VITE_DMS_TITLE || 'DMS';
  return { name, short_name: settings.short_name || name };
}

const SERVICE_WORKER = `// site-app-settings-pwa.md: navigations go to the network; an offline page only when that fails.
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Offline</title><body style="font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0">'
  + '<div style="text-align:center"><p>Offline</p><button onclick="location.reload()" style="font:inherit;padding:.5rem 1rem">Retry</button></div>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
`;

/** The head tags for the site a request shows; '' when it has no app settings. */
async function headTags(req) {
  const app = await store.appForHost(req.headers.host || '');
  if (!app) return '';
  const { siteName, settings } = await store.read(app);
  if (!settings) return '';
  const { short_name } = nameOf(siteName, settings);
  const v = settings.icon && settings.icon.version;
  return [
    '<link rel="manifest" href="/manifest.webmanifest">',
    settings.theme_color ? `<meta name="theme-color" content="${esc(settings.theme_color)}">` : '',
    v ? `<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png?v=${v}">` : '',
    v ? `<link rel="apple-touch-icon" href="/icon-180.png?v=${v}">` : '',
    `<meta name="apple-mobile-web-app-title" content="${esc(short_name)}">`,
    `<script>if('serviceWorker' in navigator)addEventListener('load',function(){navigator.serviceWorker.register('/sw.js')})</script>`,
  ].join('');
}

function registerAppSettingsRoutes(app) {
  const bases = [...(store.multiTenant() ? ['/tenants/:tenant/app-settings'] : []), '/hub/app-settings', '/_dms/apps/:app/app-settings'];
  for (const base of bases) {
    app.get(base, async (req, res) => {
      try {
        const who = await editable(req, res);
        if (!who) return;
        res.json(await describe(who.app));
      } catch (e) { fail(res, e); }
    });

    app.post(base, async (req, res) => {
      try {
        const who = await editable(req, res);
        if (!who) return;
        await store.write({ app: who.app, patch: req.body || {}, user: who.user });
        console.log(`[app-settings] ${who.app} settings saved by ${who.user.email}`);
        res.json(await describe(who.app));
      } catch (e) { fail(res, e); }
    });

    app.post(`${base}/icon`, async (req, res) => {
      try {
        const who = await editable(req, res);
        if (!who) return;
        await store.saveIcon({ app: who.app, buffer: req.body, user: who.user });
        console.log(`[app-settings] ${who.app} icon replaced by ${who.user.email}`);
        res.json(await describe(who.app));
      } catch (e) { fail(res, e); }
    });

    app.post(`${base}/icon/remove`, async (req, res) => {
      try {
        const who = await editable(req, res);
        if (!who) return;
        await store.removeIcon({ app: who.app, user: who.user });
        console.log(`[app-settings] ${who.app} icon removed by ${who.user.email}`);
        res.json(await describe(who.app));
      } catch (e) { fail(res, e); }
    });
  }

  // --- public, by Host ---

  app.get('/manifest.webmanifest', async (req, res, next) => {
    try {
      const site = await store.appForHost(req.headers.host || '');
      if (!site) return next();
      const { siteName, settings } = await store.read(site);
      const s = settings || {};
      const v = s.icon && s.icon.version;
      const icon = (file, size, purpose) => ({ src: `/${file}.png?v=${v}`, sizes: `${size}x${size}`, type: 'image/png', ...(purpose ? { purpose } : {}) });
      res.set('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify({
        id: '/',
        ...nameOf(siteName, s),
        start_url: '/',
        scope: '/',
        display: 'standalone',
        ...(s.theme_color ? { theme_color: s.theme_color } : {}),
        ...(s.background_color ? { background_color: s.background_color } : {}),
        icons: v ? [icon('icon-192', 192), icon('icon-512', 512), icon('icon-maskable-512', 512, 'maskable')] : [],
      }));
    } catch (e) { next(e); }
  });

  const sendIcon = (file) => async (req, res, next) => {
    try {
      const site = await store.appForHost(req.headers.host || '');
      const icon = site ? await store.readIcon(site, file) : null;
      if (!icon) return next();
      res.set('Cache-Control', req.query.v === icon.version ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
      res.type('image/png');
      icon.stream.on('error', next).pipe(res);
    } catch (e) { next(e); }
  };
  for (const file of store.ICON_NAMES) app.get(`/${file}.png`, sendIcon(file));
  app.get('/favicon.ico', sendIcon('icon-32'));   // a site with no icon of its own falls through to the build's

  app.get('/sw.js', (req, res) => {
    res.set('Cache-Control', 'no-cache').type('application/javascript').send(SERVICE_WORKER);
  });
}

module.exports = { registerAppSettingsRoutes, headTags };
