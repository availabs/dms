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
        if (patternTypes[name] && isDev) {
            console.warn(`registerPatternTypes: "${name}" was already registered; replacing it`)
        }
        patternTypes[name] = { ...definition, name }

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

// Registered definitions in admin order (admin.order, then registration order).
export function listPatternTypes() {
    return Object.values(patternTypes)
        .map((definition, i) => ({ definition, i }))
        .sort((a, b) => ((a.definition.admin?.order ?? Infinity) - (b.definition.admin?.order ?? Infinity)) || (a.i - b.i))
        .map(({ definition }) => definition)
}
