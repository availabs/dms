# Admin pattern as a saved pattern row (with first-load backfill)

**Initiatives:** [dms_page_editor_admin](../../../../../planning/initiatives/dms_page_editor_admin.md) · **Status:** done (2026-09-30; committed in `bde2825f`, dms-server deploy by the user) · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Project:** DMS library (`src/dms` submodule) · **Topic:** patterns/admin

## Objective

Today the admin pattern isn't saved anywhere; it's built in code on every load. This task makes it a
real pattern row, `{instance}|admin:pattern`, referenced from the site row's `patterns` like every
other pattern. Its own settings (base URL, site-level permissions, admin theme) then have somewhere
to live, instead of coming from a config prop and the auth pattern.

- **Every new site** gets an admin row when it is created, next to its auth row.
- **Existing sites** get one automatically on first load (see Phase 3).
- The in-code admin pattern stays as a **fallback** for as long as a site has no admin row, including
  a brand-new install with no site row at all (`/list/create` must still render).

## Status (2026-09-29)

Phases 1-4 are implemented and uncommitted.

**Verified:**
- 24 unit tests pass (`packages/dms/tests/adminPatternRow.test.js`), including tenant creation,
  tenant backfill and tenant-subdomain routing.
- 3 live-server tests pass (`adminPatternRow.integration.test.js`), run against a scratch dms-server
  copy with only the sqlite `cli-test` config, on port 3457. The SQLite file confirms each site ends
  with exactly one admin row and the race loser's row is deleted.
- `npm run build` passes.
- The rest of the package's vitest suite has 3 failures (`avlGraphThemeDefaults`,
  `syncDeltaConvergence`). They fail the same way with these changes stashed, so they aren't caused
  by this work.

**Not verified yet:**
- the list page and backfill in a real browser
- local-sync mode
- SSR
- the tenant add and tenant signup flows end to end

**Two findings from running against a real server** (the unit-test fakes now imitate both):
1. **Saving the pattern list rewrites every ref** to the generic `${app}+${instance}|pattern`
   (`api/updateDMSAttrs.js`). The admin row therefore can't be recognised from its ref string, and
   the backfill looks up each ref's row `pattern_type` instead.
2. **The legacy `dms.data.byId[id]` path returns `data: null`** on a per-app split server. The
   backfill reads through `dms.data[app].byId`.

## Scope

**In:** the row format, route building from the saved row, creating the row in every site-creation
path, the first-load backfill, and how the admin row appears in the pattern list and Pattern Editor.

**Out:** the granular permission vocabulary. That lives in
[admin-granular-permissions.md](./admin-granular-permissions.md), which should build on this task
(site-level permissions live on the admin row). Server-side provisioning is out too: see
[tenant-signup-production-readiness.md](../current/tenant-signup-production-readiness.md). If provisioning
moves to the server, the admin-row creation moves with it.

## Current state (read 2026-09-29)

- **Built in code.** `render/spa/utils/index.js:243` builds `AdminPattern`:
  - `pattern_type: 'admin'`
  - `base_url: adminPath` (prop, default `/list`; `src/App.jsx:41` passes `VITE_DMS_BASE_URL || '/list'`)
  - `subdomain: '*'`
  - `type` set to the site's own type
  - `authPermissions` copied from the auth pattern (`:253`)

  It's put at the front of the saved patterns (`:257`). The SSR path builds its own copy
  (`render/ssr/dms_utils.js:34`, with `base_url: 'list'`), and `render/ssr2/handler.jsx:101` passes
  `adminPath: siteConfig.baseUrl || '/list'`.
- **Admin theme.** `getAdminTheme` (`patterns/admin/siteConfig.jsx`) uses the default theme plus
  the `admin.logo` key from the auth pattern's theme.
- **Auth pages link back to admin** via their own `adminPath` prop (`patterns/auth/siteConfig.jsx:206`,
  default `/`).
- **The site row (`{instance}:site`, `admin.format.js:170`) stores:** `site_name`, `patterns`,
  `tenants`, `theme_refs`, `dms_envs`. This does not change.
