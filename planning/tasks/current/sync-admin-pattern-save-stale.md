# Admin pattern editor: Save stays enabled after saving (sync on)

**Status:** FLAGGED 2026-09-28 — root-caused, not fixed.

## Objective

After clicking **save changes** on the Pattern Editor Overview tab (`/list/manage_pattern/:id/overview`),
the save bar stays "unsaved changes" and the button stays enabled until a hard refresh. The save itself
persists correctly. Fix it so the editor's `value` reflects the saved row immediately.

## Reproduction (live, 2026-09-28)

- `VITE_DMS_SYNC=1`, `shaun-test-app` / `test`, local dms-server on 3001, Vite on 5173.
- Pattern 54431 (`pfs_test`): rename → save. DB shows the new name (`dms raw get 54431`), but the
  `value` prop passed to `PatternSettingsEditor` still has the old name, so
  `isDirty = !isEqual(tmpValue, value)` (`patterns/admin/pages/patternEditor/default/settings.jsx:139`)
  stays true. (Test rename reverted after.)

## Root cause

The write and the post-save reload take **different paths**:

1. **Write** — `dmsDataEditor` (`api/index.js`) sees `sync.isLocal(app, 'pattern')` true (the
   `pattern` scope is bootstrapped), so it goes `LOCAL SYNC`: `sync.localUpdate(54431, …)` to IndexedDB
   under the row's real type `test|pfs_test:pattern`, then `/sync/push` (server accepts, rev bumps).
2. **Reload** — `apiUpdate` → `revalidate()` → `dmsDataLoader` for `shaun-test-app+pattern`.
   `loadFromLocalDB` → `sync.getItemsByAppType(app, 'pattern')` is an **exact** `[app, type]` index
   match; no row has type `pattern`, so it returns empty → "LOCAL empty, falling through to Falcor".
3. Falcor answers from its **in-memory cache** (no network request observed). The sync write path never
   invalidates Falcor, so the cached row is the pre-save one.

Server-side, `pattern` is effectively a wildcard over `*:pattern` rows; the local store can't express
that. So `pattern` is "local" for writes but never servable for reads.

### Why pages don't hit this

The page pattern loads with its exact stored type (`getInstance(pattern.type)` →
`render/spa/utils/index.js:430`, e.g. `pages|page`), so reads are served from the same IndexedDB rows
`localUpdate` just wrote — Falcor is never consulted. Pages also save through their own `EditWrapper`,
whose `dataSnapshot` optimistic merge (`dms-manager/wrapper.jsx`, `data.id === item.id`) patches `item`;
the Overview tab saves through `AdminContext.apiUpdate` (the outer list wrapper), whose `item` is not the
edited pattern, so that merge never applies. (Second point is from code reading, not verified live.)

With sync off, the plain Falcor write path invalidates its own cache — expected fine (not tested).

## Likely also affected (not tested)

Every other pattern-editor save through `AdminContext.apiUpdate`: Access (permissions + filters), Theme,
Format Manager. And any other type that `isLocal` claims but whose rows aren't stored under that exact
type string.

## Proposed fix (pick one or both)

1. **Backstop (small, general):** in `dmsDataEditor`'s sync branch, after `localUpdate`/`localCreate`/
   `localDelete`, invalidate Falcor for the touched ids (`['dms','data','byId', id]`), plus the
   `app+type` length/byIndex on create/delete — so any read that falls through to Falcor is fresh.
2. **Proper:** make the local read path serve `pattern` like the server does (match `*:pattern` rows —
   would need a prefix/suffix lookup, see sync/CLAUDE.md "Query-flexibility constraint"), or stop
   treating `pattern` as `isLocal` for writes when reads can't be served locally.

## Files

- `packages/dms/src/api/index.js` — `dmsDataEditor` sync branch; `loadFromLocalDB`
- `packages/dms/src/sync/idb-store.js` / `sync-scope.js` — if going with fix 2
- `packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` — consumer (no change expected)

## Testing checklist

- [ ] Overview: rename → save → bar returns to "no unsaved changes" without refresh (sync on)
- [ ] Same with sync off
- [ ] Access tab permissions/filters save; Theme save; Format Manager save
- [ ] Page editing unaffected (sync on): edit/publish still served local-first
