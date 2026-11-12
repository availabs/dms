#!/usr/bin/env node
/* global process, Buffer */
/**
 * Emit the format declarations of this client package — the rows of dms-server's `formats` table
 * (dms-server/src/routes/auth/formats.js; patterns/declarations.js for the shape) — for the server's
 * registration script, the table's only writer (no browser or CLI may write it; owner, 2026-11-06):
 *
 *     node scripts/emit-formats.mjs > formats.json
 *     node scripts/emit-formats.mjs --extra ../../../src/patterns/qa/qa.format.js > formats.json
 *     node ../dms-server/src/scripts/register-formats.js --db <config> --app <app> --file formats.json [--apply]
 *     dms formats diff formats.json          # what a site's stored rows differ in, read-only
 *
 * `register-formats.js` runs this itself when given no `--file`. A host app's own types come in with
 * `--extra <file>`: a format module registers under its basename before the first dot
 * (`qa.format.js` → `qa`), a `*.childRefs.js` module adds that type's childRefs.
 *
 * HOW IT LOADS THEM. Formats are not pure data: admin.format.js imports display components, the
 * registry and lazyComponent. So each one is bundled with esbuild under a resolver that keeps only
 * the modules declarations can possibly live in — other `*.format.js` files, `*.domain.js`
 * constants, the derivations — and STUBS everything else. A display component cannot contribute a
 * verb or an attribute the server reads, so dropping it loses nothing and keeps React and the
 * theme tree out of a data dump.
 *
 * `@availabs/dms` is not `type: module`, so the bundle is handed to Node as a `data:` URL rather
 * than written to disk.
 */

import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))

// The built-ins, by the pattern_type they register under (patterns/index.js). `instance` names the
// format for the row kind that IS the pattern — its own domain is `self`, its children descendants.
const BUILT_INS = {
    page:     { formats: ['src/patterns/page/page.format.js'] },
    datasets: { instance: 'src/patterns/datasets/datasets.format.js' },
    auth:     { formats: ['src/patterns/auth/auth.format.js'] },
    admin:    { formats: ['src/patterns/admin/admin.format.js'], rulesOn: 'site' },
}

// Which of a type's rows own other rows. Only declared where a type actually owns something.
const CHILD_REFS = {
    page: 'src/patterns/page/page.childRefs.js',
}

/**
 * Modules a permission declaration can live in. Everything else — display components, the theme
 * tree, the registry — is replaced by an empty module: it cannot contribute a verb, and bundling it
 * would drag React and half the UI into a data dump.
 *
 * The stub is generated per IMPORTER, not per module, because an ES module's exports are static:
 * esbuild resolves `import { lazyComponent } from '…'` by name, so a Proxy cannot stand in. Instead
 * each stubbed (importer, path) pair is given a module that exports `default` plus every name that importer
 * asks of it (read from its import statement).
 */
const KEEP = /\.(format|domain|childRefs)(\.js)?$|deriveAuth(Vocabulary|Rules)(\.js)?$|declarations(\.js)?$/
// The stubs with a value of their own: `lazyComponent` yields a component (a function, dropped by plainData),
// the list stubs yield []. Any other name an importer asks for (a component, a helper) is the noop.
const STUB_VALUES = { lazyComponent: '() => noop', listPatternTypes: '() => []', registerFormats: '() => []' }

// The names `importer` imports from `spec`: `import D, { a, b as c } from 'spec'` → ['a', 'b'].
function importedNames(importer, spec) {
    let src = ''
    try { src = readFileSync(importer, 'utf8') } catch { return [] }
    const esc = spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const names = new Set()
    for (const m of src.matchAll(new RegExp(`import\\s+(?:[\\w$]+\\s*,\\s*)?\\{([^}]*)\\}\\s*from\\s*['"]${esc}['"]`, 'g'))) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/)[0].trim()
            if (/^[\w$]+$/.test(name)) names.add(name)
        }
    }
    return [...names]
}

