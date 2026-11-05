'use strict';
/**
 * WHAT A SOURCE ROW CARRIES FOR THIS READER — reply shaping, not authorization.
 *
 * It lived in the auth folder until 2026-11-03 because that is where it was written. Nothing here
 * decides whether a read is allowed; by the time any of it runs the read has already been allowed.
 * It decides which COLUMNS of an allowed reply this caller may see, for two DAMA columns
 * specifically — `statistics` and `auth_permissions` — which makes it UDA's business and no one
 * else's.
 *
 * It still ASKS auth a question (`holdsOnSource`), which is the right direction: a route asks
 * whether the caller holds a permission, then shapes what it sends back.
 */
const { authorize, authMode } = require('../auth');
const { parseJson } = require('../auth/grants');

/** Who may see the full grant list, and who may see secrets in `statistics`. */
const GRANT_EDITORS = ['edit-source-permissions', 'update-source'];
const SECRET_EDITORS = ['update-source'];
// The name a trimmed grant list carries for the entries it leaves out: a group nobody is in, so the
// client's lenient rule doesn't read a trimmed list as "no grants set".
const HIDDEN_ENTRY = '(hidden)';
const SECRET_KEY = /(^|_)(secret|token)$/i;

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
async function redactSourceRow({ env, sourceId, row, user, subdomain = '', app = null }) {
    const mode = authMode();
    const site = app || null;
    if (!row) return row;
    if (row.statistics != null && !(await authorize({ env, sourceId, verb: SECRET_EDITORS, user, subdomain, app: site })).allow) {
        row.statistics = dropSecrets(row.statistics);
    }
    if (mode === 'enforce' && row.auth_permissions != null
        && !(await authorize({ env, sourceId, verb: GRANT_EDITORS, user, subdomain, app: site })).allow) {
        row.auth_permissions = trimGrants(row.auth_permissions, user);
    }
    return row;
}

module.exports = { redactSourceRow, trimGrants, dropSecrets, HIDDEN_ENTRY };
