# DMS CLI refresh — type-system refactor + per-app tables + dmsEnv ownership

## Objective

Bring `packages/dms/cli/` back in line with the current server. The CLI was written before three major breaking changes landed — type-system refactor (dropping `doc_type`), per-app split tables (`dms_{app}` schemas / `data_items__{app}`), and dmsEnv ownership of sources — and as a result several commands are broken or silently produce stale output on real databases.

## Scope

**In scope**
- Update type resolution throughout `src/commands/*` and `src/utils/data.js` to use `{parent}:{instance}|{rowKind}` — no more `{app}+{doc_type}` / `{doc_type}|source`.
- Stop reading `data.doc_type`. Derive the slug/instance from the `type` column via `getInstance()` / `parseRowType()` from `utils/type-utils`.
- Route every controller call through the app-namespaced falcor path (`dms.data[app].byId[ids][attrs]` and `dms.data[app+type].{length,byIndex,...}`) so the CLI works against per-app split-mode databases.
- Rewrite `dataset list` to resolve sources via `pattern.dmsEnvId → dmsEnv.sources` (with a fallback to `pattern.sources` for legacy patterns). Today it walks the pattern's `sources` array directly.
- Fix `dataset dump` to use the split-table type (`{sourceInstance}|{viewId}:data`) — today it requires `source.doc_type`, errors out when missing, and even when present queries the wrong type.
- Fix `dataset query` the same way.
- Fix `site tree` / `site patterns` on sites whose patterns live in app-scoped tables (reproducer: against the running local server, `DMS_HOST=http://localhost:3001 DMS_APP=asm DMS_TYPE=nhomb dms site tree` returns `Error: No site found for asm+nhomb`, but `asm+nhomb:site` does have a row with id 1059746).
- Update `src/utils/data.js::getPageType` / `getDatasetType` / related helpers to use the new type scheme.
- Update `docs/TYPES.md` and `docs/README.md` so the documented type strings match reality.
- Update `test/seed.js` + fixtures so tests exercise the new types — and add regression tests against a site that has a dmsEnv (currently all test fixtures are pre-refactor).

**Out of scope**
- Adding new commands. This is a surgical update, not a feature pass.
- Porting the CLI away from the shared `api/` imports. It's fine to keep using them.
- Legacy-format read support beyond what's needed to not crash on mixed databases. The server still honors old-format types for backward compat (see `CLAUDE.md` Legacy format section); the CLI can lean on that.
- The companion MCP server (tracked separately in `todo.md`).

## Current State — Known Broken Surfaces

### 1. `doc_type` is baked into command output and type resolution

`grep -rn "doc_type" src/` returns 18 hits across `commands/{pattern,site,dataset}.js`, `formatters/tree.js`, `utils/data.js`. Examples:

- `src/utils/data.js:188` — `getPageType()` reads `data.doc_type || (data.base_url || '').replace(/\//g, '')` and returns `${app}+${docType}`. The new page type is just `${pattern.instance}|page`.
- `src/commands/dataset.js:199` — `dataset dump` errors out with `Source has no doc_type — cannot determine data items type` when a source has no `doc_type`. New-format sources never have `doc_type`; the slug lives in `source.type` (`{dmsenv}|{slug}:source`).
- `src/formatters/tree.js:196` — tree node labels fall back to `data.doc_type || '?'`, which renders '?' on every new-format row.

### 2. Routes don't pass `app`

`src/client.js` is a generic Falcor client so it doesn't care, but the commands themselves call paths like `['dms','data','byId',id,atts]` (legacy) in several places. Per-app split mode requires `['dms','data',app,'byId',id,atts]`. Today's database `dms-mercury-3` uses per-app mode (see `DMS_DB_ENV=dms-mercury-3` in `.env`).

Reproducer: `dms raw list asm` returns `[]` even though the `asm` app has dozens of rows (confirmed directly via falcor:
`curl -sG 'http://localhost:3001/graph' --data-urlencode 'paths=[["dms","data","asm+nhomb:site","length"]]' --data-urlencode 'method=get'` returns `{"length":1}`).

