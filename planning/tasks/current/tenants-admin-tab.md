# Admin: Tenants as its own tab, with the root site as a row

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

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

## Files requiring changes

| File | Change |
|---|---|
| `src/themes/tessera/design_system_v6/pages/admin-tenants.html` | new mockup |
| `packages/dms/src/patterns/admin/siteConfig.jsx` | `tenants` route; Tenants menu item |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | drop TenantList from SiteEdit; move TenantList out |
| `packages/dms/src/patterns/admin/components/tenantList.jsx` | real TenantList (named export) |
| `packages/dms/src/patterns/admin/pages/editSite.theme.js` (or new `tenantList.theme.js`) | root-row keys |

## Testing checklist

- [ ] Mockup confirmed by the owner
- [ ] Multi-tenant root, platform admin: sidenav shows Tenants; `/list/tenants` lists the root row + tenants
- [ ] Root row: blank subdomain, link navigates client-side to `/list`, no delete button, survives search
- [ ] `/list` on the root shows patterns only
- [ ] Tenant subdomain: no Tenants entry; `/list/tenants` refused
- [ ] Single-tenant site: no Tenants entry, no route behaviour change
- [ ] Add tenant and remove tenant still work from the new tab
- [ ] Theme pixel check on the admin pages of the default theme (memory: shared derived changes)
