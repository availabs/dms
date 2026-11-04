'use strict';

/**
 * Permission checks on the `dms.data.*` writes (defects B/E in
 * planning/tasks/current/auth-permission-chain-and-unguarded-writes.md, "B/E design").
 *
 * Each write is judged by the kind of row it touches (`getKind(type)`) and, for edits, by the keys it
 * changes. `${app} Admin` passes everything. The permission per kind:
 *   - site / theme / tenant   — site-level grants (the admin row's, falling back to the auth pattern's)
 *   - pattern                 — the pattern's own grants, as the admin UI's `patternCan`
 *   - page / component        — pattern ⊕ page grants, as the read gate in dms.route.js
 *   - dmsenv / source / view / data — the datasets permissions (uda/sourceAuth.js)
 *   - anything else           — a signed-in user
 * Signed-in callers: routes/dms/auth.js isUserAuthed. A row with no grants (nothing beyond `public`, none
 * inherited) is read-only, so an edit on it needs an explicit grant (owner 2026-10-29; it was "no permission
 * set → open" from 2026-10-23); the exceptions stay here: `${app} Admin`, the site `*` escapes, patternCan's
 * `view-pattern-list` clause. Anonymous callers pass only where the `public` group explicitly holds the
 * permission (owner, 2026-10-22). A refusal that only the blank-row rule makes says `blank row`.
 *
 * Rollout (`DMS_AUTH_MODE`):
 *   - `log`     — (default) allowed; every write the rule would refuse is logged
 *                 (`[data-auth] would-deny …`) so grants can be fixed before anything flips.
 *   - `enforce` — the rule decides; a refused write throws.
 * A failed lookup denies (fail closed).
 */
const { isEqual } = require('lodash');
const { getKind, getParent, getInstance, isSplitType } = require('#db/type-utils.js');
const { isUserAuthed, blankRowRefusal, resolveAuthPermissions } = require('../auth');
const {
    holdsExplicitly, isAppAdmin, unionAuthPermissions, internalSourceGrants,
} = require('./sourceAuth');
// A lookup, not a decision — the rules name an owner, they don't resolve one.
const { sourceIdForView } = require('../sourceGuards');
const AUTH_RULES = require('./authRules');
const { judge: judgeRules } = require('./authJudge');
const accessLog = require('../../../access-log');

// `DMS_AUTH_MODE` — the one mode, shared with every other surface and with row auth (../settings.js).
// It was `DMS_DATA_AUTH_MODE` until 2026-11-03.
const { authMode: dataAuthMode } = require('../settings');

const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
};

// Grants besides the `public` group (the Access editor seeds `public` into everything it saves).
// Mirrors the client's utils/auth.js hasAuthGrants.
const hasGrants = (ap) =>
    Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

// Row columns some clients copy into a whole-row save's data. The timestamps / authors are never
// judged and never written into data; `id` / `app` / `type` count as unchanged when they equal the
// stored data's value or the row's own column (the site editor echoes `type: 'prod:site'`).
const ECHO_ONLY = ['created_at', 'updated_at', 'created_by', 'updated_by'];
const ROW_KEYS = ['id', 'app', 'type'];

/**
 * How an edit is judged and what it writes. Editors often save whole rows (the site editor sends
 * `site_name` with a new `patterns` list; the pattern editor its unchanged `authPermissions`), so a
 * key equal to the stored value is not a change. It is also NOT WRITTEN: `write` holds only the
 * changed keys, each of which the guard judged. So a comparison that wrongly says "equal" (numbers
 * past double precision, say) can only drop a key from the write, never let a value through unjudged.
 *
 * `replace` (sync/push I onto an existing row: the whole data is replaced): a stored key the patch
 * leaves out is removed, so it is a change too; `write` is the full new data, with every key judged
 * unchanged taken from the stored row.
 *
 * Without the stored row (split rows) every key is a change and the patch is written as sent.
 * Returns { keys, write }.
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

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason });

// Signed in → isUserAuthed (no grants ⇒ edits need an explicit grant); anon → explicit grants only (`*` counts
// for all). `onBlank` hears of a refusal only the blank-row rule made (for the deny reason).
const holdsFor = (user, ap, perms, onBlank) => {
    const opts = { user, reqPermissions: [].concat(perms), authPermissions: ap || {} };
    if (!(user && user.authed)) return holdsExplicitly({ ...opts, user: {} });
    if (isUserAuthed(opts)) return true;
    if (onBlank && blankRowRefusal(opts)) onBlank();
    return false;
};

/**
 * One judge per write. `ctx`: { app, subdomain, user, controller }. Pattern rows of the app are read
 * once per judge (sites have a handful).
 */
