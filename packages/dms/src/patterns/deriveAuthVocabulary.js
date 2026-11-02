// Derive a pattern type's auth vocabulary from the `permissionDomain`s it already declares.
//
// ONE authored list per row kind. A verb is written once, in the `permissionDomain` of the format
// that describes the row it governs (or, for the pattern row itself, in the registry entry's own
// domain). The vocabulary the server interprets is COMPUTED from those — it is not a second place
// to declare anything. See planning/tasks/current/permission-domain-single-source.md.
//
// WHERE THE SCOPES COME FROM
//
//   descendants  the union of every format the pattern registers, each format's own
//                `permissionDomain` plus its `registerFormats` tree. These govern the rows BENEATH
//                the pattern — pages, components, sources, views.
//   self         the pattern ROW's own verbs. Every pattern row of every type is an
//                `admin+pattern` row, so the shared `admin.format.js` `pattern` domain is the self
//                source for ALL types — not a registry key. A type may ADD to it with its own
//                pattern-instance format, the row kind that IS the pattern instance (datasets'
//                `form-manager`), which carries the verbs granted at the pattern level and nowhere
//                else (`view-sources`, `create-source`). `page` has none, so its self is the
//                shared domain alone. Revised 2026-10-30 — see the task's decision 1.
//
// CONFLICTS. `siteConfig` is an array and each entry may carry a format, so one row kind can be
// described twice. That is a CONFIGURATION ERROR, and **the later entry wins** (owner,
// 2026-10-30). Nothing enforces it — deliberately. Last-wins is documented so the behaviour is
// predictable, not so anyone relies on it.

/** `*` is an editor affordance — "everything" — never a declared verb, so it never enters a vocabulary. */
const WILDCARD = '*';

/** Every `permissionDomain` entry in a format and its registered children, in declaration order. */
function domainEntriesOf(format, out = []) {
    if (!format || typeof format !== 'object') return out;
    if (Array.isArray(format)) { format.forEach(f => domainEntriesOf(f, out)); return out; }
    for (const attr of (format.attributes || [])) {
        if (Array.isArray(attr?.permissionDomain)) out.push(...attr.permissionDomain);
    }
    for (const child of (format.registerFormats || [])) domainEntriesOf(child, out);
    return out;
}

/**
 * Collapse entries to one per verb, LAST WINS, dropping the wildcard.
 * Returns `{ value, label, implies }` in first-seen order so a derived vocabulary reads like the
 * list it came from rather than in some incidental order.
 */
function collapse(entries) {
    const order = [];
    const byVerb = new Map();
    for (const e of entries) {
        if (!e || typeof e.value !== 'string' || e.value === WILDCARD) continue;
        if (!byVerb.has(e.value)) order.push(e.value);
        byVerb.set(e.value, e);                       // later entry wins
    }
    return order.map(v => {
        const e = byVerb.get(v);
        const out = { value: e.value, implies: [...(e.implies || [])] };
        if (e.label !== undefined) out.label = e.label;
        return out;
    });
}

/**
 * @param {object}   opts
 * @param {array}    opts.self      the shared `admin+pattern` domain — the pattern-row verbs every
 *                                  type has.
 * @param {object}   opts.instance  OPTIONAL: the type's pattern-instance format, the row kind that
 *                                  IS the pattern (datasets' `form-manager`). Its OWN domain joins
 *                                  `self`, because those verbs are granted at the pattern level and
 *                                  nowhere else; its `registerFormats` tree is descendants as usual.
 *                                  Omit it for a type whose top format is already a descendant kind
 *                                  (page's `page`, admin's `site`).
 * @param {array}    opts.formats   the descendant format trees, unbound (base modules)
 * @returns {{ self: array, descendants: array }} — scopes with no verbs are omitted, matching the
 *          hand-written vocabularies, which never carry an empty bucket.
 */
export function deriveAuthVocabulary({ self = [], instance = null, formats = [] } = {}) {
    const out = {};
    // the instance format's own attributes only — its children fall through to descendants
    const instanceEntries = instance ? domainEntriesOf({ ...instance, registerFormats: [] }) : [];
    const beneath = [].concat(instance?.registerFormats || [], formats);
    const selfVerbs = collapse([...[].concat(self), ...instanceEntries]);
    const descendantVerbs = collapse(domainEntriesOf(beneath));
    if (selfVerbs.length) out.self = selfVerbs;
    if (descendantVerbs.length) out.descendants = descendantVerbs;
    return out;
}

export default deriveAuthVocabulary;