- **Site-creation paths.** Each one creates the site row plus an auth pattern row by hand:

  | Path | Where |
  |---|---|
  | New site (single-tenant bootstrap) | `patterns/admin/pages/createSite.jsx:62-87` |
  | Add tenant (platform admin, TenantList) | `patterns/admin/pages/editSite.jsx:772-800` |
  | Tenant self-signup | `patterns/auth/pages/authSignup.jsx:115-145` |
  | Template patterns (called by all three) | `utils/tenantProvisioning.js:117` `provisionTemplatePatterns`, which creates non-auth patterns only |

  There is no site-create command in the CLI (`cli/src/commands/site.js`).
  `dms-server/src/scripts/migrate-site.js` copies every row the site references, so it will carry
  an admin row over without changes.
- **Server reads.** A pattern row that isn't an auth pattern is blocked unless the user has
  `view-page` (`dms-server/src/routes/dms/dms.route.js:47`). The `no-access` stub still returns
  `base_url`, `subdomain`, `locations`, `authPermissions`, `name` and `theme` (`:99`). So a
  logged-out visitor still registers the admin route and gets the login redirect. **No server change
  is needed.**

## What each row saves

**Admin row** (`{instance}|admin:pattern`, `app` = the site's app):

| Field | Value | If empty |
|---|---|---|
| `pattern_type` | `'admin'` | — |
| `name` | `'Admin'` | — |
| `base_url` | the admin path, e.g. `list` | the `adminPath` prop |
| `subdomain` | `'*'`; for a tenant site, the tenant slug, matching its auth row (Phase 2 design note) | `'*'` |
| `authPermissions` | site-level admin permissions (`view-pattern-list`, `create-pattern`, `manage-themes`, `manage-tenants`, `*`) | **the auth pattern's `authPermissions`**, exactly as today |
| `theme` | admin theme / logo | `getAdminTheme`'s current result (default theme + the auth theme's `admin.logo`) |
| `html_title` | optional | — |

`auth-users`, `auth-groups` and `view-as` stay on the auth pattern, because they gate auth routes.

**Site row:** unchanged (`site_name`, `patterns`, `tenants`, `theme_refs`, `dms_envs`). `patterns`
now includes the admin ref.

**Fallback rule:** every admin-row field falls back to today's source when it's empty, so a new or
backfilled row behaves exactly like the in-code object until someone edits it. The backfill
therefore writes **no** `authPermissions` and **no** `theme`. Copying them would freeze a snapshot
that silently stops following later edits to the auth pattern.

## Proposed changes

### Phase 1 — Format and routing — DONE
- [x] `admin.format.js`: no change needed. **Design note:** the `pattern_type` select options were
  left alone. The Overview tab shows `pattern_type` read-only, and `AddPatternPicker` builds its own
  option list, which never offered `admin`.
- [x] `render/spa/utils/index.js` `pattern2routes`: if the site's `patterns` include an
  `pattern_type: 'admin'` row, use it in place of the in-code object. Fill empty fields using the
  fallback rule. Otherwise build today's object unchanged.
  - **`base_url` precedence:** the saved row wins over the `adminPath` prop. Before shipping, check
    that no site is served by two deployments with different `adminPath` values (e.g. SPA `/list` vs
    an SSR `siteConfig.baseUrl`). If one is, the saved value would move one of them.
- [x] ~~`render/ssr/dms_utils.js`~~: **not needed.** Nothing imports that old SSR path (only its own
  `dms_api.ts`). The live SSR path (`render/ssr2/handler.jsx`) goes through `dmsSiteFactory` →
  `pattern2routes`, so SPA and SSR share the same code.
  - **Implementation:** the saved row is picked with `pickAdminPattern` (lowest id on duplicates)
    and folded into the in-code `AdminPattern`. `base_url` sets the resolved `adminPath`, which is
    passed on to every config, so the auth manage pages' links follow it. `subdomain` is taken from
    the row. `authPermissions` comes from the row only if `hasAuthGrants`, which **ignores the
    `public` group**, because the Access editor seeds `public: ['view-page']` into everything it
    saves. `html_title` comes from the row, but **not `name`**, so admin tabs don't suddenly get an
    "Admin" title. Saved admin rows are removed from the routed pattern list.
- [x] `getAdminTheme`: `pattern2routes` passes an `adminThemeSource` (the admin row if
  `hasThemeSelection`, else the auth pattern) to every config. `admin/siteConfig.jsx` (both configs)
  and the auth manage pages use it.
