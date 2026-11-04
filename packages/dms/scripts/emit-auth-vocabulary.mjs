#!/usr/bin/env node
/**
 * Emit the auth-vocabulary manifest the server-side migration consumes.
 *
 *     node scripts/emit-auth-vocabulary.mjs > vocab.json
 *     node scripts/emit-auth-vocabulary.mjs --extra ../../../src/patterns/qa/qa.authVocabulary.js
 *
 * Why a file at all: a pattern type DECLARES its vocabulary in this package's registry, and
 * `dms-server` has no dependency on this package — it cannot read the registry, and neither can a
 * script that lives inside it. The pattern ROW is the runtime channel
 * (planning/tasks/current/row-auth-vocabulary.md); this manifest is the MIGRATION channel, used
 * once to reconcile rows that predate the declaration:
 *
 *     emit-auth-vocabulary.mjs  →  vocab.json  →  migrate-row-auth.js --sync-vocabulary
 *
 * Output: { "<pattern_type>": { vocabulary: { self, descendants }, childRefs?: {…} }, … }
 *
 * HOW IT LOADS THEM. Vocabularies are no longer authored — they are DERIVED from the formats'
 * `permissionDomain`s (patterns/deriveAuthVocabulary.js), so this script loads FORMAT modules.
 * Formats are not pure data: admin.format.js imports display components, the registry and
 * lazyComponent. So each one is bundled with esbuild under a resolver that keeps only the modules
 * permissions can possibly live in — other `*.format.js` files, `*.domain.js` constants — and
 * STUBS everything else with a Proxy. A display component cannot contribute a verb, so dropping it
 * loses nothing and keeps React and the theme tree out of a data dump.
 *
 * `@availabs/dms` is not `type: module`, so the bundle is handed to Node as a `data:` URL rather
 * than written to disk.
 */

import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import * as esbuild from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))

// The built-ins, by the pattern_type they register under (patterns/index.js). `instance` names the
// format for the row kind that IS the pattern — its own domain is `self`, its children descendants.
const BUILT_INS = {
    page:     { formats: ['src/patterns/page/page.format.js'] },
    datasets: { instance: 'src/patterns/datasets/datasets.format.js' },
    auth:     { formats: ['src/patterns/auth/auth.format.js'], publicRead: true },
    admin:    { formats: ['src/patterns/admin/admin.format.js'], publicRead: true },
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
 * each stubbed path is given a module that exports `default` plus every name any format asks of it.
 */
const KEEP = /\.(format|domain|childRefs)(\.js)?$|deriveAuthVocabulary\.js$/
const STUB_NAMES = ['lazyComponent', 'listPatternTypes', 'registerFormats']

const stubPlugin = {
    name: 'permissions-only',
    setup(build) {
        build.onResolve({ filter: /.*/ }, (args) =>
            (args.kind === 'entry-point' || KEEP.test(args.path)) ? null : { path: args.path, namespace: 'stub' })
        build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
            contents: 'const noop = () => undefined;\nexport default noop;\n'
                + STUB_NAMES.map(n => `export const ${n} = () => [];`).join('\n'),
            loader: 'js',
        }))
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

const { deriveAuthVocabulary, deriveDmsEnvVocabulary } = await loadModule(resolve(here, '..', 'src/patterns/deriveAuthVocabulary.js'))
const { PATTERN_ROW_DOMAIN } = await loadModule(resolve(here, '..', 'src/patterns/patternRow.domain.js'))

const derive = async ({ formats = [], instance, publicRead }) => {
    const loaded = []
    for (const rel of formats) loaded.push(pick(await loadModule(resolve(here, '..', rel))))
    const inst = instance ? pick(await loadModule(resolve(here, '..', instance))) : undefined
    const vocabulary = deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, instance: inst, formats: loaded })
    if (publicRead) vocabulary.publicRead = true
    return vocabulary
}

const out = {}
for (const [type, def] of Object.entries(BUILT_INS)) {
    out[type] = { vocabulary: await derive(def) }
}
for (const [type, rel] of Object.entries(CHILD_REFS)) {
    out[type] = { ...(out[type] || {}), childRefs: pick(await loadModule(resolve(here, '..', rel))) }
}
// ---- ROW-KIND declarations, keyed `:<kind>` ----------------------------------------------------
//
// A dmsEnv is NOT a pattern type. It is a child of the site that happens to be the ancestor of
// every source (`{env}|{name}:source`), so its vocabulary cannot come from the pattern registry —
// it is derived from the one format that describes it and stamped onto the env ROWS.
//
// The `:` prefix is what keeps this out of the pattern map: a `pattern_type` is never empty and
// never starts with `:`, so `migrate-row-auth.js` pass 1 skips these and pass 1b claims them. It
// also reads like the type suffix it stamps.
const adminMod = await loadModule(resolve(here, '..', 'src/patterns/admin/admin.format.js'))
if (adminMod.dmsEnvFormat) {
    out[':dmsenv'] = { vocabulary: deriveDmsEnvVocabulary(adminMod.dmsEnvFormat) }
}
// The SITE row, for the same reason and in the same shape. It is the ROOT of every chain, so the
// verbs that govern it are its OWN (`self`) and the verbs of the rows beneath it — patterns,
// themes, tenants, envs — are its `descendants`. Without this the site row carries no declaration
// at all, its grants expand to nothing structural, and the field rules that say "`tenants` needs
// manage-tenants" have nowhere to be read from. Kind auth reads those verbs off the ADMIN PATTERN
// row instead, which is a sibling of what it is judging; see unified-auth-api.md Phase 4.
if (adminMod.default) {
    out[':site'] = { vocabulary: deriveDmsEnvVocabulary(adminMod.default) }
}

// A host app's own types: `--extra <file>`, a FORMAT module now, named by the file's basename
// before the first dot, so `qa.format.js` registers under `qa`.
for (const rel of extras) {
    const file = resolve(process.cwd(), rel)
    const type = file.split('/').pop().split('.')[0]
    const mod = await loadModule(file)
    if (/\.childRefs\.js$/.test(file)) {
        out[type] = { ...(out[type] || {}), childRefs: pick(mod) }
    } else {
        out[type] = { ...(out[type] || {}),
            vocabulary: deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, formats: [pick(mod)] }) }
    }
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n')
