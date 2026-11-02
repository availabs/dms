# Sync on a SQLite server: pages go blank a second after loading

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

## Symptom

With `VITE_DMS_SYNC=1` against a **SQLite** dms-server, a page renders its sections, then about half a second
later they disappear: the page shows its title and nav, no sections. View and edit both. A sync-off build
(`VITE_DMS_SYNC=0`) against the same server is fine. Not specific to printing or to CLI-made pages: it happens
in any browser, on every page whose sections are refs.

Found 2026-10-30 during the PDF exporter rework (`pdf-exporter-rework.md`), first blamed on CLI-seeded
sections; the real cause was traced 2026-10-31.

Repro (rig: scratch dms-server on :3458 with `rig.sqlite`, Vite :5196 with sync on): open
`http://localhost:5196/plan/`. Body text 524 chars at ~1.2 s, 65 chars from ~1.7 s on, right after
`pattern 'millbrook_plan|page' bootstrapped: 43 items`.

## Cause

**The id's JS type depends on the database.** Postgres returns `data_items.id` (bigint) as a string through
node-pg; SQLite returns it as a number. `/sync/bootstrap` passes rows through, so a SQLite server sends
`{ id: 17 }` where Postgres sends `{ id: "17" }` (checked: the rig's bootstrap response has `typeof id ===
'number'`).

IndexedDB keys are strictly typed: `17` and `"17"` are different keys. The client stores rows under whatever
type the server sent (the browser mirror held numeric keys), but resolves refs as strings —
`api/index.js` `loadFromLocalDB()` maps child ids through `String(...)`, deliberately, after an earlier bug
where coercing to Number missed every Postgres row. So on SQLite every `getItemsByIds(["19", ...])` misses,
each section ref stays a bare `{ id, ref }` stub, and `SectionView` renders nothing for it.

The swap happens because the first render comes from Falcor (the pattern is not in sync scope yet);
`bootstrapPattern` runs in the background, adds the pattern to scope, and invalidates; the revalidated
render reads from IndexedDB and loses the sections.

Same mismatch, so far harmless: the skeleton bootstrap's stale-item cleanup (`sync-manager.js`,
`bootstrapSkeleton`) builds `serverIds` from numeric ids and compares string ref ids against it, so on a warm
re-bootstrap it reports "deleted 7 stale local items" (the deletes miss too, and `applyItems` rewrites the
rows anyway).

## Who it hits

Any sync-on build whose server runs SQLite: local development rigs, and any deployment on SQLite. Production
dms-server (Postgres `dms3`) sends strings and is not affected. The PDF exporter prints what a browser shows,
so it would print such pages blank too.

## Proposed fix

1. **One contract: ids are strings on the sync wire.** In `dms-server/src/routes/sync/sync.js`, stringify
   `id` (and `item_id` / ref ids where they appear) on every row leaving `/sync/bootstrap`, `/sync/delta`,
   `/sync/push` responses and WebSocket `change` messages. Postgres output is unchanged.
2. **Client normalizes too**, so an old server or an existing mirror can't reintroduce it: `idb-store.js`
   writes (`upsertItemNow`, `upsertItemsFromServer`, `applyChangeBatch`) key rows by `String(id)`; the
   offline-create autoIncrement path is the only numeric key and is already reconciled by `reassignItemId`.
3. **Existing mirrors**: bump the IndexedDB version and re-key numeric rows in `onupgradeneeded` (or drop the
   app's rows and let the next bootstrap refill them; Discard local data already does this per app).
4. Fix the skeleton cleanup's comparison to use the same normalized ids.

## Testing checklist

- [ ] Rig (SQLite) + sync on: `/plan/` and a page with a Spreadsheet section keep their sections after the
      pattern bootstrap (Playwright: text length stable for 8 s).
- [ ] Warm reload on the rig: same; no "deleted N stale local items" when nothing is stale.
- [ ] Postgres server (test app) + sync on: unchanged.
- [ ] A browser that already holds a numeric-keyed mirror recovers without a manual discard.
- [ ] Offline create → reconcile still re-keys correctly.
- [ ] Existing sync unit tests pass.
