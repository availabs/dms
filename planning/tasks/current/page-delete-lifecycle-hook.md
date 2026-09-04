# Page-delete lifecycle hook — close the `reports_snap_2` orphan hole at its source

**Status 2026-09-04: CODE + TESTS DONE.** Written in response to Ryan re-reporting the orphan bug
biting the new `/npmrds/reports/list` page (which has no client-side band-aid available), and
asking for "the real solution," not another band-aid. Scoped, then implemented same session after
Ryan reviewed the design and asked for two additions (see "Decisions locked in" below). All new/
existing server tests pass on SQLite (`npm test`, 21/21 + the extended 16/16 delete-cascade suite).
**Remaining**: PG run not possible this session (no docker socket permission in this sandbox — see
Testing checklist); live verification against a real npmrdsv5 page/deploy not done (see Testing
checklist) — this repo's Delete Page / CLI page-delete flows should be exercised against a real
dev DB before calling this fully verified end-to-end.

## Objective

Give `deleteData`'s existing per-row cascade dispatch a generic, opt-in extension point so a
deployment (dms-template) can register a side effect that runs whenever a page row is deleted —
closing the `reports_snap_2` orphan hole **at its root**, for every caller (admin UI, CLI `page
delete` / `raw delete`, any future script), not just the one React component that happens to be
wired up today.

## Background / confirmed root cause

- The admin UI's delete action is `PatternPagesEditor`'s `deletePage`
  (`packages/dms/src/patterns/admin/pages/patternEditor/pages/pagesEditor.jsx:824-840`). It calls
  `apiUpdate({..., requestType:'delete'})` → `dmsDataEditor` → the Falcor route
  `['dms','data','delete']`.
- The CLI's `dms page delete` (`packages/dms/cli/src/commands/page.js:360`) and `dms raw delete`
  (`packages/dms/cli/src/commands/raw.js:191`) call **the exact same Falcor route** — confirmed by
  direct grep. A fix scoped to the admin UI component would not cover either of these; a
  server-side fix in the shared handler covers all three (and anything else that ever calls this
  route) at once.
