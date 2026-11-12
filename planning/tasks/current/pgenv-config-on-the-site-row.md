# pgEnv configuration on the site: a site's pgEnvs are its `:dmsenv` rows, not `VITE_DMS_PG_ENVS`

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

> **2026-11-12 — read this first.** The mirror this task builds on was reversed
> ([pgenv-auth-without-mirror-rows.md](./pgenv-auth-without-mirror-rows.md)). A site's `:dmsenv` row per
> pgEnv stays and is still the fact this task reads, but there are no source / view stubs, no
> `mirror_apps` and no reconcile. So wherever this doc says `attachPgEnv` wraps `mirror.reconcile`, read:
> **attach creates the one env row** (`dama/pgEnv.js ensureEnvRow`, `scripts/attach-pgenv.js`) and its
> `dms_envs` ref; detach removes that row. It is quick, needs no background job, and destroys no
> per-source grants (those live in the pgEnv). The phases below are not yet rewritten to match.

## Objective

Which pgEnvs a site uses is set today by a build variable, `VITE_DMS_PG_ENVS`, and the server never
learns it from data ([pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md), "The site question"). The
mirror work already put the same fact in DMS: one `{site}|{name}:dmsenv` row per pgEnv, carrying
`data.pgEnv`, listed in the site row's `dms_envs`. So the fact is stored twice, and the two can disagree:
a site built with a pgEnv it has never reconciled has no mirror rows, and under `enforce` every external
source on it is refused.

**Owner, 2026-11-10:** move the configuration onto the site. The site's env rows are the one record of its
pgEnvs. **Adding a pgEnv to a site is also the point where that pgEnv's auth rows are created for the
app** (the env row, the source and view mirror stubs, the `mirror_apps` registration), so nobody has to
remember to run `reconcile-pgenv-mirror.js` by hand afterwards.

## Where the variable is read today (measured 2026-11-10)

| Reader | File | Use |
|---|---|---|
| The SPA | `dms-template/src/App.jsx:26` → `DmsSite pgEnvs` → `render/spa/dmsSiteFactory.jsx` → `render/spa/utils/index.js pattern2routes` | `buildDatasources` makes one `external` datasource per pgEnv; every pattern gets `pgEnv: pgEnvs[0]` (the "KEEP: old variables" block) |
| SSR | `dms-server/src/index.js:369` (`DMS_PG_ENVS` or `VITE_DMS_PG_ENVS`) → `render/ssr2/handler.jsx` | the same list for the server render |
| Deploy tooling | `dms-template/deploy/targets.json` (7 targets), `deploy/stacks.mjs:483`, `.env.example`, `README.md` | per-site build env; preview stacks |
| transportNY's vendored copy | follows by sync | not edited directly |

What already reads the data instead: `reconcile-pgenv-mirror.js` (with no `--pg-env` it lists the app's
`:dmsenv` rows naming a pgEnv), `dama/mirror.js envRowOf`, and `buildEnvsForListing`, which drops a
mirrored pgEnv from the external datasources.

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

A server route (and the same function behind a script), not a client-side row create:

```
attachPgEnv({ app, pgEnv })
  1. refuse unless the server has a db config for pgEnv
  2. refuse unless the caller may (see Open decisions)
  3. mirror.reconcile({ app, pgEnv, apply: true })   // env row create/adopt, sources, views, orphans,
                                                     // registerMirrorApp(pgEnv, app)
  4. append the env ref to the site row's dms_envs if missing
  5. return the diff reconcile printed (N sources, M views mirrored)
```

- It is `reconcile` with a front door, so the rows are identical to what the script writes and a re-run is
  a no-op. `reconcile-pgenv-mirror.js` stays as the repair tool.
- A pgEnv has thousands of sources (the mirror's catalog note), so the operation may take a while. Run it
  as a dms task with progress if it exceeds a few seconds on `npmrds2`; measure first.
- The env row needs its vocabulary and rules. Those come from the `formats` table (`admin+dmsenv`,
  `datasets+source`), so the app's formats must be registered first. See the companion task
  [new-app-auth-setup-and-db-constraints.md](./new-app-auth-setup-and-db-constraints.md); `attachPgEnv`
  refuses, with a clear message, when the app has no `admin+dmsenv` declaration.
- **Detach** is the mirror image: remove the env row's mirror stubs, the env row, the `dms_envs` ref and
  the `mirror_apps` entry. Per-site grants on the mirrors are destroyed by it, so it confirms first and
  reports how many grants it drops. Patterns whose `dmsEnvId` points at the env are listed, not rewritten.

### 4. The admin UI

Site-level settings (the admin pattern), a "Data environments" list: the site's envs, which name a pgEnv,
the mirror counts, and for an authorized user an "Add pgEnv" control fed by a server list of available
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
- **Tiles and signed download links** carry `dms_app` already (mirror Phase 3). Confirm nothing else
  resolves a pgEnv with no site named once the variable is gone.

## Phases

### Phase 1 — read the rows (no behaviour change for a reconciled site)
- [ ] `pattern2routes`: derive `pgEnvs` from `dmsEnvs`; the prop is the fallback, with the warning.
- [ ] SSR handler: same derivation; `handlerConfig.pgEnvs` becomes the fallback.
- [ ] Tests: a site with env rows and no prop gets the external datasources; a site with neither gets none;
      prop-only still works and warns.

### Phase 2 — attach and detach on the server
- [ ] `attachPgEnv` / `detachPgEnv` over `mirror.reconcile`; route, guard per the decision; a script
      wrapper (or `reconcile-pgenv-mirror.js --attach`).
- [ ] `GET` of the server's available pgEnvs for the caller allowed to attach.
- [ ] Tests on the SQLite dama harness: attach creates env row, stubs, `mirror_apps`, `dms_envs` ref;
      re-attach is a no-op; detach removes all four; attach with no registered formats is refused.

### Phase 3 — admin UI
- [ ] "Data environments" in site settings: list, counts, add, remove with confirmation.

### Phase 4 — retire the variable (after every site is reconciled)
- [ ] Per site: dry reconcile clean, then drop `VITE_DMS_PG_ENVS` from its target in
      `dms-template/deploy/targets.json`. Sites: the 7 targets that set it (npmrds2 ×3, hazmit_dama ×2,
      landbank_dama, hazmit_dama+npmrds2).
- [ ] Delete the prop and both env variables; update `.env.example`, `README.md`, `deploy/stacks.mjs`
      (preview stacks attach by script instead), `dms-server-env.md`, and the skills that mention the
      variable.

## Related

- [pgenv-mirror-into-dms.md](./pgenv-mirror-into-dms.md) — built the env row, the stubs and `reconcile`.
- [new-app-auth-setup-and-db-constraints.md](./new-app-auth-setup-and-db-constraints.md) — companion:
  what a new app gets by default; attach depends on its formats being registered.
- [format-declarations-server-side.md](./format-declarations-server-side.md) — where the env row's rules
  and vocabulary come from.

## Progress

- 2026-11-10: filed. Nothing built.
