# pgEnv configuration on the site: a site's pgEnvs are its `:dmsenv` rows, not `VITE_DMS_PG_ENVS`

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

## Current state — 2026-11-13 (read this first)

**Nothing in this task's phases is built.** `VITE_DMS_PG_ENVS` still decides which pgEnvs the client and SSR
use. Status stays `next`.

What changed under it on 2026-11-12: the mirror this task was written on was removed
([pgenv-auth-without-mirror-rows.md](./pgenv-auth-without-mirror-rows.md), committed `878ecc2e`). A site's
`:dmsenv` row per pgEnv stays and is still the fact this task reads. There are no source or view stubs, no
`mirror_apps` and no reconcile. Section 3 and the phases below were rewritten on 2026-11-13 to match.

| Piece | State |
|---|---|
| The env row as the record (Design 1) | Exists. `dama/pgEnv.js ensureEnvRow` creates it; `envRowOf` reads it; auth refuses an external read for an app with no env row for that pgEnv |
| Attach by script | Exists: `scripts/attach-pgenv.js --db <config> --app <app> --pg-env <name>` (from the mirror removal). No route, no detach |
| Client and SSR read the rows (Phase 1) | Not built |
| Attach / detach route, list of available pgEnvs (Phase 2) | Not built |
| Admin UI (Phase 3) | Not built |
| Retire the variable (Phase 4) | Not started |
| Open decisions (who may attach, default pgEnv, visibility of the list) | All open |

Which apps are attached, as far as measured:
- Hub db (`hub-dms`), audit 2026-11-12: `mny` and `tny` have env rows for `hazmit_dama` and `npmrds2`; `hub`
  and `fusion` have none.
- `dms-mercury-3`: `mitigat-ny-prod` and `rowauth-test` have env rows. The other production apps were not
  attached in this session. Until they are, their external reads miss (logged under `log`, refused under
  `enforce`). After the production incident of 2026-11-12 this is the urgent part of this task; it needs
  only the script, not Phases 1–4.

## Objective

Which pgEnvs a site uses is set today by a build variable, `VITE_DMS_PG_ENVS`, and the server never
learns it from data ([pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md), "The site question"). The
mirror work already put the same fact in DMS: one `{site}|{name}:dmsenv` row per pgEnv, carrying
`data.pgEnv`, listed in the site row's `dms_envs`. So the fact is stored twice, and the two can disagree:
a site built with a pgEnv it has never reconciled has no mirror rows, and under `enforce` every external
source on it is refused.

**Owner, 2026-11-10:** move the configuration onto the site. The site's env rows are the one record of its
pgEnvs. **Adding a pgEnv to a site is also the point where that pgEnv's auth row is created for the app**
(since 2026-11-12 that is the env row alone), so nobody has to remember to run a script by hand afterwards.

## Where the variable is read today (measured 2026-11-10)

| Reader | File | Use |
|---|---|---|
| The SPA | `dms-template/src/App.jsx:26` → `DmsSite pgEnvs` → `render/spa/dmsSiteFactory.jsx` → `render/spa/utils/index.js pattern2routes` | `buildDatasources` makes one `external` datasource per pgEnv; every pattern gets `pgEnv: pgEnvs[0]` (the "KEEP: old variables" block) |
| SSR | `dms-server/src/index.js:369` (`DMS_PG_ENVS` or `VITE_DMS_PG_ENVS`) → `render/ssr2/handler.jsx` | the same list for the server render |
| Deploy tooling | `dms-template/deploy/targets.json` (7 targets), `deploy/stacks.mjs:483`, `.env.example`, `README.md` | per-site build env; preview stacks |
| transportNY's vendored copy | follows by sync | not edited directly |

