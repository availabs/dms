/**
 * The DMS plugin contract, server side.
 *
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md (P1, "the contract, still built in").
 *
 * A plugin's server entry exports
 *
 *   { name, version, api, activation?, register(host) }
 *
 * and `register(host)` returns today's data-type definition (dama/datatypes/index.js registerDatatype):
 * `{ workers, routes, openRoutes, schedulables, rules }`. A module in the old shape (the definition itself) still
 * registers as before. The host is small on purpose: it grows into the plugin API (scoped DB access, the task
 * queue, storage, auth checks) that replaces the deep `require`s into dms-server internals.
 *
 * The manifest: a plugin package's `package.json` carries a `dms` key, and a release carries an `index.json`
 * generated from it that names every file with its size and sha512 (owner's decision D3). Both are validated here.
 */
const path = require('path');

// The plugin API this server provides: the same version as the client library's (packages/dms/src/plugins).
const PLUGIN_API_VERSION = '1.1.0';
const ACTIVATION = ['default-on', 'opt-in'];
const NAME = /^[a-z][a-z0-9_]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;

const parseVersion = (v) => String(v).trim().replace(/^v/, '').split(/[-+]/)[0].split('.').map(x => (x === 'x' || x === '*' ? null : Number(x)));

/** Whether `range` accepts `version`: '^1.2', '~1.2.3', '1.x', '1.2.3', '*', '>=1.0 <2'. Same rules as the client's. */
function satisfies(version, range) {
  const [ma, mi = 0, pa = 0] = parseVersion(version);
  const v = [ma, mi, pa];
  const cmp = (a, b) => { for (let i = 0; i < 3; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); if (d) return d; } return 0; };
  const r = String(range || '').trim();
  if (!r || r === '*') return true;
  if (/\s/.test(r)) return r.split(/\s+/).every(part => satisfies(version, part));
  const op = r.match(/^(\^|~|>=|<=|>|<|=)?(.*)$/);
  const want = parseVersion(op[2]);
  const lo = want.map(x => x ?? 0);
  switch (op[1]) {
    case '^':
      if (cmp(v, lo) < 0) return false;
      if (lo[0] > 0) return ma === lo[0];
      if (lo[1] > 0) return ma === 0 && mi === lo[1];
      return cmp(v, lo) === 0;
    case '~': return cmp(v, lo) >= 0 && ma === lo[0] && mi === lo[1];
    case '>=': return cmp(v, lo) >= 0;
    case '<=': return cmp(v, lo) <= 0;
    case '>': return cmp(v, lo) > 0;
    case '<': return cmp(v, lo) < 0;
    default: return want.every((w, i) => w === null || w === undefined || w === v[i]);
  }
}

