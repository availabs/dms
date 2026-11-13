# pgEnv configuration on the site: a site's pgEnvs are its `:dmsenv` rows, not `VITE_DMS_PG_ENVS`

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** doing · **Created by:** amuro@albany.edu · **Edited by:** —

## Current state — 2026-11-13 (read this first)

**Built 2026-11-13, uncommitted, not yet seen in a browser:** attach from the hub's tenant settings page
(see "Built — 2026-11-13"). Nothing else in the phases is built. `VITE_DMS_PG_ENVS` still decides which
pgEnvs the client and SSR use.

What changed under it on 2026-11-12: the mirror this task was written on was removed
([pgenv-auth-without-mirror-rows.md](./pgenv-auth-without-mirror-rows.md), committed `878ecc2e`). A site's
`:dmsenv` row per pgEnv stays and is still the fact this task reads. There are no source or view stubs, no
`mirror_apps` and no reconcile. Section 3 and the phases below were rewritten on 2026-11-13 to match.

| Piece | State |
|---|---|
| The env row as the record (Design 1) | Exists. `dama/pgEnv.js ensureEnvRow` creates it; `envRowOf` reads it; auth refuses an external read for an app with no env row for that pgEnv |
| Attach by script | Exists: `scripts/attach-pgenv.js --db <config> --app <app> --pg-env <name>` (from the mirror removal). No route, no detach |
| Client and SSR read the rows (Phase 1) | Not built |
| Attach route and list of available pgEnvs (Phase 2) | Built for hub tenants, uncommitted: `GET /tenants/:tenant/pgenvs`, `POST …/attach`, `…/detach/plan`, `…/detach`. Attach writes no `dms_envs` ref |
| Admin UI (Phase 3) | Built, uncommitted: a "data environments" card on `/list/tenants/:tenantId` (hub root, `manage-tenants`). Not checked in a browser. A single-site (non-hub) admin has no page for it |
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

### Phase 0 — attach what production already uses (script only, owner) — done on `dms-mercury-3` 2026-11-13
- [x] Per DMS database, per app, per pgEnv the app's site is built with: `attach-pgenv.js` (dry, then
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
- [x] `GET` of the server's available pgEnvs for the caller allowed to attach (hub tenants, 2026-11-13).
- [ ] Tests on the SQLite dama harness: attach creates the env row and the `dms_envs` ref; re-attach is a
      no-op; detach removes both; an external read is refused before attach and judged after it.

### Phase 3 — admin UI
- [ ] "Data environments" in site settings: list, add, remove with confirmation. List and add built on the
      hub's tenant settings page, 2026-11-13; remove not built.

### Phase 4 — retire the variable (after every site is attached)
- [ ] Per site: confirm its env rows match its `VITE_DMS_PG_ENVS`, then drop the variable from its target in
      `dms-template/deploy/targets.json`. Sites: the 7 targets that set it (npmrds2 ×3, hazmit_dama ×2,
      landbank_dama, hazmit_dama+npmrds2).
- [ ] Delete the prop and both env variables; update `.env.example`, `README.md`, `deploy/stacks.mjs`
      (preview stacks attach by script instead), `dms-server-env.md`, and the skills that mention the
      variable.

## Attached on `dms-mercury-3` — 2026-11-13 (Phase 0)

Read-only survey first: 130 app schemas, about 30 with a site row. Each app's build variable
(`deploy/targets.json`) was compared with the pgEnv names its stored rows reference (text matches for
`env` / `pgEnv` keys, so drafts and old sections count). The owner approved the list, with one change:
`npmrdsv5` does not get `hazmit_dama`, although 266 of its rows reference it.

`attach-pgenv.js --db dms-mercury-3 … --apply`, dry run first, one env row created each; read back after:

