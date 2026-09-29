# Sync: "Discard local data" + ghost rows the local mirror never heals

**Status:** Phase 1 (menu action) DONE 2026-09-28, live-verified. Phases 2–4 OPEN.

Related: Bug 18 in [concurrent-page-editing-data-loss.md](./concurrent-page-editing-data-loss.md)
(regular tab stale vs. incognito), whose "immediate mitigation" note this phase ships;
[sync-admin-pattern-save-stale.md](./sync-admin-pattern-save-stale.md) (a different sync
read/write mismatch found the same day).

## Trigger (2026-09-28)

On `shaun-test-app` (`VITE_DMS_SYNC=1`, localhost:5173), `/` sometimes flashed the real page and
then went blank; clicking the logo from `/list` did the same. Cause: the owner's browser mirror
still held **page 54519** ("zz room sync test" → "zz renamed", index 0), which an agent's CLI test
run created on 2026-09-25 15:58 and deleted at 15:59:33 (change_log revision 1587262, `user_agent:
node`). The server had the delete, the local mirror never applied it, so `/` resolved to a page
whose sections no longer existed anywhere. The page-room health check reported "page 54519 not
found on the server" (`room-health.js:112`), and "Update room from database" couldn't help — it
needs the page to exist, and its `revalidateNow()` only deltas forward from a watermark already
past the delete. Fresh Playwright profiles never reproduced it (no stale mirror).

## How a deleted row gets stuck (code reading; which one hit here not confirmed)

