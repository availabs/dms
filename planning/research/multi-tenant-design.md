# Multi-Tenant DMS — Architecture Design

## Overview

This document describes the design for adding multi-tenant support to DMS. The goal is to allow a single DMS deployment to serve multiple isolated tenants, each on their own subdomain, each with their own data schema and auth project.

The design extends the existing site→patterns hierarchy to site→tenants→patterns. It is additive: single-tenant deployments are completely unchanged. Multi-tenant mode is opt-in via a flag in `App.jsx`.

---

## Core Concepts

### Current hierarchy (single-tenant)

```
Master site:  app=platform, type=main:site
                └─ patterns: [ref → pattern rows]
              app=platform, type=main|my_docs:pattern
              app=platform, type=my_docs|page
```

All data lives in one app namespace. The `.env` file specifies `DMS_APP` and `DMS_TYPE` which are baked into `adminConfig` in `App.jsx` at build time.

### New hierarchy (multi-tenant)

```
Master site:  app=platform, type=main:site       ← lives in master schema
                └─ tenants: [ref → tenant rows]

Tenant row:   app=platform, type=main|acme:tenant  ← lives in master schema
                data: { subdomain: "acme", app: "acme", name: "Acme Corp" }

Tenant site:  app=acme, type=main:site           ← lives in dms_acme schema
                └─ patterns: [ref → pattern rows]

Tenant data:  app=acme, type=acme|my_docs:pattern
              app=acme, type=my_docs|page
```

The master site refs tenants exactly as it currently refs patterns — via a `dms-format` attribute. Each tenant has its own `app` stored on the tenant row. Tenant content lives in a separate schema (`dms_acme` in per-app split mode).

---

## Type System

### New type kind: `tenant`

Follows the existing convention: `{site_instance}|{tenant_slug}:tenant`

Example: `main|acme:tenant` where `main` is the site instance and `acme` is the tenant slug.

The `getKind()` utility (client and server) needs to recognise `'tenant'` as a valid kind. All other type utilities (`getParent`, `getInstance`, `buildType`, `parseRowType`) work correctly without changes since they operate on the string structure generically.

### Type map addition

| Row kind | Type format | Example |
|----------|------------|---------|
| Tenant | `{site}\|{name}:tenant` | `main\|acme:tenant` |

---

## Data Model Details

### Master site row

```
app=platform, type=main:site
data = {
  site_name: "My Platform",
  tenants: [
    { ref: "platform+main|acme:tenant", id: 123 },
    { ref: "platform+main|beta:tenant", id: 456 }
  ]
}
```

`tenants` is a `dms-format` attribute on the admin format — resolved automatically by `dmsDataLoader` just like `patterns` is today.

### Tenant row

```
app=platform, type=main|acme:tenant
data = {
  name: "Acme Corp",
  subdomain: "acme",
  app: "acme"           ← the tenant's own app namespace
}
```

`app` on the tenant row is the key that routes all subsequent data loading. By convention `app === subdomain`, but storing it explicitly avoids coupling.

### Tenant's own site

```
app=acme, type=main:site    ← same DMS_TYPE as master, different app
data = {
  site_name: "Acme Corp",
  patterns: [
    { ref: "acme+acme|my_docs:pattern", id: 789 }
  ]
}
```

This row lives in the `dms_acme` schema. It is a normal DMS site and works identically to a single-tenant site, just in a different schema.

### Tenant's patterns and pages

```
app=acme, type=acme|my_docs:pattern
app=acme, type=my_docs|page
```

Identical to single-tenant structure, scoped to `app=acme`.

---

## `dmsSiteFactory` Behavior

### Opt-in flag

`App.jsx` passes `isMultiTenant={true}` to `DmsSite`. This is the only change needed at the app level. The master `app` and `type` from `.env` are unchanged.

### Load sequence

#### Single-tenant mode (default, no flag)

Behavior is completely unchanged. No additional code paths are exercised.

#### Multi-tenant mode + subdomain detected

