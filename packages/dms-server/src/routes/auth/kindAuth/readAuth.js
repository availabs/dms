'use strict';

/**
 * Who may read a source — KIND AUTH's decision (planning/tasks/current/permissions-ds-read-visibility.md,
 * owner 2026-10-26).
 *
 * The rule is the write path's (sourceAuth.js decideSource): pattern ⊕ source grants, the lenient rule (no
 * permission set → open), `${app} Admin` passes. Reading needs `view-source` or any source permission that
 * implies it (READ_PERMISSIONS). Internal sources are judged with the datasets patterns that list them (none
 * ⇒ deny, as for writes). External sources: the datasets pattern the request names (`dms_pattern`, sent by
 * the datasets pattern's Falcor model: sourceAuth.js requestPatternRef) lends its grants, accepted as writes
 * accept it (an existing datasets pattern: readNamedPattern); no pattern named → the source's own grants only.
 * PLACEHOLDER (owner, 2026-10-26): the client picks the pattern, so a caller can name whichever datasets
 * pattern grants the most. Better than no inheritance, not a boundary; see the read-visibility task, "Open".
 *
 * Rollout (`DMS_READ_AUTH_MODE`, apart from the write modes):
 *   - `legacy`  — nothing is checked or hidden.
 *   - `log`     — (default) nothing is refused; every read `enforce` would refuse is logged once per
 *                 user / source / kind for ten minutes (`[read-auth] would-deny …`), so a site's public
 *                 pages that would go blank show up before anyone enforces. Secret keys in `statistics`
 *                 are already dropped for non-editors (nothing reads them).
 *   - `enforce` — refused reads return nothing, catalog lists hold only readable sources, and
 *                 `auth_permissions` is trimmed to the caller's own entries for non-editors.
 *
 * WHAT IS NOT HERE ANY MORE. The snapshot every decision reads from is `../sourceSnapshot.js`, shared
 * with row auth — `decideFrom` and `allowViewRead` below hand that same object to
 * `rowSourceAuth.decideFromRow` / `readsRow` under `DMS_UDA_GATE=row`, so it was never kind auth's to
 * own. This file is now decisions only.
 */
const {
    mergeAuthPermissions, isUserAuthed, isUserAuthedOpen, isAppAdmin, authMode,
} = require('./sourceAuth');
const {
    snapshot, namedPattern, clearReadSnapshots, parseJson,
} = require('../sourceSnapshot');
const accessLog = require('../../../access-log');


// KIND AUTH ONLY. The row gate does not use this: it asks the one structural question (`read`),
// which every verb that should confer a read already declares in its `implies`
// (rowSourceAuth.readsRow, Phase 4(a) of permission-domain-single-source.md). This list is a
// hand-maintained restatement of the same thing for `isUserAuthed`, which matches by NAME and
// cannot expand anything — and it is wrong in exactly the way that motivated the change:
// `download-source`, `manage-downloads` and `view-source-api` confer no row access, yet appear
// here, so under kind auth a download grant still opens the source's metadata. It dies with kind
// auth; do not add to it.
const READ_PERMISSIONS = [
    'view-source', 'download-source', 'update-source', 'edit-source-data', 'create-view',
    'manage-downloads', 'view-source-api', 'delete-source', 'edit-source-permissions',
];
const GRANT_EDITORS = ['edit-source-permissions', 'update-source'];
const SECRET_EDITORS = ['update-source'];
const LOG_DEDUPE_MS = 10 * 60 * 1000;
// The name a trimmed grant list carries for the entries it leaves out: a group nobody is in, so the
// client's lenient rule doesn't read a trimmed list as "no grants set".
const HIDDEN_ENTRY = '(hidden)';
const SECRET_KEY = /(^|_)(secret|token)$/i;

function readMode({ logOnly = false } = {}) {
    const m = String(process.env.DMS_READ_AUTH_MODE || 'log').toLowerCase();
    const mode = ['legacy', 'log', 'enforce'].includes(m) ? m : 'log';
    // `logOnly`: a read path exempt from `enforce` (tiles), which still logs would-denies.
    return logOnly && mode === 'enforce' ? 'log' : mode;
}
// ---- Decisions ------------------------------------------------------------------------------------------

