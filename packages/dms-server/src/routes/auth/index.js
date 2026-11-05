'use strict';
/**
 * THE AUTH LAYER — one question, asked the same way everywhere.
 *
 *     authorize({ row | env+sourceId | env+viewId | env | app+patternId, verb, fields, patch, user, app, subdomain })
 *       → { allow, reason, write? }                                  pure: no mode, no logging
 *
 *     applyMode(decision, ctx) → boolean                             the mode, applied (report.js)
 *
 *     assertDataWrite(router, op, app, row, patch, opts)             Falcor / REST write guard: throws
 *     requireCan(req, res, subject)                                  Express guard: answers 401/403
 *     assertCan(router, subject)                                     Falcor guard: throws
 *     readableSources({ env, sourceIds, … })                         a listing, judged once
 *
 * **Given a row and the grants its owners carry, may this user do this verb to it?** `verb` is one
 * of the four structural ops — `read`, `create`, `edit`, `delete` — or any verb a format declares
 * (`update-source`, `auth-users`, …), which is asked of the row's owner by name.
 *
 * THE THREE RULES this folder is built on (planning/tasks/current/auth-grants-on-the-owner-row.md):
 *   1. A row's parent is named by its type path, or by a reference from a parent inside that path's
 *      container (`parent_id`, stamped from a `dms-format` attribute). The reference wins when present.
 *   2. A rule's owner positions are resolved by walking those parents: `self`, `parent`,
 *      `ancestor:<kind>`, `site`. Nothing here names a kind or a pattern type.
 *   3. A verb is granted on the row that owns its subject. Site-level verbs live on the site row.
 *
 *   owners.js      which rows govern this one: one snapshot, one walk over parentage
 *   rules.js       the built-in rules, for rows stamped before the formats carried their own
 *   judge.js       the interpreter over a rule
 *   vocabulary.js  which verb governs which field, from the declared `permissionDomain`
 *   grants.js      the stored grant shape and the name-match
 *   report.js      `DMS_AUTH_MODE`: `log` allows and records a would-deny, `enforce` refuses
 *   requestUser.js who is asking (not authorization)
 *   settings.js    the one flag, and the `NO_CHANGE` sentinel
 */
const { isEqual } = require('lodash');
const { getKind, isSplitType } = require('#db/type-utils.js');
const { parseJson, holds, hasGrants, isAppAdmin, resolveAuthPermissions } = require('./grants');
const owners = require('./owners');
const { appSnapshot, grantsAt, ruleFor, mapsFor, sourceOfView, clearSnapshots, isDmsEnv } = owners;
const { judge, ownersIn, STRUCTURAL } = require('./judge');
const { applyMode, refuse } = require('./report');
const { authMode, NO_CHANGE } = require('./settings');
const { requireUser, requireUserOrOpen, requireFalcorUser, requestApp, ANON_CALLER } = require('./requestUser');
const { getSubdomain } = require('../../utils/subdomain');

// ---- planEdit -----------------------------------------------------------------------------------

// Row columns some clients copy into a whole-row save. Timestamps / authors are never judged and
// never written; `id` / `app` / `type` count as unchanged when they equal the row's own column.
const ECHO_ONLY = ['created_at', 'updated_at', 'created_by', 'updated_by'];
const ROW_KEYS = ['id', 'app', 'type'];

/**
 * What an edit changes and what it writes. A key equal to the stored value is not a change and is
 * not written: `write` holds only the changed keys, each of which was judged. `replace` (sync/push
 * onto an existing row) treats a stored key the patch leaves out as removed, and writes the full new
 * data. Without the stored row (split rows) every key is a change and the patch is written as sent.
 */
