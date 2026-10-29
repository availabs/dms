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
 * HOW IT LOADS THEM. `@availabs/dms` is not `type: module`, so Node reads its `.js` as CommonJS and
 * a plain `import` of a vocabulary file fails on `export`. Rather than add a bundler to a data
 * dump, each file is read as text and imported as a module via a `data:` URL. That works because a
 * vocabulary module is PURE DATA with no imports of its own — which `tests/test-auth-vocabulary.js`
 * asserts, so this stays true.
 */

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// The built-ins, by the pattern_type they register under (patterns/index.js).
const BUILT_INS = {
    page:     'src/patterns/page/page.authVocabulary.js',
    datasets: 'src/patterns/datasets/datasets.authVocabulary.js',
    auth:     'src/patterns/auth/auth.authVocabulary.js',
    admin:    'src/patterns/admin/admin.authVocabulary.js',
}

// Which of a type's rows own other rows. Only declared where a type actually owns something.
const CHILD_REFS = {
    page:     'src/patterns/page/page.childRefs.js',
    datasets: 'src/patterns/datasets/datasets.childRefs.js',
}

async function loadVocabulary(file) {
    const src = await readFile(file, 'utf8')
    if (/^\s*import\s/m.test(src)) {
        throw new Error(`${file} has an import — a vocabulary module must be pure data (see this script's header)`)
    }
    const mod = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'))
    return mod.default ?? Object.values(mod)[0]
}

const args = process.argv.slice(2)
const extras = []
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--extra') extras.push(args[++i])
    else { console.error(`Unknown argument: ${args[i]}`); process.exit(1) }
}

const out = {}
for (const [type, rel] of Object.entries(BUILT_INS)) {
    out[type] = { vocabulary: await loadVocabulary(resolve(here, '..', rel)) }
}
for (const [type, rel] of Object.entries(CHILD_REFS)) {
    out[type] = { ...(out[type] || {}), childRefs: await loadVocabulary(resolve(here, '..', rel)) }
}
// A host app's own types: `--extra <file>`, named by the file's basename before the first dot, so
// `qa.authVocabulary.js` registers under `qa`.
for (const rel of extras) {
    const file = resolve(process.cwd(), rel)
    const type = file.split('/').pop().split('.')[0]
    const isChildRefs = /\.childRefs\.js$/.test(file)
    out[type] = { ...(out[type] || {}),
        [isChildRefs ? 'childRefs' : 'vocabulary']: await loadVocabulary(file) }
}

process.stdout.write(JSON.stringify(out, null, 2) + '\n')
