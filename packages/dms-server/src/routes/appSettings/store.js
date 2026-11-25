'use strict';
/**
 * A site's app settings: its icon, app name and colours, kept on its own site row as
 * `data.app_settings` (site-app-settings-pwa.md).
 *
 *     appForHost(host)               the app a request's Host shows (a tenant's, or the server's own)
 *     read(app)                      { siteId, siteName, settings } — cached for a minute
 *     write({ app, patch, user })    merge name / short_name / colours; a new background redraws the icons
 *     saveIcon({ app, buffer, user })   the upload → the icon set, under a new version
 *     removeIcon({ app, user })
 *     readIcon(app, file)            a readable stream of one of the current version's files
 *
 * Icons live in file storage (dama/storage), at app-icons/<app>/<version>/<file>.png. The version is a
 * hash of the source and the background colour, so any change makes new addresses and browsers, which
 * hold on to favicons, fetch the new ones.
 */
const crypto = require('crypto');
const { getDb } = require('../../db');
const { resolveTable } = require('../../db/table-resolver');
const { resolveHost, rootDomain } = require('../../utils/subdomain');
const domains = require('../domains/store');

const dmsDbEnv = () => process.env.DMS_DB_ENV || 'dms-sqlite';
const dmsDb = () => getDb(dmsDbEnv());
const splitModeOf = () => { try { return require('../../db').loadConfig(dmsDbEnv()).splitMode; } catch { return require('../../db/table-resolver').resolveSplitMode(); } };
const table = (app) => resolveTable(app, '', dmsDb().type, splitModeOf()).fullName;
const parseJson = (v) => { if (v == null) return null; if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } } return v; };