function planEdit(row, patch, { replace = false } = {}) {
  const p = parseJson(patch) || {};
  const s = parseJson(row && row.data);
  if (!s) return { keys: Object.keys(p).filter(k => !ECHO_ONLY.includes(k)), write: p };
  const unchanged = (k) => isEqual(p[k], s[k]) || (ROW_KEYS.includes(k) && row[k] != null && String(p[k]) === String(row[k]));
  const sent = Object.keys(p).filter(k => !ECHO_ONLY.includes(k));
  const changed = sent.filter(k => !unchanged(k));
  const removed = replace ? Object.keys(s).filter(k => !ECHO_ONLY.includes(k) && !(k in p)) : [];
  const pick = (obj, ks) => Object.fromEntries(ks.map(k => [k, obj[k]]));
  const write = replace
    ? { ...pick(s, Object.keys(s).filter(k => ECHO_ONLY.includes(k))), ...pick(s, sent.filter(unchanged)), ...pick(p, changed) }
    : pick(p, changed);
  return { keys: [...changed, ...removed], write };
}

// ---- authorize ----------------------------------------------------------------------------------

const allow = (reason) => ({ allow: true, reason });
const deny  = (reason) => ({ allow: false, reason });

// `view: false` beside blank grants means "no one", not "everyone".
const isBlank = (ap) => ap != null && !hasGrants(ap) && ap.view !== false;

/**
 * Writing a row's stamped auth rules is an escalation (whoever rewrites them can grant themselves
 * anything they govern), so it is checked in code, never by a rule: site `*`, or on a pattern row
 * `edit-pattern-permissions` held on the pattern itself.
 */
function rulesWrite(snap, row, op, keys, user, subdomain) {
  if (op !== 'edit' || !keys.includes('authRules')) return null;
  if (holds(user, grantsAt(snap, row, 'site', { subdomain }), ['*'])) return null;
  if (row.kind === 'pattern' && holds(user, grantsAt(snap, row, 'self', { subdomain }), ['edit-pattern-permissions'])) return null;
  return deny(`${row.kind} authRules: ${row.kind === 'pattern' ? 'missing edit-pattern-permissions' : 'missing site *'}`);
}

/**
 * May `user` do `verb` to the row the address names? Returns `{ allow, reason }`, plus `write` (the
 * data to store) for an edit judged against its stored row. Pure: the caller applies the mode.
 *
 * `fields`: the keys an edit changes (default: `planEdit(row, patch).keys`). `fresh`: skip the
 * snapshot cache (a write path). `app`: for an external env, the site whose env row locates it.
 */
async function authorize({ row, env, sourceId, viewId, patternId, verb = 'read', fields, patch, replace = false, user = null, app, subdomain = '', fresh = false }) {
  const op = Array.isArray(verb) ? verb : String(verb);
  // a write is judged on what is stored now; a read may use the snapshot, refreshed once on a miss
  fresh = fresh || op !== 'read';
  let subject = await owners.snapshotFor({ row, env, sourceId, viewId, app, patternId, fresh }).catch(e => ({ error: `lookup failed: ${e.message}` }));
  if (subject.error && !fresh) subject = await owners.snapshotFor({ row, env, sourceId, viewId, app, patternId, fresh: true }).catch(e => ({ error: `lookup failed: ${e.message}` }));
  if (subject.error) return deny(subject.error);
  const { snap } = subject;
  const r = subject.row;
  const plan = op === 'edit' && row ? planEdit(row, patch, { replace }) : null;
  const keys = fields != null ? [].concat(fields) : plan ? plan.keys : [];
  const write = plan ? plan.write : patch;

  const siteApp = snap.app || app || null;
  if (isAppAdmin(user, siteApp)) return { ...allow(`${siteApp} Admin`), write };

  try {
    const fixed = rulesWrite(snap, r, op, keys, user, subdomain);
    if (fixed) return fixed;
    const { rule } = ruleFor(snap, r);
    const grants = {};
    if (rule) for (const owner of ownersIn(rule)) grants[Array.isArray(owner) ? owner.join('+') : owner] = grantsAt(snap, r, owner, { op, subdomain });
    const { maps, scope, publicRead } = mapsFor(snap, r);
    const d = judge(rule, { user, grants, holds: (ap, perms) => (ap == null ? false : holds(user, ap, perms)), isBlank }, {
      op: Array.isArray(op) ? op : op, keys, patch: parseJson(patch) || {}, split: isSplitType(r.type),
      row: op === 'create' ? parseJson(patch) || {} : r.data, maps, scope, publicRead,
    });
    return d.allow ? { ...d, write } : d;
  } catch (e) {
    return deny(`lookup failed: ${e.message}`);
  }
}