// `named`: the request's datasets pattern ({ app, ap }), used for external sources only (internal sources
// find their own patterns), as sourceAuth.js decideSource does.
// `check`: the rule (isUserAuthed; holdsOnSource passes the old open rule outside `enforce`).
function decideFrom(snap, sourceId, user, reqPermissions = READ_PERMISSIONS, named = null, check = isUserAuthed) {
    // ROW auth (../rowAuth/rowSourceAuth), behind DMS_UDA_GATE. Kind auth below is untouched and
    // stays live by default; task 7 is what deletes it. See planning/tasks/current/row-auth-uda.md.
    // `check` is NOT passed on: it selects between kind auth's strict and lenient rules, and the
    // row judge has neither — it asks the one structural `read` question (rowSourceAuth.readsRow).
    if (require('../rowAuth/rowSourceAuth').udaGate() === 'row') {
        return require('../rowAuth/rowSourceAuth').decideFromRow(snap, sourceId, user, reqPermissions, named);
    }
    const s = snap.sources.get(+sourceId);
    if (!s) return { allow: false, reason: 'source not found' };
    if (s.orphan) return { allow: false, reason: `source ${sourceId} is in no datasets pattern of ${snap.app}` };
    const external = snap.app == null;
    const app = external ? (named && named.app) : snap.app;
    const patternAP = external ? ((named && named.ap) || {}) : s.patternAP;
    if (isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };
    const allow = check({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, s.ap) });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions[0]}` };
}

/**
 * MAY `user` READ THIS SOURCE?
 *
 * Owner's rule (2026-10-30): **when a source states nothing at all — no `auth` column, no `data`
 * auth attributes — read is true and edit is false.** Grants otherwise work exactly as before; this
 * is a rule about the ABSENCE of grants, not a replacement for them. DAMA scopes an upload to its
 * creator with real grants on the source, and those keep working: a stated source is judged as it
 * always was, so creator-only stays creator-only and `groups: { public: [] }` still revokes.
 *
 * What changed is that a datasets PATTERN's grants can no longer DENY a read, only lend one. A
 * pattern granting `public: ['view-page']` used to gate every source beneath it, and because the
 * named verb was never expanded into the structural `read`, a grant written to open a source to the
 * public silently closed it — while `*` holders saw nothing wrong. `view-page` was never meant to be
 * the verb that opens a source.
 *
 * A source is narrowed only by something ON THE SOURCE:
 *   `auth: { view: false }`  → its own grantees only; no pattern may lend past it
 *   its own grants           → they decide, with the pattern still free to lend
 *
 * Internal and external sources alike. WRITES are untouched and still resolve the whole chain.
 */
function decideRead(snap, sourceId, user, named = null, reqPermissions = READ_PERMISSIONS) {
    const s = snap.sources.get(+sourceId);
    if (!s) return { allow: false, reason: 'source not found' };
    const external = snap.app == null;
    const app = external ? (named && named.app) : snap.app;
    if (app && isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };

    const own = s.ap || {};
    const stated = Object.keys(own.groups || {}).length > 0 || Object.keys(own.users || {}).length > 0;

    if (!stated && s.view !== false) {
        return { allow: true, reason: 'nothing stated — read is the default' };
    }
    // `view: false` with nothing of its own means NO ONE, not everyone: the lenient "nothing set →
    // open" rule must not swallow an explicit narrowing.
    if (!stated) return { allow: false, reason: 'view: false' };

    // Stated: judged as always. `view: false` additionally refuses the pattern's lending.
    const patternAP = s.view === false ? {} : (external ? ((named && named.ap) || {}) : s.patternAP);
    // ROW gate: ONE structural question. Reading is what the verbs' `implies` already say it is,
    // so there is no list to keep in step — see rowSourceAuth.readsRow.
    if (require('../rowAuth/rowSourceAuth').udaGate() === 'row') {
        const v = require('../rowAuth/rowSourceAuth').readsRow(patternAP, own, user, app);
        return { allow: v.allow, reason: v.allow ? 'granted' : 'missing read' };
    }
    const allow = isUserAuthed({ user, reqPermissions, authPermissions: mergeAuthPermissions(patternAP, own) });
    return { allow, reason: allow ? 'granted' : `missing ${reqPermissions[0]}` };
}

const logged = new Map();
// `outcome`: would-deny (log) / refused (enforce). Every call counts in the access log; the console line is
// deduped (LOG_DEDUPE_MS).
function logWouldDeny(kind, env, sourceId, user, reason, outcome = 'would-deny', patternRef = null) {
    accessLog.record({ app: accessLog.appOf(env, patternRef), guard: 'read', outcome, kind, target: `${env}/${sourceId}`,
        perms: ['view-source'], user, reason });
    if (outcome !== 'would-deny') return;
    const who = (user && (user.id ?? user.email)) ?? 'anon';
    const key = `${kind}|${env}|${sourceId}|${who}`;
    const now = Date.now();
    if (now - (logged.get(key) || 0) < LOG_DEDUPE_MS) return;
    logged.set(key, now);
    if (logged.size > 50000) logged.clear();
    console.warn(`[read-auth] would-deny ${kind} ${env}/${sourceId} user=${who} ` +
        `groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}

/**
 * Whether `user` may read `sourceId` on `env`, under the mode: `legacy` always, `log` always (logging a
 * would-deny), `enforce` as decided. A failed grant lookup denies under `enforce` and logs under `log`.
 */
async function allowSourceRead({ env, sourceId, user, subdomain = '', patternRef = null, kind = 'source', logOnly = false }) {
    const mode = readMode({ logOnly });
    if (mode === 'legacy') return true;
    let d;
    try { d = decideRead(await snapshot(env, subdomain), sourceId, user, await namedPattern(patternRef, subdomain)); }
    catch (e) { d = { allow: false, reason: `grant lookup failed: ${e.message}` }; }
    if (d.allow) return true;
    if (mode === 'log') { logWouldDeny(kind, env, sourceId, user, d.reason, 'would-deny', patternRef); return true; }
    logWouldDeny(kind, env, sourceId, user, d.reason, 'refused', patternRef);
    return false;
}