```
1. Load master site
   dmsDataLoader(falcor, dmsConfig)   ← dmsConfig.app = "platform"
   → siteData contains resolved tenant rows (via dms-format attribute)

2. Find matching tenant
   currentSubdomain = getSubdomain(window.location.host)  // e.g. "acme"
   tenant = siteData[0].tenants.find(t => t.subdomain === currentSubdomain)
   tenantApp = tenant.app  // "acme"

3. Build tenant config
   tenantConfig = {
     ...dmsConfig,
     app: tenantApp,
     format: { ...dmsConfig.format, app: tenantApp }
   }

4. Load tenant site
   tenantSiteData = await dmsDataLoader(falcor, tenantConfig)
   → fetches from dms_acme schema, returns tenant's patterns

5. Build routes
   pattern2routes(tenantSiteData, { ...props, dmsConfig: tenantConfig })
   → identical to single-tenant route building
```

#### Multi-tenant mode + no subdomain (platform admin)

```
1. Load master site (same as above)
2. No subdomain → skip tenant lookup
3. Return platform admin routes: TenantList view showing all tenants
```

### Subdomain detection

Uses the existing `getSubdomain(host)` from `render/spa/utils/index.js`. Already handles `.localhost` for local development. Reserved subdomains (`www`, etc.) already return `false`.

---

## Downstream Flow Verification

Once step 3 above sets `tenantConfig.app = "acme"`, all downstream code picks up the correct app through context. No additional changes required in those layers.

| Flow | Reads from | Value in multi-tenant | Correct? |
|---|---|---|---|
| Pattern loading (Falcor key) | `format.app` | `"acme"` | ✓ |
| Pattern creation | `AdminContext.app` | `"acme"` | ✓ |
| Admin group check (`isAdmin`) | `` `${app} Admin` `` | `"acme Admin"` | ✓ |
| Auth token requests | `PROJECT_NAME \|\| dmsConfig.app` | `"acme"` | ✓ |
| Signup | `project` in body | `"acme"` | ✓ |
| `initSetup` (tenant creation) | `project` in body | `"acme"` | ✓ |
| localStorage cache key | `app + '-' + type` | `"acme-main:site"` | ✓ (no collision) |
| Falcor cache | full path including app | scoped to `"acme"` | ✓ |

---

## Tenant Creation via Signup

Tenants are created through the signup page on the root domain (no subdomain, multi-tenant mode). The `/auth/signup` page shows additional fields when `isMultiTenant && !subdomain`: a subdomain input and a site name input.

### Signup flow (root domain, multi-tenant)

```
1. User fills in: subdomain ("acme"), name ("Acme Corp"), email, password

2. /init/setup  { project: "acme", email, password }
   → creates "acme Admin" + "acme Public" groups and project in auth server
   → creates user, assigns to "acme Admin"

3. Create tenant row in master site (Falcor call, app=platform)
   type = main|acme:tenant
   data = { subdomain: "acme", app: "acme", name: "Acme Corp" }

4. Add tenant ref to master site's tenants array
   (edit site row: append { ref: "platform+main|acme:tenant", id: <new id> })

5. Create tenant site in tenant app (Falcor call, app=acme)
   type = main:site
   data = { site_name: "Acme Corp" }

6. Create tenant auth pattern in tenant app (Falcor call, app=acme)
   type = acme|auth:pattern
   data = { pattern_type: "auth", name: "Auth", base_url: "auth", ... }

7. Redirect to {subdomain}.domain.com/login
   (full page navigation — token is not auto-set since the project differs)
```

The user then logs into `acme.domain.com/login` with `project="acme"`, receives a token, and navigates to `BASE_URL` (e.g. `/list`) where they see an empty pattern list ready to add patterns to.

### Files changed for signup flow

- `packages/dms/src/patterns/auth/pages/authSignup.jsx` — when `isMultiTenant && !subdomain`: render subdomain + name inputs; on submit, run the 7-step chain above instead of the standard `/signup/assign/group` call
- `packages/dms/src/patterns/auth/context.js` — surface `isMultiTenant` via `AuthContext` so `authSignup.jsx` can read it
- `packages/dms/src/patterns/auth/siteConfig.jsx` — pass `isMultiTenant` into auth context from pattern config

`createSite.jsx` is unchanged — it remains the bootstrap path for manually creating a site on a subdomain if needed (e.g. development or recovery).

---

## Auth Isolation

Each tenant is a separate auth project:

| | Project | Admin group | Public group |
|---|---|---|---|
| Platform | `"platform"` | `"platform Admin"` | `"platform Public"` |
| Tenant acme | `"acme"` | `"acme Admin"` | `"acme Public"` |
| Tenant beta | `"beta"` | `"beta Admin"` | `"beta Public"` |