1. **WS moves the watermark past changes the tab never saw.** The WS handler sets the unscoped
   watermark to each message's revision (`setLastRevision(msg.revision)`). Browser-originated
   writes are broadcast; CLI/Falcor writes are not (Bug 20 follow-up, "Falcor writes are never
   live-broadcast"). So during a burst of agent writes the tab can see the create + section edits
   live, never see the CLI delete, and still record itself as caught up past it.
2. **Pattern re-bootstrap is upsert-only.** On a too-large delta, `_bootstrapPatternImpl` does a
   full cold bootstrap via `applyItems` → `upsertItemsFromServer`, which never deletes local rows
   missing from the server's snapshot. `bootstrapSkeleton` does reconcile (`staleIds`); the pattern
   path has no equivalent. Once the scope watermark moves past the delete, the ghost is permanent.

## Phase 1 — "Discard local data" in the user menu — DONE 2026-09-28

Manual escape hatch for a mirror that has drifted in a way sync doesn't heal.

- **Where:** user menu sync block, directly below "Clear pending mutations", only when sync is on;
  every signed-in user (it only touches their own browser); shows in the admin sidenav too (same
  `UserMenu`). Kept apart from the page-room rows — those fix server-side room state, this fixes
  the browser's copy; neither substitutes for the other.
- **Scope: the current app, not the origin.** `idb-store.js` `discardAppData(app)` — one
  cross-store transaction deleting this app's `data_items` (by_app cursor) and `pending_mutations`
  (scan, no app index); `sync_state` is cleared whole because its watermark keys carry no app
  (other apps just cold-bootstrap next time). `resetDB()`/`resetAndRebootstrap()` are untouched.
- **Always enabled, confirms instead** (disabling on pending edits would block it exactly when it's
  needed — edits against a deleted row never push). `getPendingSummary()` feeds the confirm, which
  lists unsent edits and, separately, offline creates (temp ids — only copy is local). Disabled only
  while `disconnected`/`recovering` (nothing to reload from) or mid-discard.
- **Look (owner feedback 2026-09-28):** red row with a trash icon; the confirm is the UI kit's
  `DeleteModal` (from `ThemeContext` `UI`, same as section delete), rendered outside the
  `NavigableMenu` so it survives the dropdown closing — not `window.confirm`. A failed discard
  keeps the modal open and appends the error to its prompt.
- **Then a full reload + cross-tab reload.** `discardLocalData()` closes the WS (no reconnect),
  discards, and posts on a `BroadcastChannel('dms-sync-discard')`; other tabs of the same app
  `location.reload()`. The menu reloads this tab. The reload is deliberate: it drops in-memory Yjs
  docs, scope, loaded patterns and in-flight bootstraps that would otherwise write the old view
  back (the gaps listed under Phase 3). Failure → error shown in the modal, no reload.
- Theme keys `syncDiscardWrapper` / `syncDiscardWrapperDisabled` / `syncDiscardLabel`
  (`userMenu.theme.jsx`, registered in `themeClasses`, and included in `roomHealthThemeDefaults`
  so site themes that override `pages.userMenu` still get them).

**Files:** `sync/idb-store.js`, `sync/sync-manager.js` (`installDiscardListener` from `configure`,
`getPendingSummary`, `discardLocalData`), `patterns/page/components/userMenu.jsx`,
`userMenu.theme.jsx`, `sync/CLAUDE.md`.

**Verified live (Playwright, two tabs, `/sync/push` blocked so nothing seeded reached the server):**
- [x] Seeded a ghost `pages|page` row, 2 pending edits for this app (1 offline create), and a row +
      pending edit for a fake `other-app`
- [x] Confirm text: "2 unsent edits will be discarded. 1 of them creates an item that exists only
      in this browser and will be lost."
- [x] Tab A: "discarded local data for shaun-test-app: 331 rows, 2 pending edits", reloaded
- [x] Tab B: "local data discarded in another tab — reloading", reloaded
- [x] Both re-bootstrapped (skeleton 15, `pages|page` 330); ghost gone; `/` renders Page 1
- [x] `other-app` row and its pending edit survived
- [x] eslint: no new findings in the touched files (existing ones on untouched lines)
- [x] Modal version: red trash row; clicking opens `DeleteModal` (no browser dialog); Cancel closes
      it with no reload; Delete discards and reloads, `/` renders
- [ ] Not tested: offline-disabled state, failure path, a sync-off build (item isn't rendered)
- Known, pre-existing in `DeleteModal` (not changed here): its icon circle is empty (`fa fa-danger`,
  Font Awesome isn't loaded) and the button is hardcoded "Delete".

## Phase 2 — self-heal: reconcile on pattern re-bootstrap — OPEN

Make the full pattern bootstrap delete local rows under that pattern's types that aren't in the
server snapshot (mirror `bootstrapSkeleton`'s `staleIds`; `getDistinctAppTypesByAppAndPatternPrefix`
+ `getItemsByAppType` + `deleteItemsByIds` already exist). Then a ghost clears on the next full
bootstrap with no user action. Careful with rows that have pending mutations (offline creates) —
don't delete those.

## Phase 3 — gaps in the automatic `resetAndRebootstrap()` — OPEN

Found while designing Phase 1; they affect the existing function regardless of the menu:
- In-memory Yjs docs (`yjs-store.js`) are not destroyed; `initFromData` only seeds empty docs, so
  post-reset remote data merges into pre-reset docs.
- `_inflightBootstraps` / in-flight pushes (`reassignItemId`, `markMyRevision`) can land in the
  freshly emptied DB.
- `_patternLastVerified` isn't cleared; only the skeleton is re-bootstrapped (current page falls
  back to Falcor until the next pattern bootstrap).
- Wipes every app on the origin; other tabs aren't told.

## Phase 4 — related findings — OPEN

- **`flushPending()` pushes every app's queued mutations**, not just `_app`'s (seen live in the
  Phase 1 test: after reload both tabs tried to push the seeded `other-app` mutation). On an origin
  shared by several apps (localhost) one site's queue can be pushed while running another.
  Filter by `row.app === _app`.
- WS handler watermark semantics (mechanism 1 above): consider not advancing the unscoped
  watermark past a gap, or rely on per-pattern watermarks only.
- Consider namespacing `sync_state` keys by app so app-scoped discard can keep other apps' watermarks.