const hubApp = () => process.env.DMS_APP || process.env.VITE_DMS_APP || '';
const multiTenant = () => (process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1';

const refuse = (status, message) => Object.assign(new Error(message), { status });

// The files an icon set has. `flatten`: drawn on the background colour (iOS shows transparency as
// black); `pad`: the share of the tile the icon fills (Android's maskable safe zone is the middle 80%).
const ICON_FILES = {
  'icon-32': { size: 32 },
  'icon-180': { size: 180, flatten: true },
  'icon-192': { size: 192 },
  'icon-512': { size: 512 },
  'icon-maskable-512': { size: 512, flatten: true, pad: 0.8 },
};
const ICON_NAMES = Object.keys(ICON_FILES);
const MAX_UPLOAD = 5 * 1024 * 1024;
const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_BACKGROUND = '#ffffff';

const iconDir = (app, version) => `app-icons/${app}/${version}`;
const storage = () => require('../../dama/storage');
const sharp = () => require('../../dama/upload/sharp').getSharp();

/** The app a Host shows: on the hub, the tenant it resolves to (or the hub's own); else the server's. */
async function appForHost(host) {
  if (!multiTenant()) return hubApp();
  const resolved = resolveHost(host, rootDomain());
  if (!resolved || !resolved.tenant) return hubApp();
  const row = await domains.tenantBySubdomain(resolved.tenant);
  return (row && row.data && row.data.app) || null;
}

async function siteRowOf(app) {
  let rows = [];
  try {
    rows = (await dmsDb().query(`SELECT id, data FROM ${table(app)} WHERE app = $1 AND type LIKE '%:site' ORDER BY id`, [app])).rows;
  } catch (e) {
    if (!/no such table|does not exist/i.test(e.message)) throw e;
  }
  if (!rows.length) return null;
  return { id: +rows[0].id, data: parseJson(rows[0].data) || {} };
}

const TTL = 60 * 1000;
const cache = new Map();   // app -> { at, value }

async function read(app, { fresh = false } = {}) {
  const hit = cache.get(app);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.value;
  const row = app ? await siteRowOf(app) : null;
  // Settings with every field cleared are no settings: the page head goes back to the build's.
  const stored = row ? parseJson(row.data.app_settings) : null;
  const settings = stored && Object.values(stored).some(Boolean) ? stored : null;
  const value = row
    ? { siteId: row.id, siteName: row.data.site_name || '', settings }
    : { siteId: null, siteName: '', settings: null };
  cache.set(app, { at: Date.now(), value });
  return value;
}

async function store(app, siteId, settings, user) {
  const ctl = require('../dms/dms.controller').createController(dmsDbEnv());
  await ctl.setDataById(siteId, { app_settings: settings }, user, app);
  cache.delete(app);
}

async function siteOrRefuse(app) {
  const current = await read(app, { fresh: true });
  if (!current.siteId) throw refuse(404, 'This site has no site row');
  return current;
}

const clean = (v, max) => `${v == null ? '' : v}`.trim().slice(0, max);

/** Draw the icon set from a source PNG and save it under its version. Returns the version. */
async function drawIcons(app, source, background) {
  const bg = HEX.test(background || '') ? background : DEFAULT_BACKGROUND;
  const version = crypto.createHash('sha1').update(source).update(bg).digest('hex').slice(0, 12);
  const dir = iconDir(app, version);
  const s = sharp();
  await storage().write(`${dir}/source.png`, source);
  for (const [name, { size, flatten, pad = 1 }] of Object.entries(ICON_FILES)) {
    const inner = Math.round(size * pad);
    let img = s(source).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    if (pad < 1) {
      const edge = Math.floor((size - inner) / 2);
      img = s(await img.png().toBuffer()).extend({ top: edge, left: edge, bottom: size - inner - edge, right: size - inner - edge, background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    if (flatten) img = s(await img.png().toBuffer()).flatten({ background: bg });
    await storage().write(`${dir}/${name}.png`, await img.png().toBuffer());
  }
  return version;
}

async function dropVersion(app, version) {
  if (!version) return;
  try { await storage().remove(`${iconDir(app, version)}/`); }
  catch (e) { console.warn(`[app-settings] could not remove old icons ${iconDir(app, version)}: ${e.message}`); }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function write({ app, patch = {}, user }) {
  const { siteId, settings } = await siteOrRefuse(app);
  const next = { ...(settings || {}) };
  if ('name' in patch) next.name = clean(patch.name, 80);
  if ('short_name' in patch) next.short_name = clean(patch.short_name, 30);
  for (const key of ['theme_color', 'background_color']) {
    if (!(key in patch)) continue;
    const value = clean(patch[key], 7);
    if (value && !HEX.test(value)) throw refuse(400, `${key === 'theme_color' ? 'Theme' : 'Background'} colour must be #rrggbb`);
    next[key] = value.toLowerCase();
  }
  // The apple and maskable icons are drawn on the background: a new one redraws them.
  const old = next.icon && next.icon.version;
  if (old && (settings || {}).background_color !== next.background_color) {
    const source = await streamToBuffer(await storage().read(`${iconDir(app, old)}/source.png`));
    next.icon = { version: await drawIcons(app, source, next.background_color) };
  }
  await store(app, siteId, next, user);
  if (old && next.icon.version !== old) await dropVersion(app, old);
  return next;
}

async function saveIcon({ app, buffer, user }) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw refuse(400, 'Send the image as the request body');
  if (buffer.length > MAX_UPLOAD) throw refuse(413, 'Image is over 5 MB');
  const { siteId, settings } = await siteOrRefuse(app);
  let source;
  try {
    const meta = await sharp()(buffer).metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    // An SVG is drawn at the density that makes it 1024px, not drawn small and scaled up (a 24-unit
    // mark at the default density is 24px).
    const density = meta.format === 'svg' ? Math.min(100000, Math.ceil(72 * 1024 / Math.max(meta.width, meta.height))) : undefined;
    const img = sharp()(buffer, density ? { density } : {});
    source = await img.resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  } catch {
    throw refuse(400, 'Not an image sharp can read (PNG, JPEG, WebP or SVG)');
  }
  const next = { ...(settings || {}) };
  const old = next.icon && next.icon.version;
  next.icon = { version: await drawIcons(app, source, next.background_color) };
  await store(app, siteId, next, user);
  if (old && old !== next.icon.version) await dropVersion(app, old);
  return next;
}

async function removeIcon({ app, user }) {
  const { siteId, settings } = await siteOrRefuse(app);
  const next = { ...(settings || {}) };
  const old = next.icon && next.icon.version;
  delete next.icon;
  await store(app, siteId, next, user);
  await dropVersion(app, old);
  return next;
}

/** One file of the app's current icon set, as a stream, or null. */
async function readIcon(app, file) {
  if (!ICON_NAMES.includes(file)) return null;
  const { settings } = await read(app);
  const version = settings && settings.icon && settings.icon.version;
  if (!version) return null;
  try { return { version, stream: await storage().read(`${iconDir(app, version)}/${file}.png`) }; }
  catch { return null; }
}

module.exports = { appForHost, siteRowOf, read, write, saveIcon, removeIcon, readIcon, drawIcons, streamToBuffer, hubApp, multiTenant, ICON_NAMES };
