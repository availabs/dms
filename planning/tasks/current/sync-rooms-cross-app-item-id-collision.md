# Sync rooms and Yjs state are keyed by item id alone: apps share them

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** todo · **Created by:** ssangdod@albany.edu · **Edited by:** —

## Objective

Live editing (the page-structure Yjs rooms) must be scoped to one app's item. Today two apps whose rows
share an id share one room and one stored Yjs state, so an author editing page 4 of one tenant can push
edits into, and load the saved state of, item 4 of another tenant.

## How it was found

Tenant delete (`tenant-subdomain-uniqueness.md`, 2026-11-11) first deleted the deleted tenant's rows in
`dms.yjs_states` by item id. On the hub rig that removed 2 rows (items 4 and 5, last written 2026-09-29
and 2026-11-08, before the test tenant existed) that were not the tenant's. They were restored from the
delete's backup, and the delete no longer touches `yjs_states`.

## Root cause (traced from code)

- **Ids repeat across apps under per-app split mode.** `db/table-resolver.js ensureSequence` creates each
  app's sequence `dms_<app>.data_items_id_seq` with `START 1`, so every new app numbers its rows 1, 2, 3…
  (the test tenant `acmedel`: ids 1–5). Legacy mode (one shared sequence) does not repeat ids; per-app mode
  is the default for new databases and the hub's mode. Apps copied from a legacy database (mny, tny) keep
  their old large ids, so for now they collide mostly with each other's future rows and with new tenants;
  every two tenants created on the hub collide from their first row.
- **The server keys everything live by `itemId` only** (`dms-server/src/routes/sync/ws.js`):
  - `rooms: itemId → Set<WebSocket>` (:21, `getRoom` :67): a `join-room` message carries only `itemId`;
  - `yjsDocs`, `yjsDocLoads`, `awarenesses`, `flushTimers` (:24–35);
  - persistence: `SELECT state FROM yjs_states WHERE item_id = $1` (:142) and the upsert (:186);
  - `dms.yjs_states` has `item_id` as its key, no `app` column.
- **The client sends only the id:** `dms/src/sync/page-structure-provider.js` `join-room` / `yjs-update` /
  `yjs-sync-response` messages (`{ type, itemId }`, :166, :181, :239).
- Not affected: `change_log` and the sync delta/bootstrap routes, which filter by `app` and `item_id`
  (`routes/sync/sync.js` :468).

## Proposed fix

1. **Key by `(app, itemId)`.** The client puts `app` on every room message (the provider knows the page's
   app); the server's maps key on `${app}:${itemId}`; a message without `app` is refused (no fallback that
   reopens the shared room).
2. **`yjs_states` gains `app`** (migration in `sql/dms/migrate_dms_core.sql` + `.sqlite.sql`, then the
   schema-drift fixture): primary key `(app, item_id)`. Existing rows: fill `app` from the row the id
   belongs to where exactly one app has that id; rows whose id several apps hold (or none) are dropped:
   the Yjs state is a cache of the page structure the row itself stores (check this claim against
   `page-structure-provider.js` before relying on it).
3. **Room auth:** joining a room should require read on that app's item (the WS currently has no auth: see
   `page-structure-room-bug20` notes). At least, with `app` in the key, the room can be checked.
4. **Audit other id-only keys** on the client and server: the Falcor `dms.data.byId[id]` route and cache (the
   app-namespaced `dms.data[app].byId` exists; who still uses the bare one?), the local-first store
   (IndexedDB) keys, the page-structure-room cache, `_changeHistoryCache`.
5. Then put the tenant delete's `yjs_states` cleanup back, by `(app, item_id)`
   (`dms-server/src/routes/tenants/delete.js`).

## Files

- `dms-server/src/routes/sync/ws.js`, `dms-server/src/db/sql/dms/*` (yjs_states DDL + migrations),
  `tests/fixtures/schema-baseline.json`
- `dms/src/sync/page-structure-provider.js` (and any other `join-room` sender)
- `dms-server/src/routes/tenants/delete.js` (step 5)

## Testing checklist

- [ ] Two apps in per-app mode, each with an item of the same id: two clients editing them live do not see
      each other's updates; each reload loads its own Yjs state.
- [ ] A `join-room` without `app` is refused.
- [ ] Migration on a database with existing `yjs_states` rows: unambiguous rows keep their state, ambiguous
      ones are dropped, and a second run changes nothing.
- [ ] Legacy-mode site: live editing unchanged.
- [ ] Tenant delete removes only the deleted app's `yjs_states` rows.
