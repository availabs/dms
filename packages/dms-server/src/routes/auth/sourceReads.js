'use strict';
/**
 * THE DATASETS READ SURFACE — mode, snapshot, logging and redaction, for BOTH implementations.
 *
 * This is the layer around a decision, not the decision. It lived in `kindAuth/readAuth.js` until
 * 2026-11-03 because that is where it was written, and every UDA and DAMA read route therefore
 * imported the implementation BY NAME to reach it — which is how a route ends up coupled to one.
 *
 * What is here decides nothing:
 *
 *   - the MODE (`DMS_AUTH_MODE`) and the `logOnly` exemption
 *   - the per-env grant SNAPSHOT, and the app locator that finds an external env's `:dmsenv` row
 *   - the would-deny / refused LOG line, deduped, and the access-log record
 *   - REDACTION: dropping `*_secret` keys and trimming `auth_permissions` to the caller's own
 *
 * What the implementation supplies is one narrow object, `kindAuth/readAuth.js`'s `sourceDecision`:
 *
 *     reads(s, user, app, reqPermissions)                 → { allow, reason }
 *     holds(s, user, app, reqPermissions, check)          → { allow, reason }
 *
 * `s` is the snapshot entry (`{ ap, view, maps }`), so the decision gets the source's own grants
 * already expanded and the vocabulary they were expanded with, and needs no database access.
 * `check` selects between the strict and lenient rules.
 *
 * ROUTES IMPORT THIS, never `kindAuth/`. That is criterion 5 of
 * planning/tasks/current/row-auth-uda-unify-api.md. The indirection outlived the second
 * implementation it was built for (2026-11-04) because the separation it draws — rollout and
 * logging out here, the rule in there — is worth keeping on its own.
 */
const { isUserAuthed, isUserAuthedOpen } = require('./auth');
const { isAppAdmin } = require('./kindAuth/sourceAuth');
const { snapshot, clearReadSnapshots, parseJson } = require('./sourceSnapshot');
const { authMode: readMode } = require('./settings');
const { authMode } = require('./settings');
const accessLog = require('../../access-log');

/** Resolved per call, to keep this module loadable from inside the implementation. */
const decision = () => require('./kindAuth/readAuth').sourceDecision;

// The default for a caller that names no permission.
//
// ⚠ IT IS A HAND-MAINTAINED RESTATEMENT of what each verb's `implies` already declares, needed
// because `isUserAuthed` matches by NAME and cannot expand anything — and it is wrong in a known
// way: `download-source`, `manage-downloads` and `view-source-api` confer no row access
// (`implies: []` in dmsEnv.format.js), yet appear here, so a download grant still opens the
// source's metadata. Do not add to it; the fix is to ask the vocabulary, not to extend the list.
const READ_PERMISSIONS = [
    'view-source', 'download-source', 'update-source', 'edit-source-data', 'create-view',
    'manage-downloads', 'view-source-api', 'delete-source', 'edit-source-permissions',
];
const LOG_DEDUPE_MS = 10 * 60 * 1000;

/**
 * THE APP, AS A LOCATOR ONLY.
 *
 * An EXTERNAL env's sources expand their grants against the vocabulary its `:dmsenv` row declares
 * (`sourceSnapshot.loadExternal`), and per-app split mode puts that row in an app-scoped table — so
 * finding it needs an app name. It selects a table and confers nothing; the grants still come from
 * the source alone. See `./sourceAncestry.js`.
 *
 * A caller with NEITHER an app nor a named pattern resolves no vocabulary, so named verbs are
 * checked by name and nothing widens. Today that is only the tile routes, which are `logOnly` and
 * never enforce (`dama/tiles/tiles.rest.js`). Give them an app when they gain identity.
 *
 * It is also the app an EXTERNAL source's `${app} Admin` check runs against: a pgEnv is added to a
 * site only by a sysadmin's config change, so that site's admins may read its sources (owner
 * 2026-11-03). `app` here is the requesting site (`dms_app`, requestUser.js `requestApp`); a NAMED
 * pattern wins over it, because it is the more specific thing the caller pointed at.
 */
const appFor = (app, patternRef) => (patternRef && patternRef.app) || app || null;

/**
 * MAY `user` READ THIS SOURCE? The part both implementations share, then the one they do not.
 *
 * Owner's rule (2026-10-30): **when a source states nothing at all — no `auth` column, no `data`
 * auth attributes — read is true and edit is false.** Grants otherwise work exactly as before; this
 * is a rule about the ABSENCE of grants, not a replacement for them.
 *
 * A source is narrowed only by something ON THE SOURCE:
 *   `auth: { view: false }`  → its own grantees only
 *   its own grants           → they decide
 *
 * Nothing lends to a source any more (2026-11-03), internal or external, so there is no pattern
 * level here at all.
 */