// A path inside the package: relative, forward slashes, no `..`, nothing hidden at the top.
function safeRelative(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.includes('\\') || p.includes('\0')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(p)) return false;   // a URL scheme or a drive letter
  const norm = path.posix.normalize(p.replace(/^\.\//, ''));
  return !path.posix.isAbsolute(norm) && !norm.startsWith('..') && norm !== '.' && !norm.split('/').includes('..');
}

const stringArray = (v) => Array.isArray(v) && v.every(x => typeof x === 'string' && x.length);

/*
 * A plugin's settings: `dms.settings` in its package.json (copied into index.json by `dms plugin pack`), the shape of
 * an activation row's `config` (P2 step 5). A small subset of JSON Schema, checked here with no dependency:
 *
 *   { "properties": { "station": { "type": "string", "enum": ["wamc", "wnyc"], "title": "…", "default": "wamc" },
 *                     "volume":  { "type": "number", "minimum": 0, "maximum": 10 },
 *                     "tags":    { "type": "array", "items": { "type": "string" } },
 *                     "map":     { "type": "object" } },          // any plain object, not looked inside
 *     "required": ["station"], "additionalProperties": false }    // false is the default: unknown keys refused
 *
 * Types: string (minLength, maxLength), number and integer (minimum, maximum), boolean, array (items: one of the
 * scalar types; minItems, maxItems), object. Any type takes enum, default, title and description.
 */
const SETTING_TYPES = ['string', 'number', 'integer', 'boolean', 'array', 'object'];
const SCALAR_TYPES = ['string', 'number', 'integer', 'boolean'];
const SETTING_KEYS = ['type', 'enum', 'default', 'title', 'description', 'minLength', 'maxLength', 'minimum', 'maximum', 'items', 'minItems', 'maxItems'];
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Problems with a settings schema; empty when it is valid. */
function validateSettingsSchema(schema) {
  const errors = [];
  if (!isPlainObject(schema)) return ['settings: an object with `properties`'];
  for (const k of Object.keys(schema)) {
    if (!['type', 'properties', 'required', 'additionalProperties', 'title', 'description'].includes(k)) errors.push(`settings.${k}: unknown key`);
  }
  if (schema.type !== undefined && schema.type !== 'object') errors.push('settings.type: "object" or nothing');
  const props = schema.properties === undefined ? {} : schema.properties;
  if (!isPlainObject(props)) errors.push('settings.properties: an object of settings');
  else {
    for (const [name, p] of Object.entries(props)) {
      const at = `settings.properties.${name}`;
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) errors.push(`${at}: a setting's name is letters, digits and underscores`);
      if (!isPlainObject(p)) { errors.push(`${at}: an object with a type`); continue; }
      for (const k of Object.keys(p)) if (!SETTING_KEYS.includes(k)) errors.push(`${at}.${k}: unknown key`);
      if (!SETTING_TYPES.includes(p.type)) { errors.push(`${at}.type: one of ${SETTING_TYPES.join(', ')}`); continue; }
      if (p.type === 'array' && !(isPlainObject(p.items) && SCALAR_TYPES.includes(p.items.type))) errors.push(`${at}.items: { "type": one of ${SCALAR_TYPES.join(', ')} }`);
      if (p.enum !== undefined && !(Array.isArray(p.enum) && p.enum.length)) errors.push(`${at}.enum: a list of the allowed values`);
      for (const k of ['minLength', 'maxLength', 'minItems', 'maxItems']) if (p[k] !== undefined && !(Number.isInteger(p[k]) && p[k] >= 0)) errors.push(`${at}.${k}: a whole number`);
      for (const k of ['minimum', 'maximum']) if (p[k] !== undefined && typeof p[k] !== 'number') errors.push(`${at}.${k}: a number`);
      if (p.default !== undefined) for (const e of settingErrors(p, p.default)) errors.push(`${at}.default: ${e}`);
    }
  }
  if (schema.required !== undefined) {
    if (!stringArray(schema.required)) errors.push('settings.required: a list of setting names');
    else for (const r of schema.required) if (!isPlainObject(props) || !(r in props)) errors.push(`settings.required: "${r}" is not among the properties`);
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') errors.push('settings.additionalProperties: true or false');
  return errors;
}

function typeOk(type, v) {
  switch (type) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'integer': return Number.isInteger(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return isPlainObject(v);
    default: return false;
  }
}

// One setting's value against its declaration.
function settingErrors(p, v) {
  if (!typeOk(p.type, v)) return [`should be ${p.type === 'integer' ? 'a whole number' : `a${/^[aeiou]/.test(p.type) ? 'n' : ''} ${p.type}`}`];
  const errors = [];
  if (Array.isArray(p.enum) && !p.enum.some(e => JSON.stringify(e) === JSON.stringify(v))) errors.push(`should be one of ${p.enum.map(e => JSON.stringify(e)).join(', ')}`);
  if (p.type === 'string') {
    if (p.minLength !== undefined && v.length < p.minLength) errors.push(`at least ${p.minLength} characters`);
    if (p.maxLength !== undefined && v.length > p.maxLength) errors.push(`at most ${p.maxLength} characters`);
  }
  if (p.type === 'number' || p.type === 'integer') {
    if (p.minimum !== undefined && v < p.minimum) errors.push(`at least ${p.minimum}`);
    if (p.maximum !== undefined && v > p.maximum) errors.push(`at most ${p.maximum}`);
  }
  if (p.type === 'array') {
    if (p.minItems !== undefined && v.length < p.minItems) errors.push(`at least ${p.minItems} items`);
    if (p.maxItems !== undefined && v.length > p.maxItems) errors.push(`at most ${p.maxItems} items`);
    const bad = v.findIndex(x => !typeOk(p.items?.type, x));
    if (bad >= 0) errors.push(`item ${bad + 1} should be a ${p.items?.type}`);
  }
  return errors;
}

/**
 * Problems with an activation's `config` against a release's settings schema; empty when it fits. No schema: the
 * plugin takes no settings, so only an empty config fits. A required setting with a `default` may be left out.
 */
function checkConfig(schema, config) {
  if (config === undefined || config === null) config = {};
  if (!isPlainObject(config)) return ['config: an object of settings'];
  if (!schema) return Object.keys(config).length ? [`config: this plugin takes no settings (got ${Object.keys(config).join(', ')})`] : [];
  const props = schema.properties || {};
  const errors = [];
  for (const r of schema.required || []) {
    if ((config[r] === undefined || config[r] === null) && props[r]?.default === undefined) errors.push(`config.${r}: required`);
  }
  for (const [k, v] of Object.entries(config)) {
    if (!props[k]) { if (schema.additionalProperties !== true) errors.push(`config.${k}: not a setting of this plugin`); continue; }
    if (v === null) continue;
    for (const e of settingErrors(props[k], v)) errors.push(`config.${k}: ${e}`);
  }
  return errors;
}

/** A release's permissions as a sorted list of "kind:value" strings, e.g. ["egress:api.example.com", "schemas:now_playing"]. */
function permissionList(permissions) {
  const out = [];
  for (const [k, list] of Object.entries(permissions || {})) for (const v of Array.isArray(list) ? list : []) out.push(`${k}:${v}`);
  return [...new Set(out)].sort();
}

/**
 * Validates a plugin manifest: a package.json (with a `dms` key) or a release index.json. Returns a list of
 * problems, empty when valid.
 * @param {object} manifest
 * @param {{ release?: boolean }} [opts] - release: an index.json, which must list every file with size and sha512
 */
function validateManifest(manifest, { release = false } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') return ['the manifest is not an object'];
  const dms = release ? manifest : manifest.dms;
  // a package.json is named @scope/dms-plugin-<name> or anything npm allows; the plugin name is dms.name or the
  // package name without scope and prefix
  const name = release ? manifest.name : (dms?.name || String(manifest.name || '').replace(/^@[^/]+\//, '').replace(/^dms-plugin-/, '').replace(/-/g, '_'));
  if (!dms || typeof dms !== 'object') return ['package.json has no `dms` key'];
  if (!NAME.test(name || '')) errors.push(`name "${name}": lowercase letters, digits and underscores, starting with a letter`);
  if (!VERSION.test(String(manifest.version || ''))) errors.push(`version "${manifest.version}" is not x.y.z`);
  if (typeof dms.api !== 'string' || !dms.api) errors.push('api: the plugin API range is missing (e.g. "^1.0")');
  else if (!satisfies(PLUGIN_API_VERSION, dms.api)) errors.push(`api "${dms.api}" does not accept this server's plugin API ${PLUGIN_API_VERSION}`);
  if (dms.activation !== undefined && !ACTIVATION.includes(dms.activation)) errors.push(`activation must be ${ACTIVATION.join(' or ')}`);

  const contributes = dms.contributes || {};
  for (const k of Object.keys(contributes)) {
    if (!['themes', 'patterns', 'dataTypes'].includes(k)) errors.push(`contributes.${k}: unknown kind (themes, patterns, dataTypes)`);
    else if (!stringArray(contributes[k])) errors.push(`contributes.${k}: a list of names`);
  }
  if (!Object.values(contributes).some(v => Array.isArray(v) && v.length)) errors.push('contributes: the plugin contributes nothing');

  const entries = dms.entries || {};
  for (const [k, v] of Object.entries(entries)) {
    if (!['client', 'ssr', 'server', 'classes', 'formats', 'migrations'].includes(k)) errors.push(`entries.${k}: unknown entry`);
    else if (!safeRelative(v)) errors.push(`entries.${k}: "${v}" is not a path inside the package`);
  }
  if (!entries.client && !entries.ssr && !entries.server) errors.push('entries: a client, ssr or server entry is needed');

  const permissions = dms.permissions || {};
  for (const k of Object.keys(permissions)) {
    if (!['schemas', 'egress', 'taskTypes', 'requires'].includes(k)) errors.push(`permissions.${k}: unknown permission`);
    else if (!stringArray(permissions[k]) && !(Array.isArray(permissions[k]) && !permissions[k].length)) errors.push(`permissions.${k}: a list of strings`);
  }

  if (dms.settings !== undefined) errors.push(...validateSettingsSchema(dms.settings));

  if (release) {
    const files = manifest.files;
    if (!Array.isArray(files) || !files.length) errors.push('files: a release lists every file');
    else {
      const seen = new Set();
      for (const f of files) {
        if (!f || !safeRelative(f.path)) { errors.push(`files: "${f?.path}" is not a path inside the package`); continue; }
        const norm = path.posix.normalize(f.path.replace(/^\.\//, ''));
        if (seen.has(norm)) errors.push(`files: "${f.path}" is listed twice`);
        seen.add(norm);
        if (!Number.isInteger(f.size) || f.size < 0) errors.push(`files: "${f.path}" has no size`);
        if (typeof f.sha512 !== 'string' || !/^(?:[0-9a-f]{128}|[A-Za-z0-9+/]{86}==)$/.test(f.sha512)) errors.push(`files: "${f.path}" has no sha512 (hex or base64)`);
      }
      for (const [k, v] of Object.entries(entries)) {
        if (k === 'migrations' || typeof v !== 'string') continue;
        if (!seen.has(path.posix.normalize(v.replace(/^\.\//, '')))) errors.push(`entries.${k}: "${v}" is not among the files`);
      }
    }
  }
  return errors;
}

const plugins = new Map();   // name -> { name, version, api, activation }

/**
 * A data type's definition from a module: a plugin (`register(host)`) or the old shape (the definition itself).
 * A plugin built for another plugin API is refused.
 */
function definitionOf(name, mod) {
  if (!mod || typeof mod.register !== 'function') return mod;
  const { version = '0.0.0', api, activation = 'opt-in' } = mod;
  const pluginName = mod.name || name;
  if (!satisfies(PLUGIN_API_VERSION, api)) {
    throw new Error(`plugin "${pluginName}" needs plugin API ${api}; this server provides ${PLUGIN_API_VERSION}`);
  }
  if (!ACTIVATION.includes(activation)) throw new Error(`plugin "${pluginName}": activation must be ${ACTIVATION.join(' or ')}`);
  const host = {
    apiVersion: PLUGIN_API_VERSION,
    plugin: pluginName,
    log: (...m) => console.log(`[plugin ${pluginName}]`, ...m),
  };
  const definition = mod.register(host);
  if (!definition || typeof definition !== 'object') throw new Error(`plugin "${pluginName}": register(host) returned no definition`);
  plugins.set(pluginName, { name: pluginName, version, api, activation, dataType: name });
  return definition;
}

const listServerPlugins = () => [...plugins.values()];

module.exports = {
  PLUGIN_API_VERSION, satisfies, validateManifest, validateSettingsSchema, checkConfig, permissionList, definitionOf,
  listServerPlugins, safeRelative,
};
