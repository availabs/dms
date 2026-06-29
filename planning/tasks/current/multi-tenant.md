# Multi-Tenant DMS

## Objective

Extend DMS so a single deployment can serve multiple isolated tenants, each on their own subdomain, each with their own data schema and auth project. Single-tenant deployments are fully unaffected.

## Scope

- New `tenant` DMS row kind following existing type conventions
- Master site refs tenants the same way it currently refs patterns
- Each tenant has its own `app` and lives in its own `dms_<app>` schema
- `dmsSiteFactory` two-step load: master site → identify tenant by subdomain → load tenant's content
- Platform admin (no subdomain) sees a tenant list instead of a pattern list
- Opt-in via `isMultiTenant` flag in `App.jsx` — no behavior change for existing deployments

## Reference

Design document: [`planning/research/multi-tenant-design.md`](../../research/multi-tenant-design.md)

---

## Data Model

```
Master site:  app=platform, type=main:site
                └─ tenants: [ref → tenant rows]   ← dms-format attribute

Tenant row:   app=platform, type=main|acme:tenant  ← in master schema
                data: { subdomain: "acme", app: "acme", name: "Acme Corp" }

Tenant site:  app=acme, type=main:site             ← in dms_acme schema
                └─ patterns: [ref → pattern rows]

Tenant data:  app=acme, type=acme|my_docs:pattern
              app=acme, type=my_docs|page
```

Type convention for tenants: `{site_instance}|{tenant_slug}:tenant` (e.g. `main|acme:tenant`)