// ---- the guards: one per transport --------------------------------------------------------------

/** The subject, for a refusal's message: `source 12`, `view 7`, `pattern app/3`, `page 1234`. */
const subjectLabel = ({ row, env, sourceId, viewId, patternId, app }) =>
  sourceId !== undefined ? `source ${sourceId}` : viewId !== undefined ? `view ${viewId}`
    : patternId != null ? `pattern ${app}/${patternId}` : env !== undefined ? `env ${env}`
    : `${getKind((row && row.type) || '') || 'row'} ${(row && row.id) ?? 'new'}`;

/** What a refusal is filed under. */
function reportCtx({ row, env, sourceId, viewId, patternId, app, verb, user }, subjectRow) {
  const kind = subjectRow ? subjectRow.kind : (sourceId !== undefined ? 'source' : viewId !== undefined ? 'view' : patternId != null ? 'pattern' : env !== undefined ? 'dmsenv' : 'row');
  const id = (row && row.id) ?? sourceId ?? viewId ?? patternId ?? (env !== undefined ? env : 'new');
  const op = Array.isArray(verb) ? verb.join(' or ') : verb;
  return {
    guard: op === 'read' ? 'read' : 'data',
    kind: `${op} ${kind}`,
    target: env !== undefined ? (sourceId !== undefined || viewId !== undefined ? `${env}/${id}` : env) : patternId != null ? `${app}/${patternId}` : `${id} ${(row && row.type) || ''}`.trim(),
    perms: STRUCTURAL.includes(op) ? [] : [].concat(verb),
    user, app: app || (row && row.app) || (isDmsEnv(env) ? env.split('+')[0] : '') || '',
  };
}

/**
 * The DMS write guard: judges `op` on `row` and returns the data to write — or `NO_CHANGE` when a
 * save of a stored row changes nothing (`skipNoChange`), which is then never judged. Throws on a
 * refusal under `enforce`: 403 for a signed-in user, 401 for an anonymous one (REST callers read
 * `status`). `router` is the Falcor route's `this` or `{ user, subdomain }`.
 */
async function assertDataWrite(router, op, app, row, patch, { replace = false, skipNoChange = false, mode } = {}) {
  const user = (router && router.user) || null;
  const subdomain = (router && router.subdomain) || '';
  if (skipNoChange && op === 'edit' && parseJson(row && row.data) && planEdit(row, patch, { replace }).keys.length === 0) return NO_CHANGE;
  const d = await authorize({ row, verb: op, patch, replace, user, app, subdomain, fresh: true });
  if (applyMode(d, { ...reportCtx({ row, app, verb: op, user }, { kind: getKind(row.type || '') }), mode })) {
    return d.write !== undefined ? d.write : patch;
  }
  const e = new Error(user ? `Not authorized: ${d.reason}` : 'Sign in to do this');
  e.status = user ? 403 : 401;
  throw e;
}

/**
 * Express: `subject` names what is asked (`{ source | view | env | pattern | row, verb, env, app }`) and
 * the response is answered on a refusal (401 / 403). Returns the user, or null when refused. A
 * route that was open to anyone passes `open: true`: an anonymous caller is then judged by
 * `requireUserOrOpen` (allowed and logged under `log`, refused under `enforce`). `env: true` with no
 * source or view asks the verb of the env itself (`create-source` on `:pgEnv`).
 */
