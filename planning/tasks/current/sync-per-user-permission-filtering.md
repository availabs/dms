# Sync: bootstrap, delta, push and WebSocket apply no per-user permissions

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** —

**Project:** DMS library (`src/dms` submodule) · **Topics:** dms-server (sync), api (client sync)

> Found 2026-09-30 while implementing
> [admin-granular-permissions.md](../completed/admin-granular-permissions.md), which widened the Falcor pattern read
> gate and needed to know whether sync applies the same gate. It doesn't apply any.

## Objective

Make the sync path honour the same read rules as Falcor (`dms-server/src/routes/dms/dms.route.js`), so
turning sync on (`VITE_DMS_SYNC=1`) doesn't hand restricted rows to users who can't read them. Close
the matching write, WebSocket and browser-storage gaps, or hand them to the task that owns them.

## Current state (read 2026-09-30)

**Falcor reads are gated.** In `dms.route.js` `dataByIdResponse`, a pattern row (other than auth and
admin) that the user can't read (`view-page`, or since 2026-09-30 any admin pattern permission)
comes back as a `no-access` stub carrying only routing and branding fields. A page row needs `view-page`
on its pattern merged with the page's own grants, and otherwise comes back as the string `'no-access'`.
The `length`, `byIndex` and `options` routes filter pages the same way.

**Sync reads are not.** `dms-server/src/routes/sync/sync.js`:
- `GET /sync/bootstrap?app=…[&skeleton|&pattern|&type]` returns **every row in scope in full**: the site
  skeleton, all pattern rows, and all pages and components of a pattern (drafts included). Scope is
  chosen by the caller. With no scope it returns the whole app's main table.
- `GET /sync/delta?since=N` returns every `change_log` entry after N in scope, with full `data`.
- Their only check is `requireAuth` (`sync.js:175`, `DMS_SYNC_AUTH === '1'`), which requires *any*
  logged-in user. With the env var unset (the default), anonymous callers get everything too.
- No `authPermissions` evaluation, no stubs, no `view-page`.

**Sync writes.** `POST /sync/push` (insert/update/delete) checks the same `requireAuth`, and deletes
always require *some* login. There's no per-row authorization, so this is the sync-side twin of defect B
in [auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md).

**WebSocket.** `dms-server/src/routes/sync/ws.js` has no token or user handling at all:
- `subscribe {app, pattern?}` → every later `change` broadcast for that app or pattern, **with the full
  item**.
- `join-room {itemId}` → the item's full Yjs state (`yjs-sync-step2`), and later `yjs-update`s are relayed
  **from** the client to everyone in the room, so anyone can edit.

**Browser store.** `packages/dms/src/sync/idb-store.js` uses one IndexedDB database named `dms-sync` per
origin, shared by every user of that browser. Logout (`auth/pages/authLogout.jsx`) only removes
`localStorage.userToken`; synced rows stay.

## How this causes problems

1. **Restricted content can be read directly.** Anyone who can reach the server (any logged-in user
   with `DMS_SYNC_AUTH=1`) can `curl /sync/bootstrap?app=<app>&pattern=<doc_type>` and get every page
   of a restricted pattern, drafts and unpublished pages included. It works even on a site that doesn't
   turn sync on in its client, because the endpoint is always mounted. Also exposed:
   - each pattern's `authPermissions` (group names, user ids)
   - its `filters`, `config` (the fields the Falcor stub deliberately withholds) and its `dmsEnvId`
2. **Restricted content persists in the browser.** With sync on, a user whose view is restricted still
   has the full rows in `dms-sync`. The UI hides them (client-side checks such as `view.jsx`
   `isUserAuthed`), but devtools shows them. They also survive logout, so the next person on a shared
   machine inherits the previous user's copy, and they will see it if their own access checks pass
   locally.
3. **Live edits are broadcast to everyone.** Every subscriber of an app gets every change to a restricted
   row as it happens, full item included. Yjs rooms give read *and* write access to any item by id.
4. **Writes bypass authorization** through `/sync/push` and Yjs updates. This is independent of reads,
   and any read filtering is moot while it's open.
5. **Sync-on and sync-off sites behave differently.** Falcor gives a restricted user a `no-access`
   stub. Parts of the client key on that (e.g. `render/spa/utils/index.js` doesn't add the public
   `view-page` default to stubbed patterns). With sync on, that user gets the full row and the client
   decides from the real `authPermissions` instead. That mostly lands on the same answer, but it's two
   code paths for one rule, so bugs can hide in either.

## Why adding filtering isn't a one-line change

Things a naive "filter rows in bootstrap/delta" would break:

1. **Watermark gaps after a grant.** Delta is `revision > since`. If a row is filtered out for a user and
   they're granted access later, no new revision touches that row, so they never receive it. The same
   silent, permanent gap the bootstrap watermark comment in `sync.js` warns about. Any change to what a
   user may see has to force a scoped re-bootstrap. That includes their groups, a pattern's
   `authPermissions`, or a page's.
2. **Revocations.** Rows the user could read yesterday are already in their local store. Filtering new
   deltas doesn't remove them. The server has to send removals ("this id is no longer visible"), or the
   client has to purge and re-bootstrap the scope.