### 3. Sources now live under dmsEnvs

`src/commands/dataset.js::list()` reads `pattern.data.sources` directly. But modern patterns store source ownership on a `dmsEnv` row referenced by `pattern.dmsEnvId`. Observed on `asm+nhomb`:

```
pattern id=2060513 type=nhomb|datasets:pattern  dmsEnvId=2060502
dmsEnv id=2060502 type=nhomb|alex_data_env:dmsenv
  data.sources=[{id:1066383, ref:asm+alex_data_env|source}, {id:2060573, ref:asm+alex_data_env|source}]
```

`dataset list` on this pattern must follow `dmsEnvId` to the dmsEnv row and list its `sources`.

### 4. Split-table dataset rows need `:data` types

The new dataset row type is `{source_instance}|{view_id}:data` (see `src/dms/CLAUDE.md` — the `:data` suffix triggers split-table routing). `dataset dump` currently queries `${app}+${doc_type}` as the type key and reads from `data_items`, which for per-app split mode is either empty or the wrong table. The server already exposes these under `dms.data[app+type].byIndex` with per-type split tables — the CLI just needs to build the right type string.

### 5. Page types

Pages are now `{pattern_instance}|page` (no UUID, no `doc_type`). `getPageType()` needs to read the pattern's `type` column, extract the instance via `getInstance()`, and build `{instance}|page`.

### 6. Section type

Sections are now `{pattern_instance}|component` (the old name was `cms-section`). The CLI docs in `cli/CLAUDE.md` still say `{app}+{doc_type}|cms-section`. Update both the code and the doc.

## Proposed Changes

### Phase 1 — Type resolution helpers

Introduce `src/utils/types.js` (new) that wraps the shared `utils/type-utils.js` for CLI use:

```js
// src/utils/types.js
import { getInstance, parseRowType, buildType, nameToSlug } from '../../../../utils/type-utils.js';

export function patternInstance(patternRow)    { return getInstance(patternRow?.type); }
export function pageTypeFor(patternRow)        { return `${patternInstance(patternRow)}|page`; }
export function componentTypeFor(patternRow)   { return `${patternInstance(patternRow)}|component`; }
export function sourceInstance(sourceRow)      { return getInstance(sourceRow?.type); }
export function viewDataTypeFor(sourceRow, viewId) {
  return `${sourceInstance(sourceRow)}|${viewId}:data`;
}
export { getInstance, parseRowType, buildType, nameToSlug };
```

Every `commands/*.js` file imports from here. No more hand-assembled `${app}+${doc_type}|...` strings.

### Phase 2 — App-scope every falcor path

Audit `src/commands/*` and `src/utils/data.js`. Every `getByPath(['dms','data','byId', ...])` becomes `getByPath(['dms','data', app, 'byId', ...])`. Length/byIndex calls already key on `app+type` so they're fine — but double-check.

### Phase 3 — `dataset list` via dmsEnv

Rewrite `src/commands/dataset.js::list()`:

1. Fetch the pattern row with `data`.
2. Read `pattern.data.dmsEnvId`. If present, fetch that dmsEnv row and read `dmsEnv.data.sources`.
3. If absent, fall back to `pattern.data.sources` (legacy patterns).
4. Resolve each source ref → row, emit list output using `sourceInstance()` for the slug.

### Phase 4 — `dataset dump` / `dataset query`

Both commands need:

1. Fetch the source row.
2. Pick a view — by `--view <id>` flag, or default to the latest in `source.data.views`.
3. Build the data type with `viewDataTypeFor(sourceRow, viewId)`.
4. Falcor-fetch `dms.data[app+type].length` + `byIndex` and emit rows.

Delete the `Source has no doc_type` error path — if the source has no views, report that instead.

### Phase 5 — `site tree` / `site patterns` / `pattern *`

