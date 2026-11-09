// What a site's registered pattern types declare about their row kinds, in the shape dms-server
// stores in its `formats` table (dms-server/src/routes/auth/formats.js): one row per format key.
//
//     { type: 'datasets+source',  attributes, authRules }            a format: its attributes as plain
//                                                                     data and its `rules` map
//     { type: 'page+pattern',     authVocabulary, childRefs }          a pattern TYPE's own declarations:
//                                                                     the vocabulary derived at
//                                                                     registration and its childRefs
//     { type: 'admin+site',       …, authVocabulary }                  a site-level CONTAINER (a format of a
//                                                                     `rulesOn: 'site'` type that registers
//                                                                     children) carries its own vocabulary,
//                                                                     since no pattern row stands above its
//                                                                     rows to declare for them
//
// `scripts/emit-formats.mjs` builds these rows outside a browser and
// `dms-server/src/scripts/register-formats.js` writes them: a server-side step, since no client may
// write that table (owner, 2026-11-06). `registry.js declarations()` builds the same rows in the
// browser only so a test can compare the two. PURE DATA IN, PURE DATA OUT: this module is loaded by
// the emitter under a resolver that stubs everything but format modules, so it imports only
// deriveAuthVocabulary.

import { deriveDmsEnvVocabulary } from './deriveAuthVocabulary'

/**
 * A JSON-safe copy of a format's attributes: functions, symbols, React elements, lazy components
 * and computed (getter) properties are dropped (a display component contributes nothing the server
 * reads; a getter is run-time state), as is `undefined`. Arrays and plain objects are copied;
 * anything else that is not a primitive is dropped.
 */
export function plainData(v) {
    if (v === null) return null
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean') return v
    if (t !== 'object') return undefined                         // function, symbol, bigint, undefined
    if (Array.isArray(v)) return v.map(plainData).filter(x => x !== undefined)
    if (v.$$typeof !== undefined) return undefined                // a React element / lazy component
    const proto = Object.getPrototypeOf(v)
    if (proto !== null && proto !== Object.prototype) return undefined
    const out = {}
    // own data properties only: a getter (admin.format's `pattern_type.options`, read off the live
    // registry) is run-time state, not a declaration
    const entries = Object.entries(Object.getOwnPropertyDescriptors(v)).filter(([, d]) => !d.get && !d.set)
    for (const [k, d] of entries) {
        const p = plainData(d.value)
        if (p !== undefined) out[k] = p
    }
    // an object that held only components (`DisplayComp: { EditComp, ViewComp }`) is nothing, not `{}`
    return entries.length && !Object.keys(out).length ? undefined : out
}

const hasKeys = (o) => !!o && typeof o === 'object' && Object.keys(o).length > 0
const keyOf = (format) => (format && format.app && format.type ? `${format.app}+${format.type}` : null)

/** Every format object in a tree, parents before children. */
function* formatsIn(format) {
    if (!format || typeof format !== 'object') return
    if (Array.isArray(format)) { for (const f of format) yield* formatsIn(f); return }
    yield format
    for (const child of (format.registerFormats || [])) yield* formatsIn(child)
}

/**
 * The rows for a set of registry entries (`{ name, formats, instanceFormat, authVocabulary,
 * childRefs, rulesOn }`). A format key met twice (the same `source` format registered by two types)
 * keeps the first attributes and takes the later rules, as deriveAuthRules does. Rows are sorted by key.
 */
export function declarationsOf(entries) {
    const rows = new Map()
    const row = (type) => {
        if (!rows.has(type)) rows.set(type, { type, attributes: null, authVocabulary: null, authRules: null, childRefs: null })
        return rows.get(type)
    }
    for (const entry of entries) {
        const trees = [entry.instanceFormat, ...[].concat(entry.formats || [])].filter(Boolean)
        for (const format of formatsIn(trees)) {
            const type = keyOf(format)
            if (!type) continue
            const r = row(type)
            if (r.attributes === null && Array.isArray(format.attributes)) r.attributes = plainData(format.attributes)
            if (hasKeys(format.rules)) r.authRules = { ...(r.authRules || {}), ...plainData(format.rules) }
            if (entry.rulesOn === 'site' && (format.registerFormats || []).length) {
                const v = deriveDmsEnvVocabulary(format)
                if (hasKeys(v)) r.authVocabulary = v
            }
        }
        if (!entry.name) continue
        const r = row(`${entry.name}+pattern`)
        if (hasKeys(entry.authVocabulary)) r.authVocabulary = plainData(entry.authVocabulary)
        if (hasKeys(entry.childRefs)) r.childRefs = plainData(entry.childRefs)
    }
    return [...rows.values()].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : 0))
}

export default declarationsOf