function createJudge(ctx) {
    const { app, subdomain = '', user, controller } = ctx;
    // set when a refusal came from the blank-row rule alone (see decide)
    let blankRefusal = false;
    const holds = (u, ap, perms) => holdsFor(u, ap, perms, () => { blankRefusal = true; });
    let patternRows;
    const patterns = async () => {
        if (!patternRows) {
            patternRows = (await controller.getPatternRows(app)).map(r => ({
                id: r.id, type: r.type, data: parseJson(r.data) || {},
            }));
        }
        return patternRows;
    };

    // Site-level grants: the admin row's, falling back to the auth pattern's while it grants nothing
    // (as pattern2routes resolves AdminContext.authPermissions).
    async function siteGrants() {
        const rows = await patterns();
        const of = (pt) => unionAuthPermissions(rows
            .filter(r => r.data.pattern_type === pt)
            .map(r => resolveAuthPermissions(r.data.authPermissions, subdomain)));
        const admin = of('admin');
        return hasGrants(admin) ? admin : of('auth');
    }

    async function siteCan(perms) {
        return holds(user, await siteGrants(), [].concat(perms));
    }

    // Mirrors utils/adminPermissions.js patternCan: site `*` → all; a non-core pattern with no grants
    // is open to whoever may see the pattern list; otherwise the pattern's own grants.
    async function patternCan(pattern, perms) {
        if (await siteCan('*')) return true;
        const ap = resolveAuthPermissions(pattern && pattern.authPermissions, subdomain);
        const isCore = ['auth', 'admin'].includes(pattern && pattern.pattern_type);
        if (user && user.authed && !isCore && !hasGrants(ap)) return siteCan('view-pattern-list');
        return holds(user, ap, perms);
    }

    // THE VOCABULARY THAT GOVERNS A KIND, read from the row that declares it.
    //
    // Which attribute needs which verb is declared in the format that owns the attribute and
    // transported on a pattern row (`auth.vocabulary`). `getPatternRows` projects `id, type, data`
    // and not the auth COLUMN, which is where the migration puts it — so the rows are re-read here
    // through the auth projection, once per judge. Before 2026-11-03 these rules were a second copy
    // in `authRules.js` as `byKey` / `when` / `onlyKeys`; see unified-auth-api.md Phase 1.
    let containersP;
    const authContainers = () => (containersP || (containersP =
        (controller.authContainers ? controller.authContainers(app) : Promise.resolve([])).catch(() => [])));

    /**
     * The row whose declaration governs `kind`, and the SCOPE to read it in.
     *
     * A row that declares its own vocabulary is governed by `self`; one that inherited a
     * declaration from above is governed by `descendants`. Both halves matter: a pattern row's
     * vocabulary carries `edit-pattern` under `self` and `edit-page` under `descendants`, and
     * reading the wrong one offers a page editor the pattern's verb.
     *
     * `authContainers` is the auth-projected read of every row a type path can name as a parent —
     * the site, the patterns, the sources — which is where declarations live. `getPatternRows`
     * projects `id, type, data` and not the auth COLUMN, which is where the migration puts them.
     */
    async function vocabFor(kind, row) {
        const rows = await authContainers();
        const byId = new Map(rows.map(r => [String(r.id), r]));
        const siteRow = () => rows.find(r => getKind(r.type || '') === 'site') || null;
        const typed = (pt) => rows.find(r => getKind(r.type || '') === 'pattern'
            && (parseJson(r.data) || {}).pattern_type === pt) || null;
        switch (kind) {
            // declares its own
            case 'pattern': return { row: byId.get(String(row && row.id)) || null, scope: 'self' };
            case 'site':    return { row: byId.get(String(row && row.id)) || siteRow(), scope: 'self' };
            // inherits one
            case 'page': case 'component': case 'page-edit': {
                const p = await contentPattern(getParent(row.type || ''));
                return { row: p ? byId.get(String(p.id)) || null : null, scope: 'descendants' };
            }
            case 'source': case 'view': case 'data': case 'dmsenv':
                return { row: typed('datasets'), scope: 'descendants' };
            default: return { row: siteRow(), scope: 'descendants' };   // theme, tenant
        }
    }
    const mapsFor = async (kind, row) => {
        try {
            const { row: vrow, scope } = await vocabFor(kind, row);
            return { maps: impliesMaps(vocabularyOf(vrow || {})), scope };
        } catch { return { maps: null, scope: 'flat' }; }
    };

    // The content pattern with this instance name (skips admin/auth rows sharing it, as
    // getPatternAuthPermissions does).
    async function contentPattern(instance) {
        const rows = await patterns();
        return rows.find(r => getInstance(r.type) === instance && !['admin', 'auth'].includes(r.data.pattern_type)) || null;
    }

    async function datasetsGrants() {
        const rows = (await patterns()).filter(r => r.data.pattern_type === 'datasets');
        return unionAuthPermissions(rows.map(r => resolveAuthPermissions(r.data.authPermissions, subdomain)));
    }

    const internalEnv = (slug) => `${app}+${slug || 'internal'}`;

    // ---- THE JUDGE. Kind auth's rules are DATA, applied by `authJudge.js`, a pure interpreter.
    // Which rules: the ones stamped on the row from the formats, else the built-in copy
    // (`ruleFor` below). The owner lookups are the part the rules cannot express — which grants
    // govern a row of this kind (auth-as-data README).
    //
    // Until 2026-11-03 this sat behind `DMS_DATA_AUTH_JUDGE=data` beside a hand-written `switch`
    // over the eleven row kinds. The switch is gone (owner: "we don't want hand written rules").
    // The two were measured identical first — 53/53 on this side's contract suite plus 114 more
    // cases across upload, uda, source, reads, child-sweep and parent-stamp, with the same kinds
    // covered and the same `DEFAULT: signedIn` fallthrough.
    async function resolveOwner(name, op, row) {
        const type = row.type || '';
        const ownGrants = () => resolveAuthPermissions((parseJson(row.data) || {}).authPermissions, subdomain);
        const patternOf = async () => {
            const p = await contentPattern(getParent(type));
            return resolveAuthPermissions(p && p.data.authPermissions, subdomain);
        };
        switch (name) {
            case 'site-grants': return siteGrants();
            case 'datasets-grants': return datasetsGrants();
            case 'self-pattern': return ownGrants();
            case 'parent-pattern': return patternOf();
            case 'parent-pattern+row': {
                const p = await patternOf();
                const r = op === 'create' ? {} : ownGrants();
                return { groups: { ...(p.groups || {}), ...(r.groups || {}) }, users: { ...(p.users || {}), ...(r.users || {}) } };
            }
            case 'self-source': return internalSourceGrants(internalEnv(getInstance(type)), row.id, subdomain);
            case 'owning-source': {
                const env = internalEnv(getParent(type));
                return internalSourceGrants(env, await sourceIdForView(env, row.id), subdomain);
            }
            case 'source-by-slug': {
                const slug = getParent(type);
                return internalSourceGrants(internalEnv(slug), await controller.getSourceIdBySlug(app, slug), subdomain);
            }
        }
        return null;
    }

    // Every owner a kind's rule names: its default owner, plus any clause's own.
    function ownersIn(rule) {
        const out = new Set([rule.owner]);
        const walk = (n) => {
            if (n && typeof n === 'object') {
                if (typeof n.owner === 'string') out.add(n.owner);
                Object.values(n).forEach(walk);
            }
        };
        walk(rule);
        return [...out].filter(Boolean);
    }

    // ---- Which rule judges a kind: the one stamped on the row that carries it, else the built-in copy.
    // The client collects each format's `rules` at registration (patterns/deriveAuthRules.js) and stamps
    // them as `data.authRules`: site-level kinds on the site row, the others on their pattern row. Rows
    // created before that stamp carry none and use authRules.js (see its header). Never read from the row
    // being created: its data is the caller's.
    const SITE_KINDS = ['site', 'theme', 'tenant', 'pattern', 'dmsenv'];
    const PAGE_KINDS = ['page', 'component', 'page-edit'];
    const DATASETS_KINDS = ['source', 'view', 'data'];
    let siteRows;
    const sites = async () => {
        if (!siteRows) {
            siteRows = ((controller.getSiteRows && await controller.getSiteRows(app)) || [])
                .map(r => ({ id: r.id, type: r.type, data: parseJson(r.data) || {} }));
        }
        return siteRows;
    };
    const stampedIn = (rows, kind) => {
        const r = rows.find(x => x && x.data && x.data.authRules && typeof x.data.authRules === 'object'
            && x.data.authRules[kind]);
        return r ? r.data.authRules[kind] : null;
    };
    async function stampedRule(kind, type) {
        if (SITE_KINDS.includes(kind)) return stampedIn(await sites(), kind);
        if (PAGE_KINDS.includes(kind)) return stampedIn([await contentPattern(getParent(type))], kind);
        // sources and views hang off the ENV, not the datasets pattern (row-auth-uda-unify-api.md
        // Phase 1), so the site row carries their rules too; a datasets pattern row still has them
        // and is read first, for a site stamped before the env owned them.
        if (DATASETS_KINDS.includes(kind)) {
            return stampedIn((await patterns()).filter(r => r.data.pattern_type === 'datasets'), kind)
                || stampedIn(await sites(), kind);
        }
        return null;
    }
    async function ruleFor(kind, type) {
        const stamped = await stampedRule(kind, type);
        if (!stamped) return { rule: AUTH_RULES[kind], from: 'built-in' };
        // a stamped rule the interpreter can't use fails closed rather than falling back
        if (typeof stamped !== 'object' || !stamped.ops || typeof stamped.ops !== 'object') {
            throw new Error(`the stamped ${kind} rule has no ops`);
        }
        return { rule: stamped, from: 'stamped' };
    }

    async function judge(op, row, patch, keys) {
        const type = row.type || '';
        const kind = getKind(type);
        const { rule } = await ruleFor(kind, type);
        const grants = {};
        if (rule) {
            for (const name of ownersIn(rule)) grants[name] = await resolveOwner(name, op, row);
        }
        const { maps, scope } = await mapsFor(kind, row);
        return judgeRules(rule ? { ...AUTH_RULES, [kind]: rule } : AUTH_RULES, {
            user,
            isAppAdmin: false,  // checked by decide()
            grants,
            // an owner that couldn't be found holds nothing (fail closed, as a missing source does)
            holds: (ap, perms) => (ap == null ? false : holds(user, ap, perms)),
            isBlank: (ap) => ap != null && !hasGrants(ap),
        }, { kind, op, keys, patch: parseJson(patch) || {}, split: isSplitType(type), maps, scope,
            row: op === 'create' ? parseJson(patch) || {} : parseJson(row.data) || {} });
    }

    // Writing a row's stamped auth rules is an escalation: whoever rewrites them can grant themselves
    // anything they govern. So it is checked here, in code, never by a rule: site `*` on the site row;
    // on a pattern row, `edit-pattern-permissions` held on the pattern itself or site `*` (not the
    // open-pattern clause, which would hand it to anyone who may see the pattern list).
    async function rulesWrite(op, row, keys) {
        if (op !== 'edit' || !keys.includes('authRules')) return null;
        const kind = getKind(row.type || '');
        if (await siteCan('*')) return null;
        if (kind === 'pattern') {
            const ap = resolveAuthPermissions((parseJson(row.data) || {}).authPermissions, subdomain);
            return holds(user, ap, ['edit-pattern-permissions']) ? null
                : deny(`pattern ${row.id} authRules ${needs('edit-pattern-permissions')}`);
        }
        return deny(`${kind} authRules ${needs('*')}`);
    }

    // `keys`: the edit's changed keys (planEdit); computed here when the caller has none.
    const decide = async (op, row, patch, keys = op === 'edit' ? planEdit(row, patch).keys : []) => {
        if (isAppAdmin(user, app)) return allow(`${app} Admin`);
        try {
            blankRefusal = false;
            const fixed = await rulesWrite(op, row, keys);
            if (fixed) return fixed;
            const d = await judge(op, row, patch, keys);
            return !d.allow && blankRefusal && !/blank row/.test(d.reason)
                ? deny(`${d.reason}; blank row (no grants: edits need an explicit grant)`) : d;
        } catch (e) {
            return deny(`lookup failed: ${e.message}`);
        }
    };
    // for the pattern REST routes (dama/upload/auth.js requirePatternAction)
    decide.patterns = patterns;
    decide.siteCan = async (perms) => isAppAdmin(user, app) || siteCan(perms);
    decide.patternCan = async (pattern, perms) => isAppAdmin(user, app) || patternCan(pattern, perms);
    return decide;
}