- `site patterns` must list by `type LIKE '{siteInstance}|%:pattern'`. Today it tries to match on `doc_type`.
- `page list` keys by `pageTypeFor(patternRow)` — one `dms.data[app+type]` fetch rather than the doc_type scramble.
- `section list` keys by `componentTypeFor(patternRow)`.
- `site tree` formatter reads `type` column directly; drop `data.doc_type || '?'` fallback from `formatters/tree.js:196` (replace with `getKind(row.type)` or similar).

### Phase 6 — Docs

- `cli/CLAUDE.md` — rewrite the "Type Resolution" section to match the new scheme.
- `cli/docs/TYPES.md` — update every example.
- `cli/docs/README.md` / `EXAMPLES.md` — update the example command outputs.

### Phase 7 — Tests

- `test/seed.js` — generate fixtures using the new type scheme (dmsEnv + new source types + split-table data rows).
- `test/run.js` — add a regression test that runs `dms dataset list` against a pattern with a `dmsEnvId` and expects the source from the dmsEnv to appear.
- Add a regression test for `raw list asm` against a per-app split-mode database.

## Files Requiring Changes

**New**
- `src/dms/packages/dms/cli/src/utils/types.js` — type-resolution helpers.

**Modified**
- `src/dms/packages/dms/cli/src/commands/raw.js` — app-namespaced routing.
- `src/dms/packages/dms/cli/src/commands/site.js` — drop `doc_type`, use new types.
- `src/dms/packages/dms/cli/src/commands/pattern.js` — drop `doc_type`.
- `src/dms/packages/dms/cli/src/commands/page.js` — page type resolution.
- `src/dms/packages/dms/cli/src/commands/section.js` — `component` not `cms-section`.
- `src/dms/packages/dms/cli/src/commands/dataset.js` — dmsEnv traversal, split-table type for dump/query.
- `src/dms/packages/dms/cli/src/utils/data.js` — `getPageType` / `getDatasetType` / helpers.
- `src/dms/packages/dms/cli/src/formatters/tree.js` — drop `doc_type` fallback.
- `src/dms/packages/dms/cli/CLAUDE.md` — type resolution section.
- `src/dms/packages/dms/cli/docs/{README,TYPES,EXAMPLES}.md` — examples + type strings.
- `src/dms/packages/dms/cli/test/seed.js` — fixtures to new scheme.
- `src/dms/packages/dms/cli/test/run.js` — add regressions.

## Testing Checklist

Against the local dms-server + dms-mercury-3 database (same one running on localhost:3001 with `asm+nhomb`):

- [ ] `dms site tree` against `asm+nhomb` — returns site + patterns with names and types, not "No site found".
- [ ] `dms raw list asm` — returns non-empty list; matches `dms.data.asm+nhomb:site.length` count shape.
- [ ] `dms pattern list` on `asm+nhomb` — lists all 7 patterns (ids 1059748, 1066262, 1066267, 1066382, 1439872, 1676371, 2060513) without '?' placeholders.
- [ ] `dms dataset list` against the `datasets` pattern (id 2060513, `dmsEnvId=2060502`) — shows the "Songs" source (id 2060573) and the legacy alex_data source (id 1066383) from the dmsEnv.
- [ ] `dms dataset dump <songs-source-id>` — returns view metadata including `data.file.dl_url` for each view (the file_upload source we just populated).
- [ ] `dms page list` on a pattern that has pages — no `doc_type` errors.
- [ ] `dms section list <page-id>` — returns rows under `{pattern_instance}|component` type.
- [ ] Integration test suite (`npm test`) passes after fixture + command updates.

## Related

- `src/dms/planning/completed.md` — "Type system refactor" entry (the change that prompted this refresh).
- `src/dms/CLAUDE.md` — current type scheme reference.
- `src/dms/packages/dms/cli/CLAUDE.md` — architecture of the CLI, source of the broken examples.
- `src/dms/packages/dms-server/CLAUDE.md` — per-app split-mode spec.
- `src/dms/planning/tasks/current/dms-mcp-server.md` — MCP server will inherit whatever shape the CLI ends up with; schedule this refresh before the MCP work so both can share the type helpers.