| App | pgEnv | Env row |
|---|---|---|
| `npmrdsv5` | `npmrds2` | `dev2\|npmrds2:dmsenv` |
| `dms-site` | `hazmit_dama` | `prod\|hazmit_dama:dmsenv` |
| `landbank` | `landbank_dama` | `dev2\|landbank_dama:dmsenv` (under `dev2:site` #10, with `--site dev2`) |
| `wcdb` | `wcdb-dama` | `prod\|wcdb_dama:dmsenv` |
| `avail` | `hazmit_dama` | `site\|hazmit_dama:dmsenv` |
| `qa_test` | `npmrds2` | `qa_test\|npmrds2:dmsenv` |
| `shaun-test-app` | `hazmit_dama` | `test\|hazmit_dama:dmsenv` |

`mitigat-ny-prod` already had `hazmit_dama`. Left unattached: apps that reference only their own datasets.

- `attach-pgenv.js` gained `--site <instance>` (`ensureEnvRow({ site })`) for an app with several site rows;
  `landbank` has `home:site` and `dev2:site`.
- Not checked: that the production server has a database config for each of these names (`landbank_dama`
  has none locally); which code and `DMS_AUTH_MODE` production runs; `mitigat-ny-prod` for other pgEnvs
  (not scanned, 465k rows); any effect in a browser.
- `npmrdsv5` sections that read `hazmit_dama` sources stay unattached by decision: logged under `log`,
  refused under `enforce`.
- No schema for `rowauth-test` was found on `dms-mercury-3`.

## Built — 2026-11-13 (attach from the tenant settings page)

Owner, 2026-11-13: attaching needs a user interface; the hub's tenant page (`/list/tenants/:tenantId`)
becomes the tenant's settings page and carries it; start on `hub-dms`, not `dms-mercury-3`. Later the page
may get pluggable sub pages like the pattern editor's.

- **Server** (`routes/tenants/pgEnvs.js`, routes in `routes/tenants/index.js`, multi-tenant servers only):
  `GET /tenants/:tenant/pgenvs` returns `{ attached, available }`; `POST /tenants/:tenant/pgenvs/attach
  { pgEnv }` runs `ensureEnvRow` for the tenant's app, as the caller, then clears the auth snapshots.
  `available` is the server's db configs with the `dama` role; a name outside it is refused.
- **Who may attach:** hub staff (`manage-tenants` on the hub's site row), the same gate as the page. This
  takes option (a) of "Who may attach a pgEnv" for the hub; the owner has not confirmed it as the rule.
- **Client:** `components/pgEnvsCard.jsx` (+ theme, `theme.admin.pgEnvsCard`), stacked under the domains
  card on `pages/tenantOverview.jsx`; the header counts attached pgEnvs.
- `dama/pgEnv.js`: `envRowsOf(app)`; `ensureEnvRow` takes the `user` the write is logged as.
- **Tests:** `test-pgenv-auth.js` 26 pass (5 new: nothing attached, unknown pgEnv refused, attach then
  judged at once, repeat is a no-op, no site row refused); `npm test` green. SQLite only.

**Later the same day (owner): the tenant's settings live on its own host.**
- `/list/settings` on a tenant host (`pages/siteSettings.jsx`, moved from `pages/siteDomains.jsx`) holds
  both cards; `/list/domains` still opens it. Gate: `manage-domains` on the tenant's site, as before. The
  domains card shows only on a hub with a root domain. Sidebar and user-menu entry renamed Settings.
- A cog beside the site name on the tenant's `/list` links to it; the Tenants list has a pencil per row
  to the hub's page for the tenant (`/list/tenants/:tenantId`), which keeps both cards.
- `GET /tenants/:tenant/pgenvs` is also open to the tenant's own admins (`manage-domains`), read-only:
  they get `attached`, an empty `available` and `canAttach: false`, so the server's database names stay
  with hub staff. Attach is still hub staff only.

**Detach (owner, same day: `mny` on the hub wants `hazmit_dama` only, and the UI had no remove).**
- `POST /tenants/:tenant/pgenvs/detach/plan { pgEnv }` (read-only) and `POST …/detach { pgEnv }`, hub staff
  only, no preview flag (dms-server's rule for destructive routes). The plan names the env row, who holds
  grants on it, and what blocks it.
- Detach deletes the env row through the controller (change log as any delete) and drops its ref from the
  site row's `dms_envs` when listed. Refused (409) while the row has internal sources under it or a pattern's
  `dmsEnvId` points at it. The pgEnv's own sources and grants are not touched.
- Card: a trash button per attached pgEnv for hub staff; it loads the plan and confirms in place.
- Plan on `hub-dms` for `mny`, read-only, 2026-11-13: `npmrds2` (row 2930012) has no grants, no patterns,
  no sources, not blocked. `hazmit_dama` (row 2902392) holds grants for group AVAIL and one user.
- Not checked by the plan: whether any `mny` page section reads an `npmrds2` source. Those reads are refused
  (or logged, under `log`) once it is detached.
- Tests: `test-pgenv-auth.js` 30 pass (4 new: plan, the two refusals, delete with site ref swept and the
  pgEnv untouched, re-attach).

**The hub's own site (owner, same day: the hub has pages of its own and needs the setting too).**
- The four routes also exist as `/hub/pgenvs…`, for the hub's app (`DMS_APP`); hub staff only.
- `/list/settings` opens on the hub's root too, for `manage-tenants`: the data environments card alone (the
  hub is not a tenant, so no domains card). The cog on `/list` and the Settings menu entry follow.
- `hub-dms` today: the `hub` app has no pgEnv attached.
- A single-site (non-multi-tenant) server still has no routes and no page for this.

**Not done**
- Not exercised over HTTP or in a browser: the local hub server (`npm run hub`) was running the old code
  and was not restarted.
- Nothing attached on any database through it. `hub-dms` today: `mny` and `tny` have `hazmit_dama` and
  `npmrds2`; `fusion` has none.
- The `dms_envs` ref on the site row (Design 3, step 4). The existing pgEnv env rows on `mny` and `tny` are
  not in their site rows' `dms_envs` either; what the client does with such a ref is not checked.
- Sub pages for the tenant settings page.

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
- 2026-11-13 (later): attach built for hub tenants: routes, the data environments card on the tenant
  settings page, tests. Uncommitted; not run against `hub-dms` or seen in a browser. Status → doing.
- 2026-11-13 (later still): tenant settings moved onto the tenant's host at `/list/settings`; cog and
  pencil links; the read route opened to tenant admins. Uncommitted, not seen in a browser.
- 2026-11-13 (detach): plan and detach routes, the remove control on the card, tests. Not run on `hub-dms`.
- 2026-11-13 (hub site): `/hub/pgenvs` routes; `/list/settings`, cog and menu entry on the hub's root.
- 2026-11-13 (production): Phase 0 run on `dms-mercury-3` at the owner's request: seven apps attached.