// `outcome`: would-deny (log) / refused (enforce), for the access log.
function logWouldDeny(op, app, row, user, reason, outcome = 'would-deny') {
    accessLog.record({ app, guard: 'data', outcome, kind: `${op} ${getKind(row.type || '') || 'row'}`,
        target: `${row.id || 'new'} ${row.type || ''}`.trim(), perms: [], user, reason });
    if (outcome !== 'would-deny') return;
    console.warn(`[data-auth] would-deny ${op} ${app}/${row.id || 'new'} type=${row.type} ` +
        `user=${(user && (user.id ?? user.email)) ?? 'anon'} groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
}

/**
 * Throw unless `router.user` may do `op` on `row` (under `DMS_AUTH_MODE`). `row` must be the stored
 * row ({ id, app, type, data }) for edits / deletes (see the routes). `patch`: an edit's data;
 * `replace`: the write replaces the whole data (sync/push I onto an existing id).
 * Returns the data to write: for an edit judged against its stored row, only what planEdit judged
 * (see there); otherwise `patch` as given.
 * `skipNoChange`: an edit of a stored row that changes nothing returns NO_CHANGE, unjudged, and the caller
 * writes nothing (owner 2026-10-29: a save with no changes is not an update).
 */
const { NO_CHANGE } = require('../settings');
const { vocabularyOf, impliesMaps } = require('../authVocabulary');   // shared with row auth — see that file

async function assertDataWrite(router, controller, op, app, row, patch, { replace = false, skipNoChange = false } = {}) {
    const mode = dataAuthMode();
    const user = (router && router.user) || null;
    const plan = op === 'edit' ? planEdit(row, patch, { replace }) : { keys: [], write: patch };
    if (skipNoChange && op === 'edit' && parseJson(row && row.data) && plan.keys.length === 0) return NO_CHANGE;
    const d = await createJudge({ app, subdomain: (router && router.subdomain) || '', user, controller })(op, row, patch, plan.keys);
    if (d.allow) return plan.write;
    if (mode === 'log') { logWouldDeny(op, app, row, user, d.reason); return plan.write; }
    logWouldDeny(op, app, row, user, d.reason, 'refused');
    const e = new Error(user ? `Not authorized: ${d.reason}` : 'Sign in to do this');
    e.status = user ? 403 : 401; // for the REST callers (sync/push)
    throw e;
}

module.exports = { assertDataWrite, NO_CHANGE, dataAuthMode, createJudge, logWouldDeny, planEdit };
