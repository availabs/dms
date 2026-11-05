// Collect a pattern type's auth rules from the formats it registers.
//
// A format object may carry `rules: { [rowKind]: rule }`: which permission each write on that kind of
// row needs, and what earns a read (the rule language is dms-server's routes/auth/judge.js). Normally a format carries the
// rule for its own `type`; a kind with no format object of its own (split `data` rows) rides on the
// format that owns it (`source`).
//
// Like the auth vocabulary (deriveAuthVocabulary.js), the rules are DERIVED here at registration and
// stamped onto a row, because dms-server cannot read this registry: pattern rows carry their type's
// rules as `data.authRules`; a type registered with `rulesOn: 'site'` (admin: the site-level kinds)
// has them stamped on the SITE row instead. Rows stamped before a library change keep the rules they
// were stamped with; rows with none use the server's built-in copy (routes/auth/rules.js), which
// `authRules.sync.test.js` keeps identical to these.
//
// Conflicts (two formats declaring the same kind): the later one wins, as for permissionDomains.

// An owner is a POSITION on the row's ancestry, which dms-server's routes/auth/owners.js resolves:
// `self`, `parent`, `site`, `ancestor:<kind>`, or a list of those spread in order (rule 2: a rule is
// resolved by walking the row's parents and never names a pattern type — `patterns:<type>` was retired
// on 2026-11-05). The older names (`site-grants`, `parent-pattern+row`, …) still resolve, for rows
// stamped with them. A rule naming anything else would fail closed on the server; registration refuses
// it instead.
export const RULE_OWNERS = [
    'site-grants', 'datasets-grants', 'self-pattern', 'parent-pattern',
    'parent-pattern+row', 'self-source', 'owning-source', 'source-by-slug',
];
export const isOwner = (o) => Array.isArray(o) ? o.length > 0 && o.every(isOwner)
    : typeof o === 'string' && (['self', 'parent', 'site'].includes(o) || /^ancestor:[A-Za-z0-9_-]+$/.test(o) || RULE_OWNERS.includes(o));

function collect(format, out) {
    if (!format || typeof format !== 'object') return out;
    if (Array.isArray(format)) { format.forEach(f => collect(f, out)); return out; }
    if (format.rules && typeof format.rules === 'object') Object.assign(out, format.rules);
    for (const child of (format.registerFormats || [])) collect(child, out);
    return out;
}

/** `{ [rowKind]: rule }` from the instance format and the descendant format trees, in that order. */
export function deriveAuthRules({ instance = null, formats = [] } = {}) {
    return collect([instance, ...[].concat(formats)].filter(Boolean), {});
}

/** Throws on a rule the server could not use: no `ops`, or an owner it can't resolve. */
export function validateAuthRules(rules, label = 'authRules') {
    const owners = [];
    const walk = (n) => {
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (!n || typeof n !== 'object') return;
        if (n.owner !== undefined) owners.push(n.owner);
        if (n.blank !== undefined && n.blank !== true) owners.push(n.blank);
        Object.values(n).forEach(walk);
    };
    for (const [kind, rule] of Object.entries(rules || {})) {
        if (!rule || typeof rule !== 'object' || !rule.ops || typeof rule.ops !== 'object') {
            throw new Error(`${label}: "${kind}" needs an ops object`);
        }
        owners.length = 0;
        walk(rule);
        const bad = owners.find(o => !isOwner(o));
        if (bad !== undefined) throw new Error(`${label}: "${kind}" names owner "${JSON.stringify(bad)}", which the server can't resolve`);
    }
    return rules;
}
