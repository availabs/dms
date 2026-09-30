// Same as patterns/page/pages/_utils parseIfJSON; kept local so this module
// stays import-free (see resolveSubdomainAuthPermissions below).
function parseIfJSON(text, fallback = {}) {
    try {
        if (text && typeof text === 'object') return text;
        if (typeof text !== 'string' || !text) return fallback;
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

// Used by route building (render/spa/utils/index.js pattern2routes) and the
// admin panel's access checks (utils/adminPermissions.js). A raw
// `pattern.authPermissions` is either the "old" flat `{groups,users}` shape, or the "new" subdomain-keyed shape
// (PatternPermissionsEditor writes this: `{"<subdomain-or-*>": {groups,users}}`,
// each value independently JSON-stringified) — reading it as a flat object
// without unwrapping the subdomain/`*` layer first (as those two admin call
// sites used to) finds no top-level `.groups`/`.users` on ANY pattern that's
// ever been edited through the current Permissions UI, so `isUserAuthed`
// silently denies everyone but a site admin regardless of what's actually
// granted underneath (found 2026-09-20 — mitigat-ny-prod pattern 1006405).
export function resolveSubdomainAuthPermissions(rawAuth, subdomain) {
    const parsed = parseIfJSON(rawAuth || '{}', {});
    if (parsed['*'] !== undefined)                          // new format
        return parseIfJSON(parsed[subdomain] || parsed['*'] || {});
    return parseIfJSON(parsed);                                          // old format
}

// Whether a raw `authPermissions` value (flat or subdomain-keyed, string or
// object) grants anything to a user or a non-public group. An admin row that
// doesn't falls back to the auth pattern's permissions — see pattern2routes.
// `public` is ignored because the Access editor (permissionsEditor.jsx) seeds
// `public: ['view-page']` into every value it saves: without this, merely
// saving the admin row's Access tab would cut it off from the auth pattern.
export function hasAuthGrants(rawAuth, subdomain = '') {
    if (!rawAuth) return false;
    const resolved = resolveSubdomainAuthPermissions(rawAuth, subdomain);
    const nonEmpty = ([, perms]) => (Array.isArray(perms) ? perms.length > 0 : Boolean(perms));
    return Object.entries(resolved?.users || {}).some(nonEmpty)
        || Object.entries(resolved?.groups || {}).filter(([g]) => g !== 'public').some(nonEmpty);
}

// Merge an `override` authPermissions onto a `base` (inheritance: pattern ⊕ page, or pattern ⊕
// source). For each group/user key in the override: `[]` DISABLES the inherited grant, a non-empty
// array REPLACES it. Returns a new object; with no override returns the base unchanged.
// NOTE: the server (avail-falcor / dms-server) reimplements this identically for source-data
// enforcement — keep the two in sync.
export function mergeAuthPermissions (base = {}, override) {
    if (!override) return base || {};
    const groups = { ...(base?.groups || {}) };
    const users = { ...(base?.users || {}) };
    for (const [id, perms] of Object.entries(override.users || {})) {
        if (Array.isArray(perms) && perms.length === 0) delete users[id];
        else users[id] = perms;
    }
    for (const [name, perms] of Object.entries(override.groups || {})) {
        if (Array.isArray(perms) && perms.length === 0) delete groups[name];
        else groups[name] = perms;
    }
    return { groups, users };
}

export function isUserAuthed ({user={}, reqPermissions=[], authPermissions={}}) {
    if(!reqPermissions?.length) return true;
    const authedGroups = authPermissions.groups || {};
    const authedUsers = authPermissions.users || {};

    // if user is logged in and auth has not been set up (beyond public group) → allow
    if(user.authed && !Object.keys(authedGroups).filter(g => g !== 'public').length && !Object.keys(authedUsers).length) return true;

    if(!Object.keys(authedGroups).length && !Object.keys(authedUsers).length) return true;

    const userAuthPermissions = [
      ...(authedUsers[user?.id] || []),
      ...(user.groups || [])
        .filter(group => authedGroups[group])
        .reduce((acc, group) => {
            const groupPermissions = Array.isArray(authedGroups[group]) ? authedGroups[group] : [authedGroups[group]];
            if(groupPermissions?.length) acc.push(...groupPermissions);
            return acc;
        }, [])
    ];

    return userAuthPermissions.some(permission => permission === '*' || reqPermissions.includes(permission));
}
