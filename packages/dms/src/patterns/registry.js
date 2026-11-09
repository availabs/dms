/* global process */
// The pattern-type registry. A pattern row's `pattern_type` names an entry
// here; pattern2routes (render/spa/utils) routes it with that entry's
// siteConfig, and the admin lists (pattern-type select, Add Pattern picker,
// type pills, settings) read the entries' metadata instead of hard-coding
// types. The built-in types register in ./index.js; a host app registers its
// own at module scope, in a module that both its client entry (App.jsx) and
// its SSR entry import, so both builds route the same types. See
// documentation/pattern-registry.md (in the library repo root).
//
// A definition:
//   siteConfig      array of config functions — the same contract as a
//                   built-in's siteConfig.jsx default export
//   label           display name (pattern-type select, picker card)
//   description     one line for the Add Pattern picker card
//   admin           { addable, order, defaultName, usesDmsEnv, duplicable,
//                     beforeCreate, afterCreate, editorTabs }
//                     addable      offered as a card in the Add Pattern picker
//                     order        position in the type select / filter chips
//                     defaultName  the picker's suggested pattern name
//                     usesDmsEnv   the pattern settings show the dmsEnv picker
//                     duplicable   default true; false hides Duplicate and
//                                  patternActions denies it (utils/adminPermissions)
//                     beforeCreate optional async ({ falcor, app, instance, row,
//                                  siblings }) → { problem } to refuse the new
//                                  pattern (the message is shown), or { row } to
//                                  write in place of `row` (e.g. initial settings)
//                     afterCreate  optional async ({ falcor, app, siteId,
//                                  siteInstance, patternId, instance, row,
//                                  siblings }), run once the site row listing the
//                                  new pattern is saved (e.g. creating datasets)
//                     editorTabs   optional [{ name, path, icon, component }]:
//                                  Pattern Editor tabs (and admin menu entries)
//                                  this type adds after Overview
//   (format)        REQUIRED, but NOT a key here — declared by each `siteConfig`
//                   entry returning `format`, which five of the seven types
//                   already do. A pattern must describe every DMS row kind it
//                   stores, and therefore declare at least one format, even if
//                   it only saves configuration. Without one a row kind has no
//                   attribute metadata, no `permissionDomain` (so no grants
//                   editor — only `*` can be granted), and nothing declaring
//                   which rows own which. `siteConfig` is an ARRAY: a type
//                   owning several row kinds returns several configs (admin:
//                   site row + pattern row). Two configs declaring a
//                   permissionDomain for the SAME row kind is a configuration
//                   error; the later entry wins and nothing enforces it.
//                   Not satisfied today by `qa`, `chat`, or `auth` (whose stub
//                   has no attributes). See documentation/pattern-registry.md.
//   formats         the descendant format trees this type declares (the base
//                   modules, unbound). With `instanceFormat` these are the ONLY
//                   place its permissions are authored: the `authVocabulary`
//                   the server interprets is DERIVED from them at registration
//                   (./deriveAuthVocabulary.js). There is no `authVocabulary`
//                   key — a verb lives in exactly one authored list, the
//                   `permissionDomain` of the format that describes the row it
//                   governs. See
//                   planning/tasks/current/permission-domain-single-source.md.
//                   How it reaches dms-server, which cannot read this registry:
//                   `scripts/emit-formats.mjs` turns every type's formats,
//                   vocabulary and childRefs into rows of the server's `formats`
//                   table (./declarations.js, the same derivation as here) and
//                   `dms-server/src/scripts/register-formats.js` writes them —
//                   a server-side step of a deploy; no client can write that
//                   table. New rows are ALSO stamped with a copy for one release
//                   (`stampPatternRow` / `stampSiteRow`), for a server that has
//                   not read the table yet.
//   rulesOn         optional 'site' — this type's formats describe the
//                   SITE-LEVEL kinds (admin: site, theme, tenant, pattern,
//                   dmsenv), rows with no pattern above them. Its container
//                   formats (those registering children) declare their own
//                   vocabulary, since no pattern row declares for their rows,
//                   and its rules are stamped on the site row rather than on
//                   its pattern row.
//   instanceFormat  optional: the format for the row kind that IS this pattern
//                   (datasets' `form-manager`). Its own domain joins `self`,
//                   because those verbs are granted at the pattern level and
//                   nowhere else; its registerFormats tree is descendants.
//   publicRead      optional true — this type's rows are readable with no
//                   session. Was a key inside the vocabulary file; now declared
//                   here. ⚠ Never store anything secret on such a row.
//   childRefs       optional { [ownerKind]: { [attribute]: childKind } } — which
//                   of this type's rows own other rows, and through which
//                   attributes. Server-readable copy of what `type: 'dms-format'`
//                   already declares per attribute; drives the parentage
//                   migration and the parent a row may name. See
//                   ./page/page.childRefs.js.
//   providesDatasources  this type's rows become internal datasources
//                   (CMSContext.datasources — the page source pickers)
//   pageComponents  optional { elementType: definition } handed to the page
//                   pattern's registerComponents — section types this pattern
//                   ships
//   defaultTheme    optional object holding every theme object the pattern
//                   uses. It is registered onto the default theme under
//                   `themeKey` (default: the type's name), and site themes
//                   style the pattern by setting keys under that same name.
//   themeKey        optional; only for a type whose theme key predates the
//                   registry (the page pattern's is `pages`)
//   onPagePublish   optional async ({ page, pattern, sitePatterns, type, app,
//                   baseUrl, apiLoad, apiUpdate }), called after Publish on a
//                   page pattern's page (`pattern` is that page pattern's row,
//                   `type` its instance).
//                   It runs after the publish write and never blocks it; a
//                   failure is logged.
//   registerFromTheme  optional (theme) => void. pattern2routes calls it with
//                   every theme the site loaded, at route build, so the type can
//                   register code a site theme ships for it under the type's
//                   theme key (e.g. plugins at `theme.<name>.plugins`) — site-wide,
//                   whichever pattern's theme declared them.
import { validateAuthVocabulary, validateChildRefs } from './authVocabulary'
import { deriveAuthVocabulary } from './deriveAuthVocabulary'
import { deriveAuthRules, validateAuthRules } from './deriveAuthRules'
import { PATTERN_ROW_DOMAIN } from './patternRow.domain'
import { declarationsOf } from './declarations'
import defaultTheme from '../ui/defaultTheme'
import { mergeTheme, resetBaseThemeCache } from '../ui/useTheme'
import { registerComponents } from './page/components/sections/componentRegistry'