- [x] `patterns/auth/siteConfig.jsx`: nothing to change for the links, because `pattern2routes`
  now passes the resolved path as `adminPath`. `authConfig` also gained an `adminPath` param and
  passes it to `AuthSignup` (used in Phase 2).

### Phase 2 — Every new site gets an admin row — DONE
- [x] New shared helper in `utils/tenantProvisioning.js`:
  `createCorePatterns(falcor, { app, siteInstance, siteId, adminGroupName, subdomain, adminBaseUrl })`.
  It creates the auth row (moving the three copies of that code here) **and** the admin row. It
  registers both on the site row straight away, so an interrupted flow still leaves a working site,
  and returns their refs for `initialPatternRefs`.
  It also exports `adminPatternType`, `adminPathToBaseUrl` and `buildAdminPatternData`.
- [x] `createSite.jsx`: step 2 → `createCorePatterns` (`adminPath: baseUrl || '/'`).
  **Behaviour change:** a failed auth-pattern create now throws into the flow's existing error
  status. Before, it silently continued with no auth pattern.
- [x] `editSite.jsx` (Add tenant): step 5 → `createCorePatterns`. The tenant's core refs are now
  registered on the tenant site straight away, not only in the final write.
- [x] `authSignup.jsx` (tenant signup): step 5 → `createCorePatterns`. It gets `adminPath` as a
  prop from `authConfig`.
- **Each tenant has its own admin row, with `subdomain` set to the tenant slug** (revised
  2026-09-29; the first cut used `'*'`).
  - **Where it lives:** it's created in the tenant's own app (`app: slug`) and referenced from the
    tenant's own site row, so a tenant saves its own admin settings (base URL, permissions, theme)
    separately from the platform's and from other tenants'.
  - **Its subdomain:** it names its subdomain the same way the tenant's auth row does.
    `createCorePatterns` passes `subdomain` to both rows. On a tenant subdomain, the backfill
    passes `getSubdomainFromHost()` (`editSite.jsx`, multi-tenant only).
  - **Everywhere else** (single-tenant sites and the platform root) the admin row keeps `'*'`.
  - **Routing:** unchanged, since a tenant's site data is only loaded on its own subdomain. A unit
    test checks that a slug-subdomain admin row routes on `acme.localhost` exactly like the
    in-code pattern.
- [ ] **Not done:** search for any other creator of `:site` rows (site templates, test seeds `cli/test/seed.js`,
  `dms-server/tests/*`) and add the admin row where a seed is meant to look like a real site.

### Phase 3 — Backfill existing sites on first load — DONE (not browser-tested)
The admin row is created **the first time a user with site access opens the admin panel** on a site
that doesn't have one.

**Why not on any visitor's first load:** until the row exists, the fallback already gives every
page the same behaviour, so nothing is gained by creating it earlier. Writing on an anonymous page
view would mean site-structure writes driven by public traffic, including SSR renders and crawlers.
It only works at all because `dms.data.edit` is unguarded (defect B in
[auth-permission-chain-and-unguarded-writes.md](../current/auth-permission-chain-and-unguarded-writes.md)),
which is a hole slated to be closed.

- [x] In `editSite.jsx` `SiteEdit`, run a one-time effect **after** the site gate passes (user is
  authed, not `isAuthenticating`, has site access):
  1. If `item.patterns` already has an admin row, stop.
  2. Re-read the site row's `patterns` fresh from the server (invalidate Falcor first; the cached
     copy can be stale, see
     [sync-admin-pattern-save-stale.md](../current/sync-admin-pattern-save-stale.md)). If an admin row is
     there now, stop.
  3. Create the admin row with `name: 'Admin'`, `base_url` set to the current `adminPath`, and
     `subdomain` set to the in-code object's value. Leave `authPermissions` and `theme` empty
     (fallback rule).
  4. Add its ref to the site's `patterns`, keeping the existing order with admin first, and write
     the site row.
  5. Refresh the site data so the list shows the new row.
  - Use `falcor.call(['dms','data','create'|'edit'])` directly, as `createSite.jsx` does, not
    `apiUpdate`. With local sync on, `apiUpdate` writes locally and reads back stale data.