- Server-side, that route dispatches to `deleteData`
  (`packages/dms-server/src/routes/dms/dms.controller.js:998-1041`), which already snapshots each
  doomed row's real `type` and, per row, dispatches a cascade by `kind` (lines 1028-1032):
  ```js
  const kind = typeof row.type === 'string' && row.type.includes(':') ? getKind(row.type) : null;
  if (kind === 'source') await cascadeSourceDelete(row, userId, reqMeta);
  else if (kind === 'view') await cascadeViewDelete(row, userId, reqMeta);
  ```
  This is precedent, not a hypothetical — it was added 2026-08-05 for exactly this class of bug
  (see `delete-cascade-source-view-orphans.md`, done + prod-repaired same day), with the explicit
  design principle **"server fix covers all callers"** (that task's own Scope section: "client-side
  changes (server fix covers all callers)").
- A page's type is `{pattern}|page` — no colon — so `row.type.includes(':')` is false, `kind`
  resolves to `null`, and neither existing branch fires. Confirmed via `db/type-utils.js`'s
  `parseRowType`: `getKind('some_pattern|page')` **does** correctly resolve to `'page'` if it's
  ever called (see the doc comment's own worked example, `type-utils.js:17`) — it's the
  `includes(':')` guard that stops `getKind` from running at all for this row. That guard exists to
  keep genuinely-legacy (pre-type-refactor, colon-less, UUID-based) types out of cascade dispatch;
  it incidentally also blocks the *current*, by-design colon-less `page`/`component` kinds, which
  never had cascade behavior defined until now — so the gap was never exercised, not fixed.
- `reports_snap_2` is an ordinary DMS split (`:data`) dataset row type — app `npmrdsv5`, type
  `reports_snap_2|2177440:data`, physical table
  `dms_npmrdsv5.data_items__s2177438_v2177440_reports_snap_2` — one row per report page, keyed by
  `data.report_id = <page id>`. Rows are written by transportny's own client code
  (`ReportRouteList/useReportRow.js`, `ReportPageHeader/useReportCatalogRow.js`) via the generic
  `dms.data.edit` JSONB-merge path. **Nothing in `@availabs/dms` core knows this relationship
  exists** — by design, it's app-specific business data, not a DMS structural concept like
  source→view.

## Why the existing mitigations don't cover the new page

Two mitigations already exist, both recorded in
`planning/transportny/tasks/current/routes-reports-users-mesh.md`'s 2026-09-01 entry:

1. **`checkIdsExist`** (`packages/dms/src/api/index.js`) — a batched existence check woven into
   `ReportPickerModal`'s `useReportSearch.js` fetch hook. It's a client-side interception point
   specific to that one bespoke React data-fetching hook.
2. **`prune_report_snap_orphans.mjs`** — a manual/periodic cleanup script (dry-run by default).

The new `/npmrds/reports/list` page is built on native DMS primitives (a Card/Spreadsheet section
bound straight to `reports_snap_2` via UDA) — there is no per-row client hook to attach (1) to
without writing bespoke fetch code for that one page, which would undercut the reason it was built
on native primitives in the first place. Only (2), a periodic sweep that doesn't run automatically,
currently protects it.

## Superseded design (2026-09-01 sketch)

`routes-reports-users-mesh.md` originally sketched a different, **client-side** fix: an optional
`themeFromContext?.admin?.onPageDeleted?.(page, {...})` call inside `pagesEditor.jsx`'s
`deletePage`, wrapped in try/catch, deferred as "a shared-library-touching change" pending
appetite. Superseding it with the server-side design below because:

- It only fires for deletes that go through that one React component — CLI `page delete`/`raw
  delete` (used by the one-off cleanup scripts already run for this exact bug, and by any future
  script) would silently bypass it, reintroducing the same class of orphan through a different
  door.
- It mixes a data-lifecycle side effect into `ThemeContext`, which is otherwise pure
  styling/layout/component config — grepped every `src/themes/*/theme.jsx` for any existing
  function-valued (non-CSS-class) key: zero precedent for a behavior hook living there.
- There's an already-shipped, better-fitting precedent one function away (`deleteData`'s own
  cascade dispatch) that was purpose-built for "an orphan hole created by delete" and explicitly
  designed to cover every caller uniformly.

Both scoping passes independently landed on "a hook" as the shape — this doc keeps that instinct
but moves it to the layer that actually closes the hole for every delete path, not just one.

## Decisions locked in 2026-09-04 (Ryan's review of the initial scope)

1. **Yes, add `DMS_PAGE_DELETE_HOOK` and touch `dms-server`'s boot sequence.** Approved after
   walking through the exact mechanics against the already-shipped `DMS_EXTRA_DATATYPES`
   precedent (same shape: env var → file path → `require()` at boot, try/catch-isolated) — this
   isn't a new pattern, it's a second use of one already running in production.
2. **Single self-filtering hook function**, not an `{app: handler}` map — confirmed after walking
   through a concrete example delete end-to-end. Less new server-side plumbing; revisit a map only
   if a second app ever needs its own page-delete side effect.
3. **New sibling directory (`hooks/`), not `data-types/`** — a page-delete hook isn't a dataType
   and doesn't fit that directory's `{workers, routes, schedulables}` / DAMA-source-type-keying
   contract.
4. **Naming split, added by Ryan**: the exported function stays literally `onPageDeleted` (the
   generic contract name any `DMS_PAGE_DELETE_HOOK` implementation fulfills), but the **file** the
   specific implementation lives in is named unambiguously for what it's specific to:
   `hooks/npmrds_report_page_delete_hook.js`. A reader should be able to tell from the filename
   alone that this is NPMRDS-report-specific, even though the mechanism itself
   (`cascadePageDelete`, the dispatch branch, the loader) stays fully generic and reusable by any
   future page-delete side effect.
6. **Dockerfile/env var must stay fully generic, corrected by Ryan** (initial implementation
   missed this): `DMS_PAGE_DELETE_HOOK` originally pointed straight at
   `hooks/npmrds_report_page_delete_hook.js`, leaking a project-specific name into the Dockerfile —
   inconsistent with `DMS_EXTRA_DATATYPES`, which always points at the generic
   `data-types/register-datatypes.js` bootstrap, never at a specific plugin file. Fixed by adding
   `hooks/register_page_delete_hooks.js` as the actual env-var target — a small `HANDLERS` list
   (mirroring `register-datatypes.js`'s `PLUGINS` list and its per-plugin try/catch isolation
   rationale) that requires the npmrds-specific file and composes it into the one function
   `dms.controller.js` calls. The Dockerfile and dms-server's boot loader now never see the string
   "npmrds" anywhere.
5. **Consolidate the already-3×-duplicated constants, added by Ryan**: `npmrdsv5` (app),
   `npmrds_sub` (pattern), and `reports_snap_2`'s source id `2177438` / view id `2177440` were
   independently hardcoded in `convert_old_reports_lib/config.py`, `report_build.mjs`, and
   `prune_report_snap_orphans.mjs` before this task — a real, pre-existing drift risk (if the
   source/view is ever recreated, e.g. a `--replace` republish, all three would silently go stale
   independently). Rather than add a 4th hardcoded copy in the new hook, all four now read the same
   canonical `hooks/reports_snap_ids.json`.

## Implemented design

### 1. New page-kind branch in `deleteData`'s per-row dispatch (dms.controller.js)

Gated narrowly — not by loosening the legacy-colon-less guard, but by checking specifically for
the literal `page` kind, which no legacy (pre-refactor) type used:

```js
for (const row of doomed) {
  const kind = typeof row.type === 'string' && row.type.includes(':') ? getKind(row.type) : null;
  if (kind === 'source') await cascadeSourceDelete(row, userId, reqMeta);
  else if (kind === 'view') await cascadeViewDelete(row, userId, reqMeta);
  else if (typeof row.type === 'string' && row.type.endsWith('|page')) {
    await cascadePageDelete(row, userId, reqMeta);
  }
}
```

### 2. `cascadePageDelete` + module-level hook registry (dms.controller.js)

`cascadePageDelete` has **no built-in knowledge** of what to clean up — it only looks up and
invokes a hook the deployment registered at boot, wrapped in try/catch so a hook failure can never
roll back or block the page's own deletion:

```js
let _pageDeleteHook = null;
function setPageDeleteHook(fn) { _pageDeleteHook = fn; }
function getPageDeleteHook() { return _pageDeleteHook; }
// ...
async function cascadePageDelete(row, userId, reqMeta) {
  const hook = getPageDeleteHook();
  if (!hook) return;
  try {
    await hook(row, { userId, reqMeta, dms_db, resolveTable, jsonField, dbType, splitMode });
  } catch (e) {
    console.error(`[page-delete-hook] failed for ${row.app}/${row.type}#${row.id}: ${e.message}`);
  }
}
```

The hook registry is **module-level, not per-controller-instance** — deliberate, not an oversight.
`dms.controller.js`'s own `defaultController` and `dms.route.js`'s `createController(...)` (its
module-level default parameter) are two *separate* controller instances even with the same
`dbName`, so a per-instance hook (like `_sourceIdCache`) could silently miss whichever instance
actually serves live requests. `setPageDeleteHook`/`getPageDeleteHook` are exported on
`module.exports` (module singleton) so exactly one hook applies regardless of which instance's
`deleteData` runs. Tests call `setPageDeleteHook` directly and reset it to `null` in a `finally`.

`ctx` includes `jsonField` (the controller's own `dbType`-aware JSON-column-extraction closure) so
the hook doesn't need to reimplement Postgres-vs-SQLite JSON SQL itself.

### 3. Registration (index.js + Dockerfile)

Same shape as `DMS_EXTRA_DATATYPES`:

```js
// index.js, alongside the existing DMS_EXTRA_DATATYPES load
const pageDeleteHookPath = process.env.DMS_PAGE_DELETE_HOOK;
if (pageDeleteHookPath) {
  try {
    const onPageDeleted = require(require('path').resolve(pageDeleteHookPath));
    require('./routes/dms/dms.controller').setPageDeleteHook(onPageDeleted);
  } catch (e) {
    console.error(`[page-delete-hook] Failed to load DMS_PAGE_DELETE_HOOK=${pageDeleteHookPath}:`, e.message);
  }
}
```

Dockerfile: `COPY hooks ./hooks` (new, alongside the existing `COPY data-types ./data-types`) +
`DMS_PAGE_DELETE_HOOK=/app/hooks/register_page_delete_hooks.js` env var — **not** a path to the
npmrds-specific file directly (see the "generic bootstrap" point below).

### 4. Generic bootstrap (`hooks/register_page_delete_hooks.js`)

`DMS_PAGE_DELETE_HOOK` must point at a generic file, same as `DMS_EXTRA_DATATYPES` always points
at `data-types/register-datatypes.js` and never at a specific plugin. This file is that generic
entry point — the Dockerfile and dms-server's boot loader never see a project-specific name:

```js
const HANDLERS = [
  ['npmrds_report_page_delete', './npmrds_report_page_delete_hook'],
];
const loaded = [];
for (const [name, modulePath] of HANDLERS) {
  try { loaded.push([name, require(modulePath)]); }
  catch (e) { console.error(`[page-delete-hook] SKIPPED ${name} (${modulePath}): ${e.message}`); }
}
module.exports = async function onPageDeleted(row, ctx) {
  for (const [name, handler] of loaded) {
    try { await handler(row, ctx); }
    catch (e) { console.error(`[page-delete-hook] ${name} failed for ${row.app}/${row.type}#${row.id}: ${e.message}`); }
  }
};
```

Mirrors `register-datatypes.js`'s `PLUGINS` list shape and its stated rationale exactly: each
handler is required independently and invoked in its own try/catch, so one broken/throwing handler
can't take another down with it. Only one handler exists today; adding a second app's page-delete
side effect later is a one-line addition to `HANDLERS`, not a new mechanism.

### 5. The transportny-specific handler (`hooks/npmrds_report_page_delete_hook.js`)

```js
const { app: APP, reports_snap_source_id: REPORTS_SNAP_SOURCE_ID, reports_snap_view_id: REPORTS_SNAP_VIEW_ID } =
  require(path.join(__dirname, 'reports_snap_ids.json'));