---

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms/src/utils/type-utils.js` | Add `'tenant'` to `getKind()` |
| `packages/dms-server/src/db/type-utils.js` | Same |
| `packages/dms/src/patterns/admin/admin.format.js` | Add `tenants` dms-format attribute |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Accept `isMultiTenant`; two-step load |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | `TenantList` branch for platform admin |
| `packages/dms/src/patterns/admin/siteConfig.jsx` | Pass `isMultiTenant` through context |
| `packages/dms/src/patterns/auth/pages/authSignup.jsx` | Tenant creation flow when `isMultiTenant && !subdomain` |
| `packages/dms/src/patterns/auth/context.js` | Expose `isMultiTenant` via `AuthContext` |
| `packages/dms/src/patterns/auth/siteConfig.jsx` | Pass `isMultiTenant` into auth context |
| `src/App.jsx` | Add `isMultiTenant` prop |

No changes to: `createSite.jsx`, `dmsDataLoader`, `dmsDataEditor`, `dms.route.js`, `dms.controller.js`, auth server.

---

## Phases

### Phase 1 — Type infrastructure — COMPLETE

- [x] Add `'tenant'` to `getKind()` in `packages/dms/src/utils/type-utils.js` (documented in comment; getKind is already generic)
- [x] Add `'tenant'` to `getKind()` in `packages/dms-server/src/db/type-utils.js` (same)
- [x] Add `tenants` dms-format attribute to admin format in `admin.format.js`
  - Alongside `patterns`; site rows in single-tenant mode simply have `tenants` empty
  - Use the same ref shape as `patterns`: `{ ref: "app+type", id: n }`
  - Added `tenant` format export and `TenantList` placeholder component
- [x] Add `isMultiTenant` prop to `DmsSite` function signature (no behavior yet)

### Phase 2 — Two-step load in `dmsSiteFactory` — COMPLETE

- [x] In `DmsSite`, pass `isMultiTenant` down into `routeProps`
  - Also skip master-app localStorage cache when on a tenant subdomain (avoids brief platform admin flash)
- [x] In `dmsSiteFactory`, after loading master site data:
  - [x] If `!isMultiTenant`: return existing `pattern2routes` call unchanged
  - [x] If `isMultiTenant` + subdomain detected:
    - [x] Find tenant in `siteData[0].tenants` where `tenant.subdomain === currentSubdomain`
    - [x] If no match: return "not found" route
    - [x] Build `tenantConfig`: clone `dmsConfig`, swap `app`, `format.app`, `format.registerFormats[*].app`, `format.attributes[*].format` prefix to `tenantApp`
    - [x] Second `dmsDataLoader` call with `tenantDmsConfigUpdated`
    - [x] Call `pattern2routes(tenantData, { ...config, dmsConfig: tenantDmsConfig })`
  - [x] If `isMultiTenant` + no subdomain (platform admin):
    - [x] Return `pattern2routes(data, config)` — master site routes; Phase 3 renders TenantList inside editSite

### Phase 3 — Platform admin tenant list — COMPLETE

- [x] New `TenantList` component added directly in `editSite.jsx`
  - Shows tenant name, subdomain, link to `subdomain.baseDomain/adminPath`
  - Add tenant: creates `${siteInstance}|${slug}:tenant` row via falcor.call, appends ref to site's tenants array
  - Remove tenant: removes the ref from the site's tenants array (does not delete tenant data)
  - Inline `getSubdomainFromHost()` helper avoids circular import with `render/spa/utils`
- [x] In `editSite.jsx`, branch on `isMultiTenant && !getSubdomainFromHost()` → render `TenantList`
- [x] In `siteConfig.jsx`, `isMultiTenant` added to `adminConfig` params and `AdminContext` value
- [x] In `render/spa/utils/index.js`, `isMultiTenant` destructured from props and forwarded to each pattern configObj

### Phase 4 — Tenant signup on root domain — COMPLETE

- [x] `dmsSiteFactory.jsx` (`DmsSite`): pass `isMultiTenant` and `siteType: dmsConfig.type` to `authProvider`
- [x] `providers.jsx` (`authProvider`): accept `isMultiTenant` and `siteType`; include both in `AuthContext.Provider` value
- [x] `authSignup.jsx`: full tenant creation flow when `isMultiTenant && !currentSubdomain`:
  - Detects root domain via hostname parts (same logic as `getSubdomain`, inline to avoid circular import)
  - Shows Organisation Name + Subdomain fields above email/password
  - Validates: subdomain required, `/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/`, reserved word list
  - 7-step chain: `/init/setup` → create tenant row → append ref to master site → create tenant site → create auth pattern → add pattern ref to tenant site → full-page redirect to `${slug}.${host}${baseUrl}/login`
  - Master site current tenants read via `falcor.get` + `falcor.getCache()` ref resolution + `$atom` unwrap
  - Auth pattern created with `subdomain: slug` so `pattern2routes` includes it on the tenant subdomain
  - Inline error display; "Creating…" button state during submission
- [x] Standard single-user signup path unchanged (when `!isMultiTenant || currentSubdomain`)

**Bug fixes and enhancements applied post-completion:**

*Signup flow*
- `authSignup.jsx:87-89`: `falcor.getCache()` cache navigation used wrong `['json', ...]` prefix — fixed to `['dms', ...]` (getCache returns the raw cache without a `json` wrapper)
- `authSignup.jsx` step 5: auth pattern was missing `subdomain: slug` — `pattern2routes` filters patterns by subdomain field, so tenant patterns must carry their subdomain to be included on the tenant subdomain

*Pattern creation — subdomain auto-injection*
- `editSite.jsx` `PatternList.addNewValue`: auto-inject `subdomain = getSubdomainFromHost()` when `isMultiTenant` and on a tenant subdomain
- `patternList.jsx` `PatternEdit.addNewValue`: same auto-inject via inline hostname detection
- `settings.jsx` `PatternSettingsEditor`: subdomain field disabled (not editable) when on a tenant subdomain; field hidden entirely in `editSite.jsx` and `patternList.jsx` add/edit modals

*`isMultiTenant` propagation fix*
- `siteConfig.jsx` `patternConfig`: was silently dropping `isMultiTenant` from its props — added to destructure params and to the `AdminContext.Provider` value so `settings.jsx` and other pattern-level components receive it correctly

*Platform admin `/list` page*
- `editSite.jsx` `SiteEdit`: when `isPlatformAdmin`, now renders both `TenantList` and `PatternList` in a fragment (previously only showed TenantList, hiding master site patterns)
- `editSite.jsx` `TenantList`: upgraded from tenant-row-only to full provisioning (auth project + site + auth pattern + template patterns); modal now collects email + password for the initial admin; shows site template picker — see `tasks/completed/site-templates-tenant-support.md`

*Create site redirect*
- `siteConfig.jsx`: added `action: "list"` to the `create` route so the DMS framework loads site data before rendering `NewSite`
- `createSite.jsx` `NewSite`: added `dataItems` prop + `useNavigation` guard (same pattern as `editSite.jsx`); redirects to `baseUrl` when a site already exists instead of showing the creation form

### Phase 5 — Wire `App.jsx` and end-to-end testing — COMPLETE

- [x] `src/App.jsx`: reads `VITE_DMS_MULTI_TENANT=1` env var → passes `isMultiTenant={IS_MULTI_TENANT}` to `DmsSite`
- [x] `.env.example`: documents `VITE_DMS_MULTI_TENANT` (commented out by default)

**Static checks (verified):**
- [x] `getKind('main|acme:tenant')` → `'tenant'` ✓
- [x] `getInstance('main|acme:tenant')` → `'acme'` ✓
- [x] `getParent('main|acme:tenant')` → `'main'` ✓

**Integration tests (require running server — manual verification needed):**
- [ ] Root domain signup creates tenant infrastructure end-to-end
  - Tenant row exists in master app after signup
  - Tenant site + auth pattern exist in `app=subdomain`
  - Redirect lands on `{subdomain}.domain/login`
  - Login with tenant credentials succeeds (`project=subdomain`)
  - `/list` on subdomain shows empty pattern list (not `/create`)
- [ ] Platform admin (no subdomain) sees `TenantList` at `/list`
- [ ] Tenant admin on `acme.localhost:3000` sees their own patterns
- [ ] Tenant's auth pattern `authPermissions` gates `/list` on subdomain correctly
- [ ] Regular user signup on tenant subdomain uses existing flow (`project=subdomain`)
- [ ] Single-tenant deployment with no `VITE_DMS_MULTI_TENANT` flag is completely unaffected
- [ ] `DMS_SPLIT_MODE=per-app` gives each tenant its own schema (`dms_acme`)

---

## Downstream Flow Verification (from design doc)

Once `tenantConfig.app = "acme"` is set, all downstream code is unchanged:

| Flow | Value | Correct? |
|---|---|---|
| Pattern Falcor key | `"acme+main:site"` | ✓ |
| Pattern creation (`AdminContext.app`) | `"acme"` | ✓ |
| Admin group check (`` `${app} Admin` ``) | `"acme Admin"` | ✓ |
| Auth `PROJECT_NAME` fallback | `"acme"` | ✓ |
| localStorage cache key | `"acme-main:site"` | ✓ no collision |

---

## Testing Checklist

- [x] `getKind('main|acme:tenant')` returns `'tenant'`
- [x] `getInstance('main|acme:tenant')` returns `'acme'`
- [x] `getParent('main|acme:tenant')` returns `'main'`
- [ ] Master site loads with `tenants` resolved (same as `patterns` today)
- [ ] Subdomain `acme.localhost:3000` loads `app=acme` content (not master app)
- [ ] `localhost:3000` shows tenant list in multi-tenant mode
- [ ] `localhost:3000` admin checks pass for `"platform Admin"` group
- [ ] `acme.localhost:3000` admin checks pass for `"acme Admin"` group
- [ ] Root domain signup (multi-tenant) shows subdomain + name fields
- [ ] Signup creates: auth project, tenant row, tenant site, tenant auth pattern — in that order
- [ ] Signup redirects to `{subdomain}.domain/login` after completion
- [ ] Tenant auth pattern `authPermissions` gates `/list` on subdomain correctly
- [ ] Regular signup on tenant subdomain (existing flow) unchanged
- [ ] Existing single-tenant site unchanged when `isMultiTenant` is not set
- [ ] `DMS_SPLIT_MODE=per-app` gives each tenant its own schema (`dms_acme`)