- [x] **Two admins opening at once** can create two rows. After the write, re-read `patterns`. If
  there is more than one admin ref, keep the lowest id, remove the others from `patterns`, and
  delete their rows. Anywhere else that finds duplicates (`pattern2routes`) should also use the
  lowest id, so every client picks the same row.
- [x] Log the backfill to the console (site, new id) so it can be seen in the field.
- [x] **Stale-copy guard:** after a backfill the page revalidates. Until the reloaded `item`
  arrives, `SiteEdit.updateData` puts the backfilled ref back into any `patterns` save that lacks
  it, so an immediate pattern-list save can't drop it.
  - **Why it's needed:** that save writes only the refs in the list it's given.
  - **Why it's safe:** `updateDMSAttrs` passes a ref-only entry through without editing the row.
- **Detection:** `readSitePatterns` reads the site's refs plus each referenced row's `pattern_type`,
  fresh from the server. Rows the user can't view still report `pattern_type` through the no-access
  stub. See "two findings" above for why the ref string isn't used.
- [ ] Optional: a CLI/`dms raw` recipe in the task notes for backfilling a site ahead of time, using
  the same field values.

### Phase 4 — The admin row in the admin UI — DONE
- [x] Pattern list (`editSite.jsx`): the admin row gets an `admin` type pill (`typePillAdmin`) and a
  type-filter chip, and no Delete or Duplicate. It uses the same rule that already applied to auth.
- [x] Pattern Editor: Overview, Theme and Access are already the only tabs a non-page pattern gets
  (`patternEditor/index.jsx` and `buildPatternMenuItems`), so nothing changed there. The admin
  row's Overview (`default/settings.jsx`):
  - hides the danger zone (duplicate/delete)
  - hides the Locations and Retired Subdomains editors, since only the admin row's primary
    `base_url` is routed
  - shows Subdomain read-only
- [x] **Lock-out guards:**
  - Changing the admin `base_url` asks for confirmation and says the new admin URL.
  - Saving admin `authPermissions` that don't give the current user site access is blocked unless
    they are in `${app} Admin`. `Permissions.jsx` already adds the saving user with `*`, so this
    mostly covers removing an existing grant.
  - **As built:**
    - Changing `base_url` turns Save into "confirm move" and shows where the admin panel will move.
    - The Access tab on the admin row shows a hint that access still comes from the auth pattern
      until something is granted here.
    - Save is disabled, with a warning, when the pending grants don't give the saving user `*` and
      they aren't in `${app} Admin`.

## Files requiring changes

| File | Change |
|---|---|
| `packages/dms/src/patterns/admin/admin.format.js` | `admin` pattern_type |
| `packages/dms/src/patterns/admin/components/AddPatternPicker.jsx` | exclude `admin` |
| `packages/dms/src/render/spa/utils/index.js` | use the saved admin row, fallback rule, duplicate resolution |
| `packages/dms/src/render/ssr/dms_utils.js` | same for SSR |
| `packages/dms/src/patterns/admin/siteConfig.jsx` | `getAdminTheme` reads the admin row theme |
| `packages/dms/src/patterns/auth/siteConfig.jsx` | admin link uses the resolved admin base URL |
| `packages/dms/src/utils/tenantProvisioning.js` | new `createCorePatterns` |
| `packages/dms/src/patterns/admin/pages/createSite.jsx` | use `createCorePatterns` |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | tenant add uses `createCorePatterns`; first-load backfill; row actions |
| `packages/dms/src/patterns/auth/pages/authSignup.jsx` | use `createCorePatterns` |
| `packages/dms/src/patterns/admin/pages/patternEditor/index.jsx` | admin-type tab set, lock-out guards |
| `packages/dms/cli/test/seed.js`, `packages/dms-server/tests/*` | seed an admin row where relevant |

## Bug found in browser testing: stale list save wiped auth + admin refs (fixed 2026-09-29)

**What happened** (user, sync on): they created a site via `/list/create` and were logged in and
taken to the list, which showed no auth or admin row. Without reloading, they added a page pattern.
That save wiped the site's auth and admin refs. The backfill later added a new admin row, but the
auth row stayed orphaned.