/** The source a view belongs to (null when not found, after one refresh of the snapshot). */
async function sourceOfView(env, viewId, subdomain = '') {
    let snap = await snapshot(env, subdomain);
    if (!snap.viewSource.has(+viewId)) snap = await snapshot(env, subdomain, { fresh: true });
    return snap.viewSource.get(+viewId) ?? null;
}

/** allowSourceRead for the source a view belongs to. An unknown view denies under `enforce`. */
async function allowViewRead({ env, viewId, user, subdomain = '', patternRef = null, kind = 'view', logOnly = false }) {
    const mode = readMode({ logOnly });
    if (mode === 'legacy') return true;
    let sourceId;
    try { sourceId = await sourceOfView(env, viewId, subdomain); }
    catch (e) { sourceId = null; }
    if (sourceId == null) {
        if (mode === 'log') { logWouldDeny(kind, env, `view:${viewId}`, user, 'view not found', 'would-deny', patternRef); return true; }
        logWouldDeny(kind, env, `view:${viewId}`, user, 'view not found', 'refused', patternRef);
        return false;
    }
    return allowSourceRead({ env, sourceId, user, subdomain, patternRef, kind, logOnly });
}

/** The ids of `sourceIds` the user may read, in order (all of them unless `enforce`). */
async function filterReadableSources({ env, sourceIds, user, subdomain = '', patternRef = null, kind = 'list' }) {
    const mode = readMode();
    if (mode === 'legacy') return sourceIds;
    const out = [];
    for (const id of sourceIds) {
        if (await allowSourceRead({ env, sourceId: id, user, subdomain, patternRef, kind })) out.push(id);
    }
    return out;
}

/**
 * Whether `user` holds one of `perms` on the source itself, for what a reply carries (the full grants, the
 * secrets). These are edit verbs, so on a source with no grants the blank-row rule refuses them; it applies
 * only once the write guard (DMS_SOURCE_AUTH_MODE) enforces, so `log` keeps showing an editor what it did.
 */
async function holdsOnSource({ env, sourceId, user, subdomain = '', patternRef = null, perms }) {
    const check = authMode() === 'enforce' ? isUserAuthed : isUserAuthedOpen;
    try { return decideFrom(await snapshot(env, subdomain), sourceId, user, perms, await namedPattern(patternRef, subdomain), check).allow; }
    catch { return false; }
}

// ---- What a source row carries ------------------------------------------------------------------------

/** `auth_permissions` with only the entries naming the user or their groups, plus HIDDEN_ENTRY when any were left out. */
function trimGrants(raw, user) {
    const ap = parseJson(raw);
    if (!ap || typeof ap !== 'object') return raw;
    const mine = (map, keys) => Object.fromEntries(Object.entries(map || {}).filter(([k]) => keys.includes(String(k))));
    const groups = mine(ap.groups, [...((user && user.groups) || []), 'public']);
    const users = mine(ap.users, user && user.id != null ? [String(user.id)] : []);
    const hidden = Object.keys(ap.groups || {}).length + Object.keys(ap.users || {}).length
        > Object.keys(groups).length + Object.keys(users).length;
    const out = { groups: hidden ? { ...groups, [HIDDEN_ENTRY]: [] } : groups, users };
    return typeof raw === 'string' ? JSON.stringify(out) : out;
}

/** `statistics` without keys that hold secrets (`webhook_secret`, `*_token`), at any depth. */
function dropSecrets(raw) {
    const stats = parseJson(raw);
    if (!stats || typeof stats !== 'object') return raw;
    const strip = (o) => Array.isArray(o) ? o.map(strip)
        : o && typeof o === 'object'
            ? Object.fromEntries(Object.entries(o).filter(([k]) => !SECRET_KEY.test(k)).map(([k, v]) => [k, strip(v)]))
            : o;
    const out = strip(stats);
    return typeof raw === 'string' ? JSON.stringify(out) : out;
}

/**
 * A source row's attributes as this reader may see them: secrets dropped for non-updaters (`log` and
 * `enforce`), grants trimmed for non-editors (`enforce`). Mutates and returns `row`.
 */
async function redactSourceRow({ env, sourceId, row, user, subdomain = '', patternRef = null }) {
    const mode = readMode();
    if (mode === 'legacy' || !row) return row;
    if (row.statistics != null && !(await holdsOnSource({ env, sourceId, user, subdomain, patternRef, perms: SECRET_EDITORS }))) {
        row.statistics = dropSecrets(row.statistics);
    }
    if (mode === 'enforce' && row.auth_permissions != null
        && !(await holdsOnSource({ env, sourceId, user, subdomain, patternRef, perms: GRANT_EDITORS }))) {
        row.auth_permissions = trimGrants(row.auth_permissions, user);
    }
    return row;
}

module.exports = {
    READ_PERMISSIONS, HIDDEN_ENTRY,
    readMode, allowSourceRead, allowViewRead, filterReadableSources, sourceOfView, holdsOnSource,
    redactSourceRow, trimGrants, dropSecrets, clearReadSnapshots,
};
