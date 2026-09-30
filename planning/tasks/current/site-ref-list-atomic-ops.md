# Atomic add/remove for the site row's ref lists (server side)

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** planned · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Project:** DMS library (`src/dms` submodule) · **Topic:** dms-server

## Objective

Stop clients from rewriting the site row's ref lists (`patterns`, `tenants`, `theme_refs`,
`dms_envs`) wholesale. Add a server call that adds or removes **one ref** in a single atomic step,
and switch every caller to it. Two writers then can no longer overwrite each other's changes,
whatever each one had loaded.

## Background

Every change to a site's pattern list today is a read-modify-write done on the client. The client
takes the list it has, edits it, and sends the whole list back through `dms.data.edit`. Whatever the
server gained in the meantime is silently lost.

**Found live 2026-09-29, while testing** [admin-pattern-data-row.md](../completed/admin-pattern-data-row.md):
right after `/list/create` with sync on, the list page's local copy lacked the auth and admin refs
(they had been written straight to the server). Adding a pattern then wiped both, leaving the site
with no auth pattern.

**Client-side stopgap, already in place:** `mergeSitePatternRefs` + `readSitePatternRefs`
(`packages/dms/src/utils/tenantProvisioning.js`). Before each write it re-reads the server's list
and does a three-way merge. It fixes the case that was hit, but it has known holes that only a
server-side operation closes:

1. **Re-read failure** (e.g. offline with sync on) falls back to writing the list as shown, which
   is the old wiping behaviour.
2. **Race between read and write.** Anything added in between is lost. With sync on, the merged
   list is written locally and pushed later, so the window isn't milliseconds; if the connection
   drops, it has no fixed end.
3. **Deletes made elsewhere get undone.** The merge only adds server-only refs and never drops a ref
   the server has since removed, so a save from a stale copy puts it back as a dangling ref.
4. **Order:** refs the editor never saw are moved to the front.
5. **Sync conflict resolution** may apply its own policy to a pushed whole-list write (not audited).

## Proposed change

### Server (`packages/dms-server`)
- New Falcor call route, e.g. `dms.data.refs.add` / `dms.data.refs.remove`, with args
  `[app, siteId, attr, ref, position?]`:
  - `attr` ∈ an allow-list: `patterns`, `tenants`, `theme_refs`, `dms_envs`.
  - **add** is idempotent: if a ref with the same `id` is already there, nothing happens.
    `position` is `'start'` (core rows) or `'end'` (default).
  - **remove** is idempotent: removing an absent `id` does nothing.
  - Optional `move` / `reorder` op for drag-reorder. It must be **id-based**: move `id` before
    `beforeId`, not "here is the new full order".
- Atomic in the controller:
  - **Postgres:** a single `UPDATE … SET data = jsonb_set(data, '{attr}', …)` built from the
    current value in the same statement, or `SELECT … FOR UPDATE` in a transaction.
  - **SQLite:** a transaction (writes are serialized) around read-modify-write.
- Goes through the same change-log / WebSocket broadcast path as `dms.data.edit`, so sync clients'
  local stores and page-structure rooms pick up the change.
- Auth: require an authenticated user (like `dms.data.delete`). Once
  [admin-granular-permissions.md](../completed/admin-granular-permissions.md) lands, check site-level
  permissions here (`create-pattern` for add, `delete-pattern` for remove). This would be the first
  server-side enforcement for these writes; see defect B in
  [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md).
- Response: the updated site row via `dataByIdResponse`, so the Falcor cache refreshes.

### Client (`packages/dms`)
- A small api-layer wrapper (`api/`), per the "Falcor only in api/" rule, e.g.
  `siteRefs.add(falcor, {app, siteId, attr, ref, position})` / `.remove(...)`.
- With sync on, the call goes straight to the server (it is not a local write), then refreshes
  the local store's copy of the site row. **Check with the sync layer how best to do that
  refresh**: WebSocket echo, or an explicit local update from the response.
- Switch every caller:

  | Caller | Today | After |
  |---|---|---|
  | `editSite.jsx` `PatternList.addNewValue` (add pattern, duplicate) | whole list via `updateData` | `add` |
  | `editSite.jsx` pattern delete (row action + delete modal) | whole list | `remove` |
  | `editSite.jsx` reorder / edit modal saves | whole list | `move`, or leave as a merge-guarded whole-list write if reorder isn't supported |
  | `editSite.jsx` `TenantList` add tenant (master `tenants`) | whole list | `add` |
  | `editSite.jsx` `TenantList` tenant site `patterns` | `falcor.call` edit | `add` per ref |
  | `patternEditor/default/settings.jsx` delete / duplicate | `apiLoad` + whole list | `remove` / `add` |
  | `createSite.jsx` + `createCorePatterns` + `provisionTemplatePatterns.syncSiteRefs` | incremental whole-list edits + final `apiUpdate` | `add` per created row; drop the final consolidated write |
  | `authSignup.jsx` (master `tenants`, tenant site `patterns`) | whole list via `falcor.call` | `add` |
  | `backfillAdminPattern` | re-read → whole list → verify → discard | `add` at `'start'`. The re-read/verify/discard dance becomes a pre-check plus idempotent add. Two backfills can still each create a row, so keep the "lowest id wins" pick and delete the loser's row. |
  | `themes/list.jsx`, `themes/editTheme.jsx` (`theme_refs`) | whole list via `apiUpdate` | `add` / `remove` (not merge-guarded today; same exposure) |
  | `dms_envs` writers (`provisionTemplatePatterns`, DmsEnvConfig in settings) | whole list | `add` |

- Once every caller is switched, keep `mergeSitePatternRefs` only if something still writes a whole
  list (e.g. reorder). Otherwise remove it.

## Out of scope

- General field-level patch semantics for `dms.data.edit`.
- Ref lists on rows other than the site row (e.g. page `sections`), which have the same shape.
  Worth a follow-up if this works well.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms-server/src/routes/dms/dms.route.js` | new call route(s) |
| `packages/dms-server/src/routes/dms/dms.controller.js` | atomic add/remove/move on a row's JSON array attribute (Postgres + SQLite) |
| change-log / sync broadcast path (wherever `setDataById` records changes) | record + broadcast the site-row change |
| `packages/dms/src/api/` | client wrapper |
| the callers in the table above | switch to add/remove |
| `packages/dms/src/utils/tenantProvisioning.js` | `createCorePatterns`, `provisionTemplatePatterns`, `backfillAdminPattern` use `add` |

## Testing checklist

- [ ] Server unit tests (SQLite and Postgres):
  - [ ] add, add the same id again (no-op), remove, remove an absent id (no-op), `position: 'start'`
  - [ ] 20 concurrent adds to one site: all 20 end up in the list
  - [ ] a disallowed `attr` is rejected
  - [ ] an unauthenticated call is rejected
- [ ] The change reaches the change log, and a second sync client receives it.
- [ ] Browser, sync on:
  - [ ] create a site, then add a pattern without reloading; auth and admin survive
  - [ ] two tabs adding patterns at once keep both
  - [ ] delete in one tab, then save from a stale second tab; the deleted pattern does not come back
- [ ] Offline with sync on: an add either queues correctly or reports an error. It must never
  write a whole list.
