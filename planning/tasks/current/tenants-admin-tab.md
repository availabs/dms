# Admin: Tenants as its own tab, with the root site as a row

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** doing · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Topic:** patterns/admin · **Started:** 2026-11-06

## Objective

On a multi-tenant site's root domain, `/list` currently stacks the tenant block under the pattern
list. Move tenants to their own admin tab, and list the root site itself in that table: blank
subdomain, with its link going to `/list` (the root's own site admin).

## Current state

- `patterns/admin/pages/editSite.jsx` `SiteEdit` (around line 135): when `isPlatformAdmin`
  (`isMultiTenant && !getSubdomainFromHost()`) and the user has `MANAGE_TENANTS`, it renders
  `<PatternList>` and `<TenantList>` in one fragment.
- `TenantList` (editSite.jsx ~733–990) holds the table, search, the add-tenant modal (full
  provisioning: auth project, tenant row, tenant site, core and template patterns) and the remove modal.
- `patterns/admin/components/tenantList.jsx` is an unused placeholder from Phase 1 of
  [multi-tenant.md](./multi-tenant.md), exported as an object literal (not Fast-Refresh clean).
- The admin sidenav (`siteConfig.jsx` `getMenuItems`) has Sites and Themes, plus the Auth group.
- The v6 mockup `src/themes/tessera/design_system_v6/pages/admin-site.html` already shows a
  **tenants** sidenav item (icon Globe) under "site". There is no tenants page mockup yet.

## Proposed changes

1. **Mockup first** (v6 convention): `src/themes/tessera/design_system_v6/pages/admin-tenants.html`,
   built from `admin-site.html`'s shell and the current TenantList content, with the root row. Confirm
   with the owner before implementing.
   *Drafted 2026-11-09, waiting for the owner:* header strip (Tenants, `site_name · host · app`, stat
   `tenants` counting tenants only), toolbar (filter with `/` hint, add tenant), table name / subdomain /
   site / actions. Root row first: `root` pill, `app · id` subline, subdomain `—`, bare-host link to the
   site admin, no remove. Tenant rows: `app · id` subline, `<sub>.<host>` link with an outbound arrow, remove.
   A note under the table that removing only unlinks. New tenant and Remove tenant modals as today
   (name, subdomain, admin email, password, template picker; confirm text unchanged). `admin-site.html`'s
   **tenants** sidenav link now points here. **Confirmed by the owner 2026-11-09.**
2. **Route:** `path: "tenants"` under the admin site route in `siteConfig.jsx`, same `SectionGroup`
   wrapper as SiteEdit/ThemeList. The page renders only on the root domain of a multi-tenant site for a
   user with `MANAGE_TENANTS`; otherwise it shows no access (or redirects to `baseUrl`).
3. **Sidenav:** a "Tenants" entry (`${baseUrl}/tenants`, icon per the mockup) in `getMenuItems`,
   under the same condition. `getMenuItems` needs `isMultiTenant` and the host check passed in.
4. **SiteEdit:** stop rendering `TenantList`; the platform admin's `/list` shows the pattern list only.
5. **Move TenantList** into its own file (replacing the placeholder `components/tenantList.jsx`,
   named exports only), with its theme keys staying in `editSite.theme.js` or a sibling
   `tenantList.theme.js`.
6. **Root row:** first row of the table, not deletable, never filtered out by the search:
   - name: the root site's `site_name`;
   - subdomain: blank (shown as `—` or empty, per the mockup);
   - site link: a router `<Link to={baseUrl}>` to `/list`, labelled with the bare host;
   - stats strip counts tenants only (the root row isn't a tenant).
7. The tenant-row link keeps `${protocol}://${sub}.${host}${baseUrl}`.

## Implemented (2026-11-09)

- `components/tenantList.jsx`: the real `TenantList` (named export; the Phase 1 placeholder object export is
  gone, `admin.format.js` imports `{ TenantList }`). Moved from `editSite.jsx` with its add / remove logic
  unchanged; adds the root row (`rootSite` prop: the site row's id and `site_name`), the `app · id` sublines,
  `—` for the root's subdomain, a router `<Link>` to `baseUrl` for the root, `<sub>.<host>` + ArrowUpRight for
  tenants, and the note under the table. The filter applies to tenants only; the root row stays first.
- `pages/tenants.jsx` (`TenantsPage`): route `tenants` (action `edit`, so it gets the site row like
  `SiteEdit`). Gate: loading → nothing; signed out → login; then `isMultiTenant && !subdomain &&
  siteCan(MANAGE_TENANTS)`, else `navigate(baseUrl)`.
- `subdomain` comes from the pattern config props (pattern2routes' normalized host subdomain, `''` on the
  root, `www` / `hazardmitigation` included), not `window`, so the menu is SSR-safe. Added to `adminConfig`,
  `patternConfig` and `AdminContext`.
- Sidenav **Tenants** (icon `Globe`) under the same condition in admin `getMenuItems` (site pages and the
  Pattern Editor) and in the auth pattern's `manageAuthConfig` menu (Profile / Users / Groups pages), which
  mirrors it.
- `SiteEdit`: no TenantList; the root's `/list` is the pattern list only. Saving a ref list (patterns,
  tenants) goes through `utils.js` `saveSiteRefList` (the server re-read + merge that `updateData` had).
- Theme keys (`editSite.theme.js`): `tenantPageWrapper`, `identityText`, `identitySpacer`, `tenantNameCell`,
  `tenantName`, `rootPill`, `tenantSubline`, `tenantSubdomain`, `tenantSubdomainEmpty`, `tenantHostLink`,
  `rootLink`, `iconXs`, `tenantNote`. Removed `tenantWrapper` and `tenantLink` (only TenantList used them;
  no site theme overrides them).
- **Fixed on the way:** TenantList passed no `gridRef` to the Table, so columns took the fixed default width
  and the remove buttons overflowed the card (clipped, unreachable at 1280 px). Now passes one, as
  PatternList does. Actions header is `' '` (no "actions" label), as in the mockup.
- **Not done (as before):** right after Add, the new row shows a blank name until a reload, because the
  appended ref carries only the id. Unchanged from the old list.
- **Deviation from the mockup:** the root row has no tinted background (the list Table has no per-row
  style); the `root` pill marks it.

## Files requiring changes

| File | Change |
|---|---|
| `src/themes/tessera/design_system_v6/pages/admin-tenants.html` | new mockup |
| `packages/dms/src/patterns/admin/siteConfig.jsx` | `tenants` route; Tenants menu item |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | drop TenantList from SiteEdit; move TenantList out |
| `packages/dms/src/patterns/admin/components/tenantList.jsx` | real TenantList (named export) |
| `packages/dms/src/patterns/admin/pages/editSite.theme.js` (or new `tenantList.theme.js`) | root-row keys |

## Testing checklist

Live on the local tenant hub (rehearsal Phase 3 rig: Vite :5562 → dms-server :5560 on `hub_work`), Playwright
`scratchpad/tenant-hub/tenants-tab.mjs` / `tenants-addremove.mjs`, production requests blocked, 2026-11-09:

- [x] Mockup confirmed by the owner
- [x] Multi-tenant root, platform admin: sidenav shows Tenants (Sites, Themes, Tenants, Auth…); `/list/tenants`
      lists AVAIL Hub (root) + MitigateNY + TransportNY
- [x] Root row: `—` subdomain, link navigates client-side to `/list` (no reload), no delete button, survives
      search (filter "tny" → root + TransportNY)
- [x] `/list` on the root shows patterns only
- [x] Tenant subdomain: no Tenants entry (admin and auth manage sidenavs); `mny.localhost/list/tenants` →
      `/list`. A `mny Public` member → sent away.
- [ ] Single-tenant site: no Tenants entry, no route behaviour change. Not run live (no single-tenant rig up);
      both the menu and the page require `isMultiTenant`.
- [x] Add tenant (Acme Rehearsal / `acmetest`: tenant row, auth project, `dms_acmetest` schema) and remove it
      (dialog text, unlinked; tenant data kept) from the new tab
- [x] Auth manage pages (root): Tenants entry shown; on a tenant: not shown
- [ ] Theme pixel check on the admin pages of the default theme. Skipped: no shared key changed (only
      TenantList-only keys removed / added), and `/list`'s PatternList code is unchanged.