What already reads the data instead (updated 2026-11-13; the mirror's readers are deleted): the auth layer
(`routes/auth/owners.js snapshotFor` finds the app's env row for a pgEnv through `dama/pgEnv.js envRowOf`)
and `scripts/attach-pgenv.js`. The client's `buildEnvsForListing` lists every pgEnv from the prop.

## Design

### 1. The record

No new field. A site uses pgEnv `X` when it has a `:dmsenv` row with `data.pgEnv = X` in its `dms_envs`.
That is the shape `reconcile` creates now. Order matters for the legacy `pgEnv: pgEnvs[0]` prop, so the
order is the order of `dms_envs` on the site row (decide whether an explicit "default pgEnv" flag on the
site row is clearer; see Open decisions).

### 2. The client and SSR read the rows

`pattern2routes` already has `dmsEnvs` from `siteData`. Derive `pgEnvs` from them
(`dmsEnvs.filter(e => e.pgEnv).map(e => e.pgEnv)`) and use that in `buildDatasources` and the legacy
`pgEnv` prop. SSR gets the same list from the same site data, so `handlerConfig.pgEnvs` goes.

**Transition:** the `pgEnvs` prop stays for one release as a fallback when the site has no env row naming
a pgEnv, with a console warning that names the reconcile command. After every site is reconciled the prop,
`VITE_DMS_PG_ENVS` / `DMS_PG_ENVS`, and the `targets.json` entries are deleted.

### 3. Adding a pgEnv to a site: one server operation

Rewritten 2026-11-13 for the mirror's removal. A server route, and the same function behind
`attach-pgenv.js`, not a client-side row create:

```
attachPgEnv({ app, pgEnv })
  1. refuse unless the server has a db config for pgEnv
  2. refuse unless the caller may (see Open decisions)
  3. ensureEnvRow({ app, pgEnv })      // create or adopt the one `{site}|{name}:dmsenv` row
  4. append the env ref to the site row's dms_envs if missing
  5. clear the app's snapshot so the next read finds the row
```

- One row and one ref, so it is quick, needs no background job, and a re-run is a no-op.
- Source grants are not touched: they live in `data_manager.sources.auth_permissions` in the pgEnv and are
  shared by every app on it.
- The env row's vocabulary and rules come from the `formats` table (`admin+dmsenv`), so the app's formats
  should be registered first. See the companion task
  [new-app-auth-setup-and-db-constraints.md](./new-app-auth-setup-and-db-constraints.md) (A3, formats at
  creation). Today no hub app has `formats` rows and the server falls back to the built-in copy, so attach
  cannot refuse on this until A3 lands.
- **Detach** removes the env row and its `dms_envs` ref. It drops the env-level grants on that row, so it
  confirms first and reports them. Patterns whose `dmsEnvId` points at the env are listed, not rewritten.

### 4. The admin UI

Site-level settings (the admin pattern), a "Data environments" list: the site's envs, which name a pgEnv,
and for an authorized user an "Add pgEnv" control fed by a server list of available
pgEnv configs. This is author empowerment within the limit below: a site admin can see what the site is
attached to; who can attach is the open decision.

## Open decisions

- **Who may attach a pgEnv.** Attaching exposes another database's catalog to the site. Candidates:
  (a) platform admin only (AVAIL group); (b) site `*` holders, limited to an allow-list of pgEnvs per
  server; (c) script only, like `register-formats.js` (owner's 2026-11-06 rule that no client writes
  formats). Recommended: (a) for the route, with the script for deploys. Owner decides.
- **Default pgEnv.** Keep "first in `dms_envs`" or add an explicit flag for the legacy `pgEnv` prop that
  the admin, auth and datasets patterns still read.
- **Should the list of available pgEnvs be visible** to site admins who cannot attach one? It names the
  server's databases.
- **Tiles and signed download links** carry `dms_app` already (built with the mirror, kept). Confirm nothing else
  resolves a pgEnv with no site named once the variable is gone.

## Phases

Rewritten 2026-11-13 for the mirror's removal. None started.

### Phase 0 — attach what production already uses (script only, owner)
- [ ] Per DMS database, per app, per pgEnv the app's site is built with: `attach-pgenv.js` (dry, then
      apply). Done: `mitigat-ny-prod` and `rowauth-test` on `dms-mercury-3`; `mny` and `tny` on the hub db.
      Source for the list: the 7 targets in `dms-template/deploy/targets.json` that set `VITE_DMS_PG_ENVS`.

### Phase 1 — read the rows (no behaviour change for an attached site)
- [ ] `pattern2routes`: derive `pgEnvs` from `dmsEnvs`; the prop is the fallback, with a warning that names
      `attach-pgenv.js`.
- [ ] SSR handler: same derivation; `handlerConfig.pgEnvs` becomes the fallback.
- [ ] Tests: a site with env rows and no prop gets the external datasources; a site with neither gets none;
      prop-only still works and warns.

### Phase 2 — attach and detach on the server
- [ ] `attachPgEnv` / `detachPgEnv` over `ensureEnvRow`; route, guard per the decision; `attach-pgenv.js`
      calls the same function and gains `--detach`.
- [ ] `GET` of the server's available pgEnvs for the caller allowed to attach.
- [ ] Tests on the SQLite dama harness: attach creates the env row and the `dms_envs` ref; re-attach is a
      no-op; detach removes both; an external read is refused before attach and judged after it.

### Phase 3 — admin UI
- [ ] "Data environments" in site settings: list, add, remove with confirmation.

### Phase 4 — retire the variable (after every site is attached)
- [ ] Per site: confirm its env rows match its `VITE_DMS_PG_ENVS`, then drop the variable from its target in
      `dms-template/deploy/targets.json`. Sites: the 7 targets that set it (npmrds2 ×3, hazmit_dama ×2,
      landbank_dama, hazmit_dama+npmrds2).
- [ ] Delete the prop and both env variables; update `.env.example`, `README.md`, `deploy/stacks.mjs`
      (preview stacks attach by script instead), `dms-server-env.md`, and the skills that mention the
      variable.

## Related

- [pgenv-auth-without-mirror-rows.md](./pgenv-auth-without-mirror-rows.md) — removed the mirror; left the env
  row, `ensureEnvRow` and `attach-pgenv.js`. Has the 2026-11-12 production incident.
- [auth-snapshot-reload-on-miss.md](./auth-snapshot-reload-on-miss.md) — what an unattached app costs per read.
- [pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md) — dropped; first built the env row.
- [new-app-auth-setup-and-db-constraints.md](./new-app-auth-setup-and-db-constraints.md) — companion:
  what a new app gets by default; attach depends on its formats being registered.
- [format-declarations-server-side.md](./format-declarations-server-side.md) — where the env row's rules
  and vocabulary come from.

## Progress

- 2026-11-10: filed. Nothing built.
- 2026-11-12: the mirror was removed; attach is now one env row. `attach-pgenv.js` exists from that work.
- 2026-11-13: doc brought up to date: "Current state" added; Design 3 and the phases rewritten for the
  one-row attach; Phase 0 (attach what production uses, by script) added. Nothing built in this task.
