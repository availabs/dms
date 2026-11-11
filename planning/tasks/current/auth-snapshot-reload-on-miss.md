# Auth: a read whose subject misses reloads the whole app snapshot, every time

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) (primary), [dms_permissions_move](../../../../../planning/initiatives/dms_permissions_move.md) · **Status:** todo · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Topic:** dms-server / auth · **Filed:** 2026-11-10 (found on the tenant hub rig, during
[tenant-external-domains.md](./tenant-external-domains.md) Phase A)

## Objective

A read check that can't find its subject (a source or view with no mirror row, an env with no `:dmsenv`
row) costs at most one snapshot reload per app in a short window, not one per row checked. A page that
lists many such sources must not saturate the database or stall unrelated requests.

## Symptom (rig, 2026-11-10)

- Page loads on `mny` / `tny` hosts took ~30 s; the pattern-list request `dms.data.mny.byId[…81 ids]` took
  11–26 s, though the same request takes ~10 ms on a fresh server.
- Rig Postgres at 187% CPU, dms-server at ~7%. `pg_stat_activity` sampled once a second for 15 s showed
  only one statement, 27 times, back to back:
  `SELECT id, type, NULL AS parent_id, NULL AS auth, data FROM dms_mny.data_items WHERE app = $1 AND type LIKE '%:%'`
  (the owners snapshot; ~280 ms alone, 322 rows / 377 kB).
- Temporary logging in `owners.js` `cached()` (reverted) counted **3,127 snapshot loads in one browser run**
  (1,676 `app|tny`, 1,451 `app|mny`), all `fresh`, all from
  `canRead` → `authorize` → `owners.snapshotFor` → `appSnapshot`.
- Trivial requests (`hub+test:site.length`) stayed at 3 ms during the stall: the event loop is free;
  requests that need a snapshot or the DMS pool wait behind the reloads.
- Intermittent: not reproduced on demand afterwards (single page loads of `/cenrep`, `transit.tny`,
  `/playground` logged 0 misses). The flood came during a run of ~16 pages across `mny` and `tny` hosts.

## Root cause

`routes/auth/index.js` `authorize()` (line ~107):

```js
fresh = fresh || op !== 'read';
let subject = await owners.snapshotFor({ …, fresh });
if (subject.error && !fresh) subject = await owners.snapshotFor({ …, fresh: true });   // ← every miss
```

- A read that misses retries with `fresh: true`. `owners.js` `cached()` then **always** runs a new
  `loadApp` (a full `SELECT … data` of every typed row of the app) and replaces the cache entry. Nothing
  remembers that the subject was already missing, so the next miss reloads again.
- Concurrent misses aren't deduplicated: each `fresh` call starts its own load.
- `readableSources()` (line ~251) calls `canRead` once per source id, so a listing of N unknown sources is
  N full reloads. Callers: `routes/uda/uda.route.js` (`canReadSource`, `canReadView`, the list at :51),
  `uda.colorDomain.route.js`, `dama/tiles/tiles.rest.js`.
- **Why the hub misses so much:** the hub's tenant schemas have **no pgEnv mirror rows**. On rig
  `hub_work`: `dms_mny` 0 external sources / 0 views (4 `:dmsenv` rows), `dms_tny` 0 / 0 (2). So every
  read of a `hazmit_dama` / `npmrds2` source or view misses (`… has no mirror row in <app>
  (reconcile-pgenv-mirror.js)`, `owners.js` :164) and reloads. The copy
  ([tenant-hub-copy-script.md](../../../../../planning/shared/tasks/completed/tenant-hub-copy-script.md))
  didn't run the mirror reconcile ([pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md)).
- Any server running this code with unmirrored external sources has the same exposure. That includes
  the live hub at availabs.com if its data matches the rig's (not checked: production is read-only).

## Proposed fix

1. **One refresh per miss window.** In `authorize`, retry fresh only when the cached snapshot is older
   than a short floor (e.g. 2–5 s). Alternatively, keep a per-app negative cache of missed subject keys
   for the snapshot's lifetime, cleared whenever the snapshot reloads. A miss after a recent refresh is
   final: deny, as today after the retry.
2. **Share in-flight loads.** In `owners.js` `cached()`, a `fresh` request while a load for the key is
   already running awaits that load instead of starting another.
3. **Judge a listing against one snapshot.** `readableSources` loads (or refreshes) once, then judges
   every id against it, so a listing can't multiply reloads regardless of 1–2.
4. **Data (hub, owner):** run `reconcile-pgenv-mirror.js` for the hub tenants, so their external
   sources have mirror rows and are judged, not missed. Separate from the code fix: 1–3 must hold
   without it.

Writes keep `fresh` (`op !== 'read'`): they are judged on what is stored now, and they're rare.

## Files

- `packages/dms-server/src/routes/auth/index.js`: `authorize` (retry rule), `readableSources`
- `packages/dms-server/src/routes/auth/owners.js`: `cached` (in-flight sharing, negative cache), `TTL_MS`
- Tests: `packages/dms-server/tests/test-read-auth.js` (or a new `test-auth-snapshot-reload.js`)

## Testing checklist

- [ ] Regression: N reads of unknown sources (and a `readableSources` over N unknown ids) cause ≤ 1
      snapshot load per app per window, counted with an exported load counter or a spy on `loadApp`
- [ ] A source created after the snapshot was built is still found by the next read (the one refresh
      still happens)
- [ ] Concurrent misses share one load
- [ ] Denials unchanged: an unknown subject is still refused after the refresh
- [ ] Writes still judge on a fresh snapshot
- [ ] Rig: the ~16-page run across `mny`/`tny` hosts stays under a few seconds per page; Postgres idle
      between pages
- [ ] Tests run against a test config only (never plain `npm test` in dms-server: test-sqlite.js
      reaches production)