async function requireCan(req, res, { source, view, pattern, row, verb, fields, env, app, open = false, mode } = {}) {
  const user = open ? requireUserOrOpen(req, res) : requireUser(req, res);
  if (!user || user === ANON_CALLER) return user;
  const site = app || requestApp(req) || null;
  const pgEnv = env === true ? (req.params.pgEnv || req.params.env) : env || req.params.pgEnv || req.params.env;
  const address = row ? { row, app: site }
    : source !== undefined ? { env: pgEnv, sourceId: +source, app: site }
    : view !== undefined ? { env: pgEnv, viewId: +view, app: site }
    : pattern ? { app: pattern.app || site, patternId: pattern.patternId ?? pattern.id }
    : pgEnv !== undefined ? { env: pgEnv, app: site }
    : null;
  if (!address) {
    res.status(403).json({ error: `requires ${[].concat(verb).join(' or ')}: nothing to judge it on` });
    return null;
  }
  const d = await authorize({ ...address, verb, fields, user, subdomain: req.headers ? getSubdomain(req) : '' });
  if (applyMode(d, { ...reportCtx({ ...address, verb, user }), mode })) return user;
  res.status(403).json({ error: `Not authorized: ${d.reason} on ${subjectLabel(address)}` });
  return null;
}

/** Falcor: throws on a refusal. `router` is the route's `this` (user, subdomain, requestApp). */
async function assertCan(router, { env, source, view, pattern, row, verb, fields, app, mode } = {}) {
  const user = requireFalcorUser(router);
  const subdomain = (router && router.subdomain) || '';
  const site = app || (router && router.requestApp) || null;
  const address = row ? { row, app: site }
    : source !== undefined ? { env, sourceId: +source, app: site }
    : view !== undefined ? { env, viewId: +view, app: site }
    : pattern ? { app: pattern.app || site, patternId: pattern.patternId ?? pattern.id }
    : env !== undefined ? { env, app: site }
    : null;
  if (!address) throw new Error(`Not authorized: needs ${[].concat(verb).join(' or ')}: nothing to judge it on`);
  const d = await authorize({ ...address, verb, fields, user, subdomain });
  if (applyMode(d, { ...reportCtx({ ...address, verb, user }), mode })) return user;
  throw new Error(`Not authorized: ${d.reason} on ${subjectLabel(address)}`);
}

/** Site-level `perms` for `user` on `app` (`<app> Admin` always). */
async function siteCan(app, user, perms, subdomain = '') {
  if (isAppAdmin(user, app)) return true;
  const snap = await appSnapshot(app);
  return holds(user, grantsAt(snap, snap.site, 'site', { subdomain }), perms);
}

/** The `:dmsenv` row an env address names (see owners.js `snapshotFor`), or null. */
async function envRowFor(env, app) {
  const { row, error } = await owners.snapshotFor({ env, app, fresh: true });
  return error ? null : row;
}

/** A content pattern row of `app` by id or instance name (never the site's admin / auth rows), or null. */
async function patternRow(app, { id, instance } = {}) {
  const snap = await appSnapshot(app, { fresh: true });
  return snap.rows.find(r => r.kind === 'pattern'
    && (id != null ? String(r.id) === String(id) : true)
    && (instance ? r.instance === instance : true)
    && !['admin', 'auth'].includes(r.data.pattern_type)) || null;
}

/** May `user` read this source / view? The mode applied; a refused read under `log` is logged once per ten minutes. */
async function canRead({ env, sourceId, viewId, row, user, app, subdomain = '', mode, kind }) {
  const d = await authorize({ env, sourceId, viewId, row, verb: 'read', user, app, subdomain });
  const ctx = reportCtx({ env, sourceId, viewId, row, app, verb: 'read', user });
  return applyMode(d, { ...ctx, kind: kind ? `read ${kind}` : ctx.kind, mode, dedupe: true });
}

/** The ids of `sourceIds` the user may read, in order (all of them under `log`). */
async function readableSources({ env, sourceIds, user, app, subdomain = '', kind = 'list' }) {
  const out = [];
  for (const id of sourceIds) if (await canRead({ env, sourceId: id, user, app, subdomain, kind })) out.push(id);
  return out;
}

module.exports = {
  authorize, planEdit, applyMode, refuse, assertDataWrite, requireCan, assertCan, canRead, readableSources,
  siteCan, patternRow, envRowFor, sourceOfView, clearSnapshots,
  authMode, NO_CHANGE, isAppAdmin, holds, hasGrants, resolveAuthPermissions,
};