Users signing up on `acme.myplatform.com` are added to `"acme Public"`. Tenant admins in `"acme Admin"` can promote users within their project. There is no cross-tenant permission bleed.

The platform admin (accessing the root domain) authenticates against the master project (`"platform"`).

---

## Platform Admin View

The root domain (no subdomain) in multi-tenant mode shows a `TenantList` component instead of the pattern list. This component:
- Reads `siteData[0].tenants` (already loaded in step 1)
- Displays tenant name, subdomain, and a link to `subdomain.myplatform.com/list`
- Allows adding new tenants (creates a tenant row in the master site)
- Removing a tenant removes the row from the master site (does not delete tenant data)

Auth pattern management, user/group management, and site-level theme editing remain on the platform admin's view.

---

## Files Requiring Changes

### Type utilities

| File | Change |
|---|---|
| `packages/dms/src/utils/type-utils.js` | Add `'tenant'` to `getKind()` |
| `packages/dms-server/src/db/type-utils.js` | Same |

### Admin format

| File | Change |
|---|---|
| `packages/dms/src/patterns/admin/admin.format.js` | Add `tenants` dms-format attribute alongside `patterns`. Site rows in multi-tenant mode populate `tenants`; single-tenant rows leave it empty — both can coexist in the format definition. |

### Site factory

| File | Change |
|---|---|
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Accept `isMultiTenant` prop. In multi-tenant mode: two-step load (master site → find tenant → load tenant with overridden app). Platform admin path returns tenant list routes. |

### Admin pages

| File | Change |
|---|---|
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | Add `TenantList` branch when `!subdomain && isMultiTenant`. Existing `PatternList` branch unchanged. |
| `packages/dms/src/patterns/admin/siteConfig.jsx` | Pass `isMultiTenant` into admin context; add tenant list route. |

### App entry

| File | Change |
|---|---|
| `src/App.jsx` | Add `isMultiTenant={true}` prop to `DmsSite` when operating in multi-tenant mode. |

### No changes required

- `createSite.jsx` — reuses existing flow against tenant's app
- `authSignup.jsx` — project derived from `app` in context, already correct
- `dmsDataLoader` / `dmsDataEditor` — no changes, works against any app
- `dms.route.js` / `dms.controller.js` — no new Falcor routes needed
- Auth server — no changes, existing project/group model handles tenants

---

## Implementation Phases

### Phase 1 — Type infrastructure (~2 hrs)
- Add `'tenant'` to `getKind()` in both type-utils files
- Add `tenants` dms-format attribute to admin format
- Add `isMultiTenant` prop to `DmsSite` type signature (no behavior yet)

### Phase 2 — Two-step load in `dmsSiteFactory` (~half day)
- Subdomain detection + tenant match
- Build `tenantConfig` with overridden app
- Second `dmsDataLoader` call against tenant app
- Platform admin path (no subdomain): return tenant list data
- Single-tenant path: zero changes

### Phase 3 — Platform admin tenant list (~half day)
- New `TenantList` component in admin pattern
- Shown when `!subdomain && isMultiTenant`
- Add / remove tenant rows via existing DMS create/delete routes

### Phase 4 — Integration and end-to-end testing (~half day)
- Wire `isMultiTenant` in `App.jsx`
- Test: platform admin sees tenant list
- Test: tenant admin on subdomain sees their patterns
- Test: new tenant bootstraps via `/create` on first visit
- Test: signup/login uses correct project per subdomain
- Test: single-tenant deployment with no flag is unaffected

---

## Open Questions

1. **Tenant creation UX**: Currently platform admin creates tenant rows manually. Should there be a self-serve flow where users navigate to their desired subdomain and bootstrap themselves? This can be added later without changing the core architecture.

2. **Tenant deletion**: Removing a tenant row from the master site orphans the tenant's `dms_<app>` schema. A cleanup step (archive or hard delete) would need to be defined separately.

3. **Per-app split mode**: For full schema isolation (`dms_acme`, `dms_beta`), the server must run with `DMS_SPLIT_MODE=per-app`. In legacy mode, all apps share `data_items` but are still namespaced by `app` column — isolation holds at the query level but not at the schema level. Either mode is supported; per-app is recommended for production multi-tenant deployments.