3. **A pattern's grants decide its pages.** An edit to a pattern row's `authPermissions` changes the
   visibility of every page under it, but the delta carries only the pattern row.
4. **Stub or omit.** Pattern rows must stay routable, the same reason Falcor returns a stub. Writing a
   stub into the shared `dms-sync` store could overwrite a full copy cached for another user. Omitting
   pages is simpler, but then the local store can't tell "restricted" from "deleted".
5. **A per-user store is needed first.** Filtering is pointless while all users of a browser share one
   `dms-sync` database. Key the database by user (and anonymous), and wipe or switch it on
   logout/login. Pending offline mutations queued by one user must not flush under another's token.
6. **Cost.** Full-app bootstraps would evaluate permissions per row, and every page row needs its
   pattern's grants. Reuse the per-response cache from `dms.route.js` (`patternAuthCache`). WebSocket
   broadcasts become per-client work. `ws.js` already had allocation problems with shared broadcasts
   (see [sync-ws-broadcast-split-row-payload.md](./sync-ws-broadcast-split-row-payload.md)).
7. **Keep one rule.** Mirror `dms.route.js`'s checks in a shared server helper, so Falcor and sync can't
   drift. The server's `isUserAuthed` has its own "unconfigured → allow" rule, which must stay identical
   in both.
8. **Auth and admin rows** are never stubbed on the Falcor side (they hold routing and branding only).
   Keep that exemption.
9. **Turning on `DMS_SYNC_AUTH=1`** alone would break anonymous visitors on public sync-enabled sites.
   It isn't a fix by itself.

## Proposed changes

### Phase 0 — Measure
- [ ] List which deployments run with `VITE_DMS_SYNC=1` and which servers set `DMS_SYNC_AUTH=1`.
- [ ] Reproduce on a scratch sqlite server (see memory `reference_local_browser_repro_setup`): a
  restricted pattern and page, anonymous `curl /sync/bootstrap?app=…&pattern=…` returns both in full.
  Keep it as a server test that must flip once Phase 1 lands.

### Phase 1 — Server read filtering
- [ ] Extract the row-visibility logic from `dms.route.js` `dataByIdResponse` into a shared helper, e.g.
  `canReadRow({ user, row, subdomain, patternAuthCache, controller })` → `'full' | 'stub' | 'hidden'`, used
  by both Falcor and sync.
- [ ] `/sync/bootstrap` and `/sync/delta`: restricted pattern rows → the same stub fields; restricted
  pages and components → dropped. Resolve `user` from `req.availAuthContext` even when `DMS_SYNC_AUTH` is
  off.
- [ ] Decide: does the subdomain come from a query param or the `Host` header? Falcor resolves
  subdomain-keyed grants per subdomain.

### Phase 2 — Client store per user
- [ ] Namespace IndexedDB by user id (and `anon`), e.g. `dms-sync:<userId|anon>`.
- [ ] On logout or user switch: close, then switch or delete the store, and clear pending mutations.
- [ ] On login: bootstrap into the user's own store.

### Phase 3 — Visibility changes
- [ ] When a delta touches a pattern row's `authPermissions` or a page's, or when the user's groups
  change (the token refreshes with different groups), re-bootstrap the affected scope.
- [ ] Server-side removals: consider a `hidden` change type in delta, so revoked rows are deleted locally.

### Phase 4 — WebSocket
- [ ] Authenticate the WS connection (token on connect or in `subscribe`).
- [ ] Filter `change` broadcasts per client with the Phase 1 helper.
- [ ] `join-room`: require read access to join, and edit access to relay `yjs-update`.

### Phase 5 — Writes
- [ ] `/sync/push` per-row authorization. Do this **together with defect B**
  ([auth-permission-chain-and-unguarded-writes.md](./auth-permission-chain-and-unguarded-writes.md)) so
  Falcor and sync writes use one rule. Don't solve it twice.

## Files likely to change

| File | Change |
|---|---|
| `packages/dms-server/src/routes/dms/dms.route.js` | extract the visibility helper |
| `packages/dms-server/src/routes/sync/sync.js` | filter bootstrap/delta; later push authorization |
| `packages/dms-server/src/routes/sync/ws.js` | connection auth, per-client broadcast filter, room access |
| `packages/dms/src/sync/idb-store.js`, `sync-manager.js`, `index.js` | per-user store, re-bootstrap triggers |
| `packages/dms/src/patterns/auth/pages/authLogout.jsx` | clear or switch the local store |

## Testing checklist

- [ ] Server: anonymous and unprivileged bootstrap of a restricted pattern returns a stub pattern and no
  pages; a `view-page` user gets both in full. Same for delta.
- [ ] Server: WS subscriber without access receives no `change` for restricted rows; `join-room` refused.
- [ ] Grant then re-sync: the newly visible page arrives (no watermark gap).
- [ ] Revoke then re-sync: the page is removed from the local store.
- [ ] Browser: log in as A (restricted content cached), log out, log in as B → B's store holds none of
  A's rows.
- [ ] Public sync-enabled site: anonymous visitors still load public pages.
- [ ] Performance: full-app bootstrap time before and after on a large app.
