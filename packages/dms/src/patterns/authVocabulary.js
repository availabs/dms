// A pattern type's auth vocabulary: the verbs it offers, and what each one confers STRUCTURALLY.
//
// This is the client half of planning/tasks/current/row-auth-vocabulary.md. `registerPatternTypes`
// validates it; the pattern row transports it (`data.authVocabulary`); the server's resolver
// interprets it. The server has no dependency on this package and cannot read the registry, so the
// row is the only channel — see the task file's diagram.
//
// ONE declaration, two readers:
//
//   { value, label, implies }
//     value    the permission string that appears in a grant ('view-page')
//     label    what the Access editor shows ('View Page') — read by the CLIENT
//     implies  the structural verbs it confers — read by the SERVER
//
// It is therefore directly usable as a `permissionDomain`, which is why the two are the same shape
// rather than a map plus a parallel label table.
//
// SCOPE. `self` governs the pattern row itself; `descendants` governs everything beneath it. A verb
// in neither bucket does not exist. The split matters because a pattern's own grants are read for
// two different questions — "may you edit this pattern?" and "may you edit its pages?" — and a flat
// vocabulary cannot tell them apart. Legacy (undeclared) grants stay flat, which already means both.

/** The five structural verbs. The server's authority for this list is mergeAuth.js's VERBS. */
export const STRUCTURAL_VERBS = ['read', 'create', 'edit', 'delete', 'grant']

export const SCOPES = ['self', 'descendants']

/**
 * Top-level keys that are DECLARATIONS ABOUT the vocabulary rather than scopes of verbs.
 *
 * `publicRead: true` says "this pattern and its pages are readable with no session" — the data
 * replacement for the server recognising `pattern_type === 'auth' || 'admin'` by name
 * (planning/tasks/current/row-auth-consolidate.md, Phase 1). The server reads it from exactly here;
 * `dms-server/src/routes/dms/authVocabulary.js` `publicReadOf()` is the authority for the key, and
 * for `=== true` being the only accepted value.
 *
 * Without this list the validator read `publicRead` as a scope and threw at registration, which
 * takes the whole app down before it mounts — found by loading the real app under `enforce`.
 */
export const DECLARATIONS = { publicRead: 'boolean' }

/**
 * Throw unless `vocabulary` is well formed. Called from `registerPatternTypes`, so a malformed
 * vocabulary is a deploy-time error rather than a silent runtime one — a verb that confers nothing
 * because of a typo fails closed and invisibly, which is the worst way for auth to be wrong.
 */