**Cause (this predates the admin row).** `createSite` creates the site row through `apiUpdate`, so
with sync on it goes into the local store. It then wrote the core and template refs straight to the
server with `falcor.call`. The list page reads the local copy, which never saw those refs, and every
pattern-list save writes the whole `patterns` list from that copy. The old create flow wrote the
auth ref the same way, so it could already wipe auth before this task.

**Fix:**
- [x] `createSite.jsx`: the final consolidated write (all pattern refs + env refs) goes through
  `apiUpdate`, so the list lands with the refs present. The earlier incremental writes stay on
  Falcor (crash safety).
- [x] `mergeSitePatternRefs` + `readSitePatternRefs` (`utils/tenantProvisioning.js`): a three-way
  merge of the edited list, the list the editor loaded, and the server's current list.
  - Refs the server has but the editor never saw are kept, placed first.
  - Refs the user removed stay removed. `removed` covers deleting a ref the stale copy never had.
  - Used by `SiteEdit.updateData` for **both `patterns` and `tenants`**. Tenant signup appends
    tenants straight to the server too, so a later tenant save from the list page could drop them.
  - Also used by the Overview tab's delete and duplicate (`settings.jsx`), which read the site
    through `apiLoad`.
  - If the server re-read fails, the list is saved as shown and an error is logged, as before.
  - This replaces the narrower "keep the backfilled admin ref" guard.
  - It's a stopgap. The real fix is server-side atomic add/remove:
    [site-ref-list-atomic-ops.md](../current/site-ref-list-atomic-ops.md), which also lists the merge's
    known holes.
- [x] 4 unit tests for the merge, including the exact wipe scenario.
- [x] Re-test in the browser: create a site, then add a pattern immediately without reloading.
  Auth and admin should both be listed on landing and survive the add.
- [x] ~~Repair the user's test site:~~ (not needed, per the user) its auth row still exists but isn't referenced. Add its ref back
  to the site's `patterns` (CLI), and optionally delete the orphaned first admin row.

## Open risks / follow-ups

- ~~**Anonymous boots and the site snapshot.**~~ **RESOLVED 2026-09-30 (server; needs a dms-server
  deploy).** The problem: if an author removed `public` from the admin row's Access tab, anonymous
  boots got the row as a `no-access` stub, and `persistSiteSnapshot` skips snapshots that contain
  stubs. Anonymous visitors would have lost the warm-boot fast path.
  - **Fix:** `dms-server/src/routes/dms/dms.route.js` now never stubs `pattern_type: 'admin'` rows,
    the same as `auth`. The stub already carried every routing/branding field, so nothing new is
    exposed beyond `html_title` and row metadata.
  - **What stays unchanged:** the page-level exemption (`getPatternAuthPermissions`,
    `dms.controller.js:405`) is deliberately still auth-only.
  - **Rule, noted in the code:** never store anything secret on an auth or admin pattern row; it is
    readable by everyone.
  - **Regression test:** added to `dms-server/tests/test-pattern-stub.js`; 11/11 pass on sqlite
    `cli-test`. The new case fails against the previous route code.
- **Local-sync mode** hasn't been checked. The backfill writes straight to the server through
  Falcor. The stale-copy guard covers the list page's own saves, but a site row served from the
  local store stays stale until the sync pulls the change.
- **Lost-update window.** There is a small window between the backfill's re-read of the site
  `patterns` and its write. A pattern added in another tab during that window would be lost. The
  window is the same size as any concurrent site-row save today.

## Testing checklist

> **At completion (2026-09-30), the unticked items below were never tested.** They were judged
> non-blocking and left as-is, not verified:
> - backfill not firing for logged-out users or users without access
> - logged-out redirect to login after a backfill
> - the list's delete-doesn't-return check
> - the Access tab's gate switch and lock-out block
> - clearing the admin theme
> - SSR
> - the `pattern2routes` end-to-end fallback unit test
>
> The test seeds (`cli/test/seed.js`, dms-server tests) also don't create an admin row yet.

- [x] Unit (`adminPatternRow.test.js`), `pattern2routes`:
  - no admin row
  - an empty row, and a row pinned to the current path, both giving identical route paths
  - a custom `base_url` moving every admin route
  - two rows, where the lowest id wins
- [x] Unit: helpers
  - `hasAuthGrants`, including the Access editor's untouched `public: ['view-page']` shape
  - `hasThemeSelection`
  - `pickAdminPattern`
  - `buildAdminPatternData`
  - `createCorePatterns`