const REPORTS_SNAP_TYPE = `reports_snap_2|${REPORTS_SNAP_VIEW_ID}:data`;

async function onPageDeleted(row, ctx) {
  if (row.app !== APP) return; // called for every app's page deletes; self-filter
  const { dms_db, resolveTable, jsonField, dbType, splitMode } = ctx;
  const resolved = resolveTable(APP, REPORTS_SNAP_TYPE, dbType, splitMode, REPORTS_SNAP_SOURCE_ID);
  if (!resolved.table.startsWith('data_items__')) return;
  await dms_db.promise(
    `DELETE FROM ${resolved.fullName} WHERE ${jsonField('data', 'report_id')} = $1;`,
    [String(row.id)]
  );
}
module.exports = onPageDeleted;
```

### 6. Constants consolidation (`hooks/reports_snap_ids.json`)

```json
{ "app": "npmrdsv5", "pattern": "npmrds_sub", "reports_snap_source_id": 2177438, "reports_snap_view_id": 2177440 }
```

Lives in `hooks/` (next to the hook, not in `scripts/npmrds-reports/` where the dev-side consumers
live) so it ships inside the Docker image with the hook that needs it at server-boot runtime — the
Dockerfile only copies `hooks/` and `data-types/`, not `scripts/`. The three dev-side consumers
each reach into it via a `REPO`-relative path instead (same convention `config.py` already used
for `vocabulary.json`/`colorBreaks.json` living inside a different directory than the script that
reads them):

- `convert_old_reports_lib/config.py` — `json.load()`, derives `DMS_ENV["DMS_APP"]`, `PATTERN`,
  `REPORTS_SNAP_TYPE`, `REPORTS_SNAP_TABLE` from it. Verified byte-identical output to the old
  hardcoded strings via a standalone module-exec check.
- `report_build.mjs` — same, derives `APP` (env-var override preserved), `PATTERN`,
  `REPORTS_SNAP_SOURCE_ID`/`VIEW_ID`/`TYPE`.
- `prune_report_snap_orphans.mjs` — same, derives `ENV.DMS_APP` (env-var override preserved),
  `PATTERN`, `CATALOG_SOURCE_ID`/`VIEW_ID`. Header comment also updated: this script is now
  explicitly a defense-in-depth backstop (hook failures are logged, never blocking; pre-existing
  orphans and any regression still need pruning) rather than the only mitigation.

## Files changed

- `src/dms/packages/dms-server/src/routes/dms/dms.controller.js` — module-level hook registry,
  `cascadePageDelete`, dispatch branch, `setPageDeleteHook` export.
- `src/dms/packages/dms-server/src/index.js` — `DMS_PAGE_DELETE_HOOK` boot loader.
- `src/dms/packages/dms-server/tests/test-delete-cascade.js` — new `testPageDeleteHook` (4 cases:
  no-hook-registered parity, hook invoked with the right row + working ctx helpers, a throwing hook
  doesn't block/roll back the delete, source/view dispatch unaffected by the new branch). 16/16
  passing (was 11/11).
- `hooks/package.json` (new) — `{"type":"commonjs"}`, mirrors `data-types/package.json`.
- `hooks/reports_snap_ids.json` (new) — the canonical constants.
- `hooks/register_page_delete_hooks.js` (new) — the generic bootstrap `DMS_PAGE_DELETE_HOOK`
  actually points at (mirrors `register-datatypes.js`).
- `hooks/npmrds_report_page_delete_hook.js` (new) — the actual, npmrds-specific cleanup hook,
  required by the bootstrap above rather than referenced directly by anything outside `hooks/`.
- `Dockerfile` — `COPY hooks ./hooks`, `DMS_PAGE_DELETE_HOOK` env var (pointed at the generic
  bootstrap file, not the npmrds-specific one), header-comment updates.
- `scripts/npmrds-reports/convert_old_reports_lib/config.py` — reads `hooks/reports_snap_ids.json`
  instead of its own hardcoded copy.
- `scripts/npmrds-reports/report_build.mjs` — same.
- `src/themes/transportny/qa_skills/tools/prune_report_snap_orphans.mjs` — same, plus header
  comment updated to reflect this fix landing.

## Testing checklist

- [x] New server test (`testPageDeleteHook`): register a hook via the test harness, delete a
      matching page, assert the hook was invoked with the right row and working `ctx` helpers.
- [x] Regression: a throwing hook does not prevent the page row from being deleted — confirmed via
      the error log line printing and the row still being gone.
- [x] Regression: deleting a page with no hook registered behaves identically to today.
- [x] Regression: `npm run test:delete-cascade` — 16/16 (was 11/11; source/view cases unaffected by
      the new page branch, confirmed via an explicit added case).
- [x] Regression: full `npm test` chain (sqlite, controller, graph, workflow, delete-cascade,
      schema-drift) — 21/21 (+ the 16/16 above), exit 0, no new failures.
- [x] Sanity: all 3 rewritten dev-side consumers produce byte-identical values to their old
      hardcoded strings (Python module-exec check; Node `--check` syntax checks on all edited/new
      JS files).
- [ ] PG run (`npm run test:pg`) — **not run this session**: no docker socket permission in this
      sandbox. The new SQL path reuses `jsonField`/`resolveTable`, both already proven correct on
      Postgres by the pre-existing source/view cascade code, so residual risk is low but unverified
      on this dialect specifically.
- [ ] Live: create a test report with a `reports_snap_2` row, delete it via (a) the admin UI's
      Delete Page and (b) `dms page delete` on a real npmrdsv5 deploy/dev DB — confirm the catalog
      row disappears both ways. Not done this session (VPN-gated dev DB; other sessions were
      concurrently active on this exact feature area — deferred rather than risk a collision).
- [ ] Live: confirm `/npmrds/reports/list` stops showing a just-deleted test report immediately.
- [ ] Deploy: `DMS_PAGE_DELETE_HOOK` env var + `hooks/` directory only take effect after a
      dms-server redeploy (same caveat as the sibling cascade fix and the `npm install`-breaks-
      running-server gotcha — a dev nodemon instance already running won't pick this up without a
      restart).

## Related, explicitly out of scope

- **Component/section rows are also not deleted when a page is deleted** — `deletePage` only
  removes the page row itself and local React state; child `{pattern}|component` rows are left
  behind too. Same family of bug, but a separate, pre-existing gap unrelated to `reports_snap_2` —
  flagging here so it isn't lost, not proposing to fix it in this task.