function decideRead(snap, sourceId, user, namedApp = null, reqPermissions = READ_PERMISSIONS) {
    const s = snap.sources.get(+sourceId);
    if (!s) return { allow: false, reason: 'source not found' };
    const external = snap.app == null;
    const app = external ? namedApp : snap.app;
    if (app && isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };

    const own = s.ap || {};
    const stated = Object.keys(own.groups || {}).length > 0 || Object.keys(own.users || {}).length > 0;
    if (!stated && s.view !== false) return { allow: true, reason: 'nothing stated — read is the default' };
    // `view: false` with nothing of its own means NO ONE, not everyone: the lenient "nothing set →
    // open" rule must not swallow an explicit narrowing.
    if (!stated) return { allow: false, reason: 'view: false' };

    return decision().reads(s, user, app, reqPermissions);
}

/**
 * Whether `user` holds one of `reqPermissions` on the source — the named-permission question, as
 * opposed to "may they read it". `named`: the request's datasets pattern, kept for the APP it names
 * (a locator for an external env's row) and for nothing else.
 */
function decideFrom(snap, sourceId, user, reqPermissions = READ_PERMISSIONS, namedApp = null, check = isUserAuthed) {
    const s = snap.sources.get(+sourceId);
    if (!s) return { allow: false, reason: 'source not found' };
    const external = snap.app == null;
    const app = external ? namedApp : snap.app;
    if (isAppAdmin(user, app)) return { allow: true, reason: `${app} Admin` };
    return decision().holds(s, user, app, reqPermissions, check);
}

const logged = new Map();
// `outcome`: would-deny (log) / refused (enforce). Every call counts in the access log; the console line is
// deduped (LOG_DEDUPE_MS).
function logWouldDeny(kind, env, sourceId, user, reason, outcome = 'would-deny', patternRef = null, app = null) {
    // An EXTERNAL env belongs to no app, so the row is filed under the site that asked (`dms_app`).
    accessLog.record({ app: accessLog.appOf(env, patternRef) || app || '', guard: 'read', outcome, kind, target: `${env}/${sourceId}`,
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
 * Whether `user` may read `sourceId` on `env`, under the mode: `log` always (logging a would-deny),
 * `enforce` as decided. A failed grant lookup denies under `enforce` and logs under `log`.
 */
async function allowSourceRead({ env, sourceId, user, subdomain = '', patternRef = null, kind = 'source', logOnly = false, app = null }) {
    const mode = readMode({ logOnly });
    let d;
    try {
        const snap = await snapshot(env, subdomain, { app: appFor(app, patternRef) });
        d = decideRead(snap, sourceId, user, appFor(app, patternRef));
    }
    catch (e) { d = { allow: false, reason: `grant lookup failed: ${e.message}` }; }
    if (d.allow) return true;
    if (mode === 'log') { logWouldDeny(kind, env, sourceId, user, d.reason, 'would-deny', patternRef, app); return true; }
    logWouldDeny(kind, env, sourceId, user, d.reason, 'refused', patternRef, app);
    return false;
}

/** The source a view belongs to (null when not found, after one refresh of the snapshot). */
async function sourceOfView(env, viewId, subdomain = '', app = null) {
    let snap = await snapshot(env, subdomain, { app });
    if (!snap.viewSource.has(+viewId)) snap = await snapshot(env, subdomain, { fresh: true, app });
    return snap.viewSource.get(+viewId) ?? null;
}

/** allowSourceRead for the source a view belongs to. An unknown view denies under `enforce`. */
async function allowViewRead({ env, viewId, user, subdomain = '', patternRef = null, kind = 'view', logOnly = false, app = null }) {
    const mode = readMode({ logOnly });
    let sourceId;
    try { sourceId = await sourceOfView(env, viewId, subdomain, appFor(app, patternRef)); }
    catch (e) { sourceId = null; }
    if (sourceId == null) {
        if (mode === 'log') { logWouldDeny(kind, env, `view:${viewId}`, user, 'view not found', 'would-deny', patternRef, app); return true; }
        logWouldDeny(kind, env, `view:${viewId}`, user, 'view not found', 'refused', patternRef, app);
        return false;
    }
    return allowSourceRead({ env, sourceId, user, subdomain, patternRef, kind, logOnly, app });
}

/** The ids of `sourceIds` the user may read, in order (all of them unless `enforce`). */
async function filterReadableSources({ env, sourceIds, user, subdomain = '', patternRef = null, kind = 'list', app = null }) {
    const out = [];
    for (const id of sourceIds) {
        if (await allowSourceRead({ env, sourceId: id, user, subdomain, patternRef, kind, app })) out.push(id);
    }
    return out;
}

/**
 * Whether `user` holds one of `perms` on the source itself, for what a reply carries (the full grants, the
 * secrets). These are edit verbs, so on a source with no grants the blank-row rule refuses them; it applies
 * only once the write guard (DMS_AUTH_MODE) enforces, so `log` keeps showing an editor what it did.
 */
async function holdsOnSource({ env, sourceId, user, subdomain = '', patternRef = null, perms, app = null }) {
    const check = authMode() === 'enforce' ? isUserAuthed : isUserAuthedOpen;
    try {
        const snap = await snapshot(env, subdomain, { app: appFor(app, patternRef) });
        return decideFrom(snap, sourceId, user, perms, appFor(app, patternRef), check).allow;
    }
    catch { return false; }
}

module.exports = {
    READ_PERMISSIONS,
    readMode, allowSourceRead, allowViewRead, filterReadableSources, holdsOnSource,
    clearReadSnapshots,
};