const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production'

const patternTypes = {}

export function registerPatternTypes(types = {}) {
    Object.entries(types).forEach(([name, definition]) => {
        if (!Array.isArray(definition?.siteConfig)) {
            throw new Error(`registerPatternTypes: "${name}" needs a siteConfig array`)
        }
        // DERIVED, never authored. The formats are the single source; this builds the vocabulary
        // the server interprets and the editor offers. Validated at registration because
        // deploy-time is the only safe time: a verb that confers nothing because of a typo fails
        // closed and silently, which is the worst way for an auth rule to be wrong.
        if (definition.authVocabulary) {
            throw new Error(`registerPatternTypes: "${name}" sets authVocabulary — it is derived from `
                + `formats/instanceFormat now. Declare the verbs in the format's permissionDomain.`)
        }
        const vocabulary = deriveAuthVocabulary({
            self: PATTERN_ROW_DOMAIN,
            instance: definition.instanceFormat,
            formats: definition.formats || [],
        })
        if (definition.publicRead) vocabulary.publicRead = true
        validateAuthVocabulary(vocabulary, `registerPatternTypes: "${name}" authVocabulary`)
        if (definition.childRefs) {
            validateChildRefs(definition.childRefs, `registerPatternTypes: "${name}" childRefs`)
        }
        if (patternTypes[name] && isDev) {
            console.warn(`registerPatternTypes: "${name}" was already registered; replacing it`)
        }
        const authRules = validateAuthRules(
            deriveAuthRules({ instance: definition.instanceFormat, formats: definition.formats || [] }),
            `registerPatternTypes: "${name}" rules`)
        patternTypes[name] = { ...definition, name, authVocabulary: vocabulary, authRules }

        if (definition.pageComponents) registerComponents(definition.pageComponents)

        if (definition.defaultTheme) {
            const key = definition.themeKey || name
            defaultTheme[key] = defaultTheme[key]
                ? mergeTheme(defaultTheme[key], definition.defaultTheme)
                : definition.defaultTheme
        }
    })
    resetBaseThemeCache()
}

export function getPatternType(name) {
    return patternTypes[name]
}

const hasKeys = (o) => !!o && Object.keys(o).length > 0

/**
 * A new pattern row with what dms-server needs from its type's registry entry, which it cannot read
 * itself (no dependency on this package): `authVocabulary`, `childRefs` and, unless the type's rules
 * go on the site row (`rulesOn: 'site'`), `authRules`. Every pattern create goes through this, so a
 * type cannot forget. Rows created before a stamp existed carry nothing; the server falls back to its
 * built-in copies (kindAuth/authRules.js for rules).
 */
export function stampPatternRow(row) {
    const entry = patternTypes[row?.pattern_type]
    if (!entry) return row
    const out = { ...row }
    if (entry.authVocabulary) out.authVocabulary = entry.authVocabulary
    if (entry.childRefs) out.childRefs = entry.childRefs
    if (entry.rulesOn !== 'site' && hasKeys(entry.authRules)) out.authRules = entry.authRules
    return out
}

/**
 * A new SITE row with the site-level auth rules: those of every type registered with
 * `rulesOn: 'site'` (admin). Every site create goes through this.
 */
export function stampSiteRow(row) {
    const rules = Object.assign({}, ...Object.values(patternTypes)
        .filter(t => t.rulesOn === 'site').map(t => t.authRules || {}))
    return hasKeys(rules) ? { ...row, authRules: rules } : row
}

/**
 * Every registered type's declarations as rows of dms-server's `formats` table (./declarations.js):
 * what `scripts/emit-formats.mjs` prints for `dms-server/src/scripts/register-formats.js`. The browser
 * never writes that table (owner, 2026-11-06); this is here so a test can compare the two.
 */
export function declarations() {
    return declarationsOf(Object.values(patternTypes))
}

/**
 * The Access editor's option list for a pattern of `patternType` — the composition that replaced
 * `permissionOptionsFor`'s switch (utils/adminPermissions.js), which hand-listed the same verbs a
 * fifth time. Pattern-level grants cover both scopes, so the list is `self` then `descendants`,
 * `*` first, deduped by value with the first occurrence winning.
 */
export function patternPermissionOptions(patternType) {
    const entry = patternTypes[patternType]
    const vocabulary = entry?.authVocabulary || {}
    const seen = new Set()
    return [{ label: '*', value: '*' }, ...(vocabulary.self || []), ...(vocabulary.descendants || [])]
        .filter(o => o && !seen.has(o.value) && seen.add(o.value))
        .map(({ label, value }) => ({ label: label ?? value, value }))
}

// Registered definitions in admin order (admin.order, then registration order).
export function listPatternTypes() {
    return Object.values(patternTypes)
        .map((definition, i) => ({ definition, i }))
        .sort((a, b) => ((a.definition.admin?.order ?? Infinity) - (b.definition.admin?.order ?? Infinity)) || (a.i - b.i))
        .map(({ definition }) => definition)
}