export function validateAuthVocabulary(vocabulary, label = 'authVocabulary') {
    if (!vocabulary || typeof vocabulary !== 'object' || Array.isArray(vocabulary)) {
        throw new Error(`${label} must be an object with "self" and/or "descendants"`)
    }
    for (const [key, expected] of Object.entries(DECLARATIONS)) {
        if (vocabulary[key] === undefined) continue
        // eslint-disable-next-line valid-typeof
        if (typeof vocabulary[key] !== expected) {
            throw new Error(`${label}.${key} must be a ${expected} — got ${typeof vocabulary[key]}`)
        }
    }
    const scopes = Object.keys(vocabulary).filter(k => !(k in DECLARATIONS))
    if (!scopes.length) throw new Error(`${label} declares no scopes`)
    const unknown = scopes.filter(s => !SCOPES.includes(s))
    if (unknown.length) {
        throw new Error(`${label}: unknown scope(s) ${unknown.join(', ')} — expected ${SCOPES.join(' / ')}`
            + ` (declarations: ${Object.keys(DECLARATIONS).join(' / ')})`)
    }

    const seen = new Map()
    for (const scope of scopes) {
        const entries = vocabulary[scope]
        if (!Array.isArray(entries)) throw new Error(`${label}.${scope} must be an array`)
        entries.forEach((entry, i) => {
            const at = `${label}.${scope}[${i}]`
            if (!entry || typeof entry !== 'object') throw new Error(`${at} must be an object`)
            if (typeof entry.value !== 'string' || !entry.value) throw new Error(`${at}.value must be a non-empty string`)
            if (entry.label !== undefined && typeof entry.label !== 'string') throw new Error(`${at}.label must be a string`)
            if (!Array.isArray(entry.implies)) throw new Error(`${at}.implies must be an array (use [] for a verb with no structural effect)`)
            const bad = entry.implies.filter(v => !STRUCTURAL_VERBS.includes(v))
            if (bad.length) throw new Error(`${at}.implies has non-structural verb(s) ${bad.join(', ')} — expected ${STRUCTURAL_VERBS.join(' / ')}`)
            // WHICH FIELDS THIS VERB GOVERNS. A write that touches one of them requires this verb;
            // `'*'` claims every field no other verb named, which is the kind's default edit verb.
            // Without this, "changing `authPermissions` needs `edit-page-permissions`" has to live
            // in server code — which is the hardcoding `src/dms/CLAUDE.md` names as the live case.
            if (entry.fields !== undefined) {
                if (!Array.isArray(entry.fields)) throw new Error(`${at}.fields must be an array of field names`)
                const badF = entry.fields.filter(f => typeof f !== 'string' || !f)
                if (badF.length) throw new Error(`${at}.fields must hold non-empty strings`)
            }
            // A CONDITIONAL field claim: `published` is a publish only when its new value is not
            // `draft`. The one value-predicate the vocabulary carries — see the task's Phase 1.
            if (entry.when !== undefined) {
                if (!Array.isArray(entry.when)) throw new Error(`${at}.when must be an array of conditions`)
                entry.when.forEach((c, ci) => {
                    if (!c || typeof c !== 'object') throw new Error(`${at}.when[${ci}] must be an object`)
                    if (typeof c.field !== 'string' || !c.field) throw new Error(`${at}.when[${ci}].field must be a non-empty string`)
                    if (!('notValue' in c)) throw new Error(`${at}.when[${ci}] needs a notValue — the only predicate form`)
                })
            }
            // A verb may appear in both buckets, but it must mean the same thing in each: one
            // string in a grant cannot confer `edit` on the row and `read` on its children.
            const prior = seen.get(entry.value)
            const here = [...entry.implies].sort().join(',')
            if (prior !== undefined && prior !== here) {
                throw new Error(`${at}: "${entry.value}" implies [${here}] here but [${prior}] in another scope — one verb, one meaning`)
            }
            seen.set(entry.value, here)
        })
    }
    return vocabulary
}

/** Both buckets as one list, for a UI that shows a single set of options. */
export function flattenAuthVocabulary(vocabulary) {
    if (!vocabulary) return []
    const out = []
    const seen = new Set()
    for (const scope of SCOPES) {
        for (const entry of (vocabulary[scope] || [])) {
            if (seen.has(entry.value)) continue
            seen.add(entry.value)
            out.push(entry)
        }
    }
    return out
}

/**
 * Throw unless `childRefs` is well formed — `{ [ownerKind]: { [attribute]: childKind } }`.
 *
 * Validated at registration for the same reason the vocabulary is: a typo'd attribute name means
 * the migration silently finds no children, and a typo'd child kind means `createData` silently
 * stops enforcing which parent a row may name. Both fail quietly and in the permissive direction.
 */
export function validateChildRefs(childRefs, label = 'childRefs') {
    if (!childRefs || typeof childRefs !== 'object' || Array.isArray(childRefs)) {
        throw new Error(`${label} must be an object keyed by owner kind`)
    }
    const owners = Object.keys(childRefs)
    if (!owners.length) throw new Error(`${label} declares no owners`)
    const ownerOf = new Map()
    for (const owner of owners) {
        if (!owner) throw new Error(`${label} has an empty owner kind`)
        const attrs = childRefs[owner]
        if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
            throw new Error(`${label}.${owner} must be an object of { attribute: childKind }`)
        }
        if (!Object.keys(attrs).length) throw new Error(`${label}.${owner} declares no attributes`)
        for (const [attr, childKind] of Object.entries(attrs)) {
            if (!attr) throw new Error(`${label}.${owner} has an empty attribute name`)
            if (typeof childKind !== 'string' || !childKind) {
                throw new Error(`${label}.${owner}.${attr} must name a child kind`)
            }
            // One owner per child kind, or "which parent may this row name" has no answer.
            const prior = ownerOf.get(childKind)
            if (prior !== undefined && prior !== owner) {
                throw new Error(`${label}: "${childKind}" is owned by both "${prior}" and "${owner}" — one owner per kind`)
            }
            ownerOf.set(childKind, owner)
        }
    }
    return childRefs
}

/** The kind that owns `childKind`, or null. This is what `createData` enforces against. */
export function ownerKindOf(childRefs, childKind) {
    if (!childRefs || !childKind) return null
    for (const [owner, attrs] of Object.entries(childRefs)) {
        if (attrs && Object.values(attrs).includes(childKind)) return owner
    }
    return null
}