const stubPlugin = {
    name: 'permissions-only',
    setup(build) {
        // one stub per (importer, specifier): its exports are exactly the names that importer asks for
        build.onResolve({ filter: /.*/ }, (args) =>
            (args.kind === 'entry-point' || KEEP.test(args.path)) ? null
                : { path: `${args.importer}::${args.path}`, namespace: 'stub', pluginData: { importer: args.importer, spec: args.path } })
        build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
            const { importer, spec } = args.pluginData || {}
            const names = new Set([...Object.keys(STUB_VALUES), ...importedNames(importer, spec)])
            names.delete('default')
            return {
                contents: 'const noop = () => undefined;\nexport default noop;\n'
                    + [...names].map(n => `export const ${n} = ${STUB_VALUES[n] || 'noop'};`).join('\n'),
                loader: 'js',
            }
        })
    },
}

async function loadModule(file) {
    const result = await esbuild.build({
        entryPoints: [file],
        bundle: true, write: false, format: 'esm', platform: 'node',
        loader: { '.js': 'jsx', '.jsx': 'jsx' },
        plugins: [stubPlugin],
        logOverride: { 'import-is-undefined': 'silent' },
        logLevel: 'silent',
    })
    const src = result.outputFiles[0].text
    return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
}

const pick = (mod) => mod.default ?? Object.values(mod)[0]

const args = process.argv.slice(2)
const extras = []
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--extra') extras.push(args[++i])
    else { console.error(`Unknown argument: ${args[i]}`); process.exit(1) }
}

const { deriveAuthVocabulary } = await loadModule(resolve(here, '..', 'src/patterns/deriveAuthVocabulary.js'))
const { deriveAuthRules } = await loadModule(resolve(here, '..', 'src/patterns/deriveAuthRules.js'))
const { PATTERN_ROW_DOMAIN } = await loadModule(resolve(here, '..', 'src/patterns/patternRow.domain.js'))
const { declarationsOf } = await loadModule(resolve(here, '..', 'src/patterns/declarations.js'))

// A registry entry as registerPatternTypes builds it (patterns/registry.js), from loaded modules.
const entryFor = async (name, { formats = [], instance, publicRead, rulesOn, childRefs }) => {
    const loaded = []
    for (const rel of formats) loaded.push(pick(await loadModule(resolve(here, '..', rel))))
    const instanceFormat = instance ? pick(await loadModule(resolve(here, '..', instance))) : undefined
    const authVocabulary = deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, instance: instanceFormat, formats: loaded })
    if (publicRead) authVocabulary.publicRead = true
    const authRules = deriveAuthRules({ instance: instanceFormat, formats: loaded })
    return { name, formats: loaded, instanceFormat, authVocabulary, authRules, rulesOn, childRefs }
}

const entries = []
for (const [name, def] of Object.entries(BUILT_INS)) {
    const childRefs = CHILD_REFS[name] ? pick(await loadModule(resolve(here, '..', CHILD_REFS[name]))) : undefined
    entries.push(await entryFor(name, { ...def, childRefs }))
}

// A host app's own types: `--extra <file>`, named by the file's basename before the first dot.
const extraByType = new Map()
for (const rel of extras) {
    const file = resolve(process.cwd(), rel)
    const type = file.split('/').pop().split('.')[0]
    const e = extraByType.get(type) || { formats: [], childRefs: undefined }
    if (/\.childRefs\.js$/.test(file)) e.childRefs = pick(await loadModule(file))
    else e.formats.push(pick(await loadModule(file)))
    extraByType.set(type, e)
}
for (const [name, e] of extraByType) {
    const authVocabulary = deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, formats: e.formats })
    entries.push({ name, formats: e.formats, authVocabulary, authRules: deriveAuthRules({ formats: e.formats }), childRefs: e.childRefs })
}

process.stdout.write(JSON.stringify(declarationsOf(entries), null, 2) + '\n')