- [x] Unit: backfill
  - creates exactly one row
  - no-op when a row already exists, found by row type rather than ref string
  - sees a row the user can't view, through the no-access stub
  - a second run is a no-op
  - a concurrent pair leaves one row
  - backs off when another row appears mid-flight
  - deletes its orphaned row when its site write is overwritten
- [x] Live server (`adminPatternRow.integration.test.js`, opt-in via `DMS_TEST_API_HOST`):
  - `createCorePatterns`
  - backfill plus a no-op re-run
  - a concurrent pair ending with one row on the site
  - SQLite checked by hand: the loser's row is gone
- [ ] Unit gap: the `authPermissions` and `theme` fallback inside `pattern2routes` is only covered
  through its helpers (`hasAuthGrants`, `hasThemeSelection`), not end to end.
- [x] **Verified live by the user (2026-09-30):**
  - `/list/create` creates the admin row, and adding a page pattern straight after no longer
    removes auth or admin (stale-list fix confirmed)
  - add tenant and tenant signup create the admin row
  - the admin row's Access tab note changes once a permission is granted there
  - picking a theme on the admin row changes the logo on the admin pages and the auth manage
    pages
  - the admin row has the `admin` pill and no Delete/Duplicate
  - the user's broken test site won't be repaired (not needed)
- [x] **Verified live by the user (2026-09-29):**
  - backfill on a simple (single-tenant) site
  - backfill on an existing tenant's subdomain
  - Add tenant from the site list creates the tenant's admin row
  - tenant signup creates the tenant's admin row
- [x] New site via `/list/create` (single-tenant bootstrap): failed the first time (stale-list
  wipe, see the bug section above); fixed and re-tested (user, 2026-09-30).
- [x] Platform root of a multi-tenant deployment: the backfill created only the root site's admin
  row, and no tenant admin rows (user, 2026-09-29).
- [x] Admin row Overview base-URL move (user, 2026-09-29).
- [x] Local sync on for every test so far, with no duplicate admin rows (user, 2026-09-29).
- [ ] Backfill doesn't fire when it shouldn't:
  - [ ] a logged-out visit and a public page view create nothing
  - [ ] a logged-in user without list access creates nothing (they're redirected to `/` first)
  - [ ] a reload after a backfill creates nothing more
- [ ] Stale-list merge: on a site with no admin row, open the list and **immediately** add or
  reorder a pattern, before any reload. The site's `patterns` must still include the admin ref
  afterwards. Also delete a pattern from the list and check it doesn't come back.
- [ ] Logged-out visit to the admin URL still redirects to login after the backfill (the server
  stub keeps `base_url`).
- [x] Admin row Overview: base URL move with "confirm move" confirmed by the user.
- [ ] Admin row Access tab:
  - [x] shows the "comes from the auth pattern" hint, and changes once a permission is granted
  - [ ] saving with only the default public entry keeps access coming from the auth pattern
  - [ ] granting a group `*` switches the site gate to the admin row; a user with only the auth
    pattern's grant loses list access; `${app} Admin` members keep it
  - [ ] a save that would drop your own `*` is blocked with the warning
- [x] Admin row Theme tab: selecting a theme with an `admin.logo` changes the logo on the admin
  pages and the auth manage pages; clearing it falls back to the auth pattern's.
- [x] Pattern list: the admin row shows the `admin` pill and chip, with no Delete or Duplicate.
- [ ] SSR (if a deployment uses it): SSR and SPA resolve the same admin `base_url`.
- [x] Local sync mode: no second admin row across the user's tests.

**How a tenant resolves its own admin row, not the master site's `'*'` row (answered
2026-09-29).** It's because only the tenant's data is loaded. On a tenant subdomain,
`dmsSiteFactory` loads the master site only to find the tenant, then loads the **tenant's own site**
and passes only that to `pattern2routes`. The master site's patterns, admin row included, never
reach route building there. `pickAdminPattern` does not look at `subdomain` at all: it takes the
admin row(s) on whichever site was loaded, lowest id first. A site holding several admin rows for
different subdomains isn't a supported shape. If one appeared, the lowest id would win regardless of
subdomain.
