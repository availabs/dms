# Page-delete lifecycle hook — close the `reports_snap_2` orphan hole at its source

**Status 2026-09-04: SCOPED, not started.** This is a from-scratch scoping pass — no code
written yet. Written in response to Ryan re-reporting the orphan bug biting the new
`/npmrds/reports/list` page (which has no client-side band-aid available), and asking for
"the real solution," not another band-aid.

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

## Proposed change

### 1. New page-kind branch in `deleteData`'s per-row dispatch (dms.controller.js:1028-1032)

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

### 2. `cascadePageDelete` — dispatch to an optional, deployment-registered hook

New function alongside `cascadeSourceDelete`/`cascadeViewDelete`. Unlike those, it has **no
built-in knowledge** of what to clean up — that's app-specific — it only looks up and invokes a
hook the deployment registered at boot, wrapped in try/catch so a hook failure can never roll back
or block the page's own deletion (same "never breaks the primary action" guarantee the superseded
sketch already called for, just enforced server-side and covering every caller):

```js
async function cascadePageDelete(row, userId, reqMeta) {
  const hook = getPageDeleteHook(); // null if the deployment didn't register one
  if (!hook) return;
  try {
    await hook(row, { userId, reqMeta, dms_db, resolveTable, dbType, splitMode });
  } catch (e) {
    console.error(`[page-delete-hook] failed for ${row.app}/${row.type}#${row.id}: ${e.message}`);
  }
}
```

### 3. Registration — new registry, sibling to the existing `DMS_EXTRA_DATATYPES` pattern

Same proven shape (env var → bootstrap module, loaded once at server boot, wrapped in try/catch —
see `data-types/register-datatypes.js`'s header comment for why per-plugin isolation matters), but
as its **own** small registry — a page-delete hook isn't a dataType and doesn't fit the
`registerDatatype` contract (`{workers, routes, schedulables}`), which is unrelated to page
lifecycle:

- New env var, e.g. `DMS_PAGE_DELETE_HOOK`, pointing at a single JS module (mirrors
  `DMS_EXTRA_DATATYPES`'s Dockerfile wiring).
- `dms-server` boot (`packages/dms-server/src/index.js`, alongside where `DMS_EXTRA_DATATYPES` is
  loaded today) `require()`s it once; `getPageDeleteHook()` returns the loaded function or `null`.
- The hook module lives in **`dms-template`, not `src/dms`** — this is app-specific behavior, not a
  library capability. Suggested home: `data-types/register-page-delete-hook.js` (or a new sibling
  `hooks/` dir if `data-types/` feels like the wrong category — open question below). It receives
  every deleted page row across every app, so it must self-filter:
  ```js
  module.exports = async function onPageDeleted(row, ctx) {
    if (row.app !== 'npmrdsv5') return; // narrow to the site(s) that actually need this
    // resolve the reports_snap_2 split table via ctx.resolveTable(...) and delete the row
    // whose data->>'report_id' = String(row.id), using ctx.dms_db directly.
  };
  ```
- Zero behavior change for every other deployment: no env var set → `getPageDeleteHook()` returns
  `null` → the new dispatch branch is a no-op, identical to today.

### 4. The transportny-side handler itself

Needs, at implementation time (not scoped in full detail here since the exact source/view ids
found during this session's research may have shifted): resolve `reports_snap_2`'s split table
via `ctx.resolveTable('npmrdsv5', 'reports_snap_2|2177440:data', ctx.dbType, ctx.splitMode,
<sourceId>)` and delete the row whose `data->>'report_id' = row.id`. Re-verify the current
source/view ids (`2177438`/`2177440` as of this session) against the dev DB before writing this.

## Files requiring changes

- `src/dms/packages/dms-server/src/routes/dms/dms.controller.js` — `cascadePageDelete` + dispatch
  branch + `getPageDeleteHook`/registration storage.
- `src/dms/packages/dms-server/src/index.js` — load `DMS_PAGE_DELETE_HOOK` at boot, same
  try/catch-isolation discipline as the existing `DMS_EXTRA_DATATYPES` load.
- New file in `dms-template` (not `src/dms`) — the actual `reports_snap_2` cleanup hook.
- Dockerfile / deploy config — set `DMS_PAGE_DELETE_HOOK` to the new file's path.
- `packages/dms-server/tests/test-delete-cascade.js` — extend with a page-delete-hook case (this is
  the existing regression suite for the sibling source/view fix; same graph-harness pattern
  applies).

## Testing checklist

- [ ] New/extended server test: register a hook via the test harness, delete a matching page,
      assert the hook was invoked with the right row.
- [ ] Regression: a throwing hook does not prevent the page row from being deleted (transaction
      still commits).
- [ ] Regression: deleting a page with no hook registered behaves identically to today — existing
      suite should already cover this; confirm no new failures.
- [ ] Regression: run the existing `test:delete-cascade` suite — still 11/11 (this touches the same
      function and dispatch loop).
- [ ] Regression: no legacy-fixture type in the test suite happens to end in the literal string
      `|page` and get mis-dispatched (guard against a false-positive match).
- [ ] Live: create a test report with a `reports_snap_2` row, delete it via (a) the admin UI's
      Delete Page and (b) `dms page delete` — confirm the catalog row disappears both ways.
- [ ] Live: confirm `/npmrds/reports/list` stops showing a just-deleted test report immediately,
      without relying on `prune_report_snap_orphans.mjs`.

## Open questions for Ryan

1. OK to add a new env var (`DMS_PAGE_DELETE_HOOK`) and touch `dms-server`'s boot sequence — a
   shared-library change affecting every DMS deployment, even though the hook itself is opt-in and
   no-ops for anyone who doesn't set it? Same category of change the 2026-09-01 note flagged as
   "pending appetite for a shared-library-touching change."
2. Single hook function (self-filtering by `row.app`) vs. a small `{app: handler}` map registered
   up front? Single-function is less new code; a map is cleaner if a second app ever needs its own
   page-delete cleanup.
3. Where should the transportny-side handler module live — `data-types/` (reuses the existing
   directory even though this isn't a dataType) or a new sibling directory? Leaning new directory
   since `data-types/CLAUDE.md`'s whole contract (`{workers, routes, schedulables}`, DAMA source
   `type` keying) is genuinely unrelated.

## Related, explicitly out of scope

- **Component/section rows are also not deleted when a page is deleted** — `deletePage` only
  removes the page row itself and local React state; child `{pattern}|component` rows are left
  behind too. Same family of bug, but a separate, pre-existing gap unrelated to `reports_snap_2` —
  flagging here so it isn't lost, not proposing to fix it in this task.
