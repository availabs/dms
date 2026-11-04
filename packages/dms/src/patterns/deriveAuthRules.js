// Collect a pattern type's auth rules from the formats it registers.
//
// A format object may carry `rules: { [rowKind]: rule }`: which permission each write on that kind of
// row needs (the rule language is dms-server's kindAuth/authJudge.js). Normally a format carries the
// rule for its own `type`; a kind with no format object of its own (split `data` rows) rides on the
// format that owns it (`source`).
//
// Like the auth vocabulary (deriveAuthVocabulary.js), the rules are DERIVED here at registration and
// stamped onto a row, because dms-server cannot read this registry: pattern rows carry their type's
// rules as `data.authRules`; a type registered with `rulesOn: 'site'` (admin: the site-level kinds)
// has them stamped on the SITE row instead. Rows stamped before a library change keep the rules they
// were stamped with; rows with none use the server's built-in copy (kindAuth/authRules.js), which
// `authRules.sync.test.js` keeps identical to these.
//
// Conflicts (two formats declaring the same kind): the later one wins, as for permissionDomains.

// The owners the server can resolve (kindAuth/authJudge.js RESOLVER_NAMES). A rule naming any other
// owner would fail closed on the server; registration refuses it instead, where the typo is visible.
export const RULE_OWNERS = [
    'site-grants', 'datasets-grants', 'self-pattern', 'parent-pattern',
    'parent-pattern+row', 'self-source', 'owning-source', 'source-by-slug',
];

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
        if (typeof n.owner === 'string') owners.push(n.owner);
        Object.values(n).forEach(walk);
    };
    for (const [kind, rule] of Object.entries(rules || {})) {
        if (!rule || typeof rule !== 'object' || !rule.ops || typeof rule.ops !== 'object') {
            throw new Error(`${label}: "${kind}" needs an ops object`);
        }
        owners.length = 0;
        walk(rule);
        const bad = owners.find(o => !RULE_OWNERS.includes(o));
        if (bad) throw new Error(`${label}: "${kind}" names owner "${bad}", which the server can't resolve`);
    }
    return rules;
}
