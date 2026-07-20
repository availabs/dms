# Site Templates — Tenant Support

## Status: DONE — 2026-06-28

## Objective

Extend the site template picker (currently only in `createSite.jsx`) to the two tenant-creation
flows: the platform-admin "Add tenant" modal (`TenantList` in `editSite.jsx`) and the self-service
tenant signup (`authSignup.jsx`). Both flows should show the same template picker and provision
the same pattern/page/dataset infrastructure that site creation does.

## Problem

`createSite.jsx` was shipped with a full template picker and provisioning loop. The tenant flows
were not updated alongside it:

- `TenantList.addTenant` in `editSite.jsx` creates only a tenant _row_ — no site, no auth
  project, no auth pattern, no template patterns.
- `authSignup.jsx` tenant flow provisions auth project + site + auth pattern but has no template
  picker and creates no template patterns.

A tenant created via either flow lands on a subdomain that has no usable content.

## Scope

- Extract `wireSection` + template provisioning loop into a shared utility so they can be called
  from three places without duplication.
- Extract `SiteTemplatePicker` as a shared component (used in `createSite`, `TenantList`, and
  `authSignup`).
- Upgrade `TenantList.addTenant` to do full provisioning (auth project + site + auth + template
  patterns), including email/password fields for the new admin.
- Upgrade `authSignup.jsx` tenant flow to show template picker and create template patterns.
- Refactor `createSite.jsx` to use the shared utilities (no behavior change).

## Files

| File | Change |
|---|---|
| `packages/dms/src/utils/tenantProvisioning.js` | New — `wireSection` + `provisionTemplatePatterns` |
| `packages/dms/src/patterns/admin/pages/SiteTemplatePicker.jsx` | New — shared template picker card grid |
| `packages/dms/src/patterns/admin/pages/createSite.jsx` | Use shared utils + `SiteTemplatePicker`; remove local `wireSection` |
| `packages/dms/src/patterns/admin/pages/editSite.jsx` | `TenantList` full provisioning + template picker |
| `packages/dms/src/patterns/auth/pages/authSignup.jsx` | Tenant flow: template picker + `provisionTemplatePatterns` |

---

## Implementation Plan

### Phase 1 — Shared utility `tenantProvisioning.js` — DONE

Extract from `createSite.jsx`:
- `wireSection(section, sourceId, viewId, attrs, env, app, sourceSlug, srcEnv)` — unchanged logic
- `provisionTemplatePatterns(falcor, { app, siteInstance, selectedTemplateId, siteTemplates, pageTemplates, adminGroupName })`
  - Loops `selectedTemplate.patterns`
  - Creates page patterns (with optional `wireSection` for wired pages)
  - Creates datasets patterns (dmsEnv + source + views + seed rows + wiredContext)
  - Returns `{ allPatternRefs, allEnvRefs }` (auth pattern NOT included — caller adds it)

File: `packages/dms/src/utils/tenantProvisioning.js`

### Phase 2 — Shared `SiteTemplatePicker` component — DONE

New component `SiteTemplatePicker({ siteTemplates, selectedTemplateId, onSelect })`:
- Reads `ThemeContext` for `theme?.admin?.createSite` with `createSiteTheme` as fallback
- Renders a grid of template cards (same visual as current `createSite.jsx` picker)
- Returns `null` when `siteTemplates` is empty

File: `packages/dms/src/patterns/admin/pages/SiteTemplatePicker.jsx`

### Phase 3 — Refactor `createSite.jsx` — DONE

- Import `provisionTemplatePatterns` from `../../../utils/tenantProvisioning`
- Import `SiteTemplatePicker` from `./SiteTemplatePicker`
- Remove local `wireSection` function (~60 lines)
- Replace the `for (patternSpec of selectedTemplate.patterns)` loop with
  `await provisionTemplatePatterns(falcor, { app, siteInstance, selectedTemplateId, siteTemplates, pageTemplates, adminGroupName: PROJECT_NAME })`
- Replace the inline template picker JSX with `<SiteTemplatePicker ...>`

### Phase 4 — Upgrade `authSignup.jsx` tenant flow — DONE

- Import `provisionTemplatePatterns` from `../../../utils/tenantProvisioning`
- Import `SiteTemplatePicker` from `../../admin/pages/SiteTemplatePicker`
- Add `selectedTemplateId` state (default `'simple_site'`)
- Get `siteTemplates` from `theme?.site_templates ?? []`, `pageTemplates` from `theme?.page_templates ?? []`
- Render `<SiteTemplatePicker>` between FieldSet and submit button
- After step 5 (create auth pattern), before step 6 (update tenant site):
  - Call `provisionTemplatePatterns(falcor, { app: slug, siteInstance, selectedTemplateId, siteTemplates, pageTemplates, adminGroupName: slug })`
  - Build `allPatternRefs = [authPatternRef, ...templateRefs]`
  - Build `siteUpdate = { patterns: allPatternRefs, ...(envRefs.length ? { dms_envs: envRefs } : {}) }`
  - Replace the old step-6 `falcor.call` with the merged site update

### Phase 5 — Upgrade `TenantList` in `editSite.jsx` — DONE

Changes to `TenantList` function:
- Import `AuthContext` from auth context (already available in tree)
- Import `provisionTemplatePatterns` from `../../../utils/tenantProvisioning`
- Import `SiteTemplatePicker` from `./SiteTemplatePicker`
- Add state: `selectedTemplateId = 'simple_site'`, `submitting = false`
- Expand `newItem` to include `email` and `password` fields
- Add `AuthAPI` from `React.useContext(AuthContext)`
- Get `siteTemplates` from `theme?.site_templates ?? []`, `pageTemplates` from `theme?.page_templates ?? []`

Upgrade `addTenant`:
```
1. Validate: slug, email required
2. AuthAPI.callAuthServer('/init/setup', { email, password, project: slug })
3. Create tenant row in master app (existing)
4. onChange/onSubmit to append tenant ref to master site (existing)
5. Create tenant site: falcor.call(['dms','data','create'], [slug, `${siteInstance}:site`, { site_name }])
6. Create auth pattern: falcor.call(['dms','data','create'], [slug, `${siteInstance}|auth:pattern`, { ... subdomain: slug }])
7. provisionTemplatePatterns(falcor, { app: slug, siteInstance, selectedTemplateId, siteTemplates, pageTemplates, adminGroupName: slug })
8. Update tenant site with all pattern refs + env refs
```

Add to modal: Name, Subdomain, Admin Email, Admin Password inputs + `<SiteTemplatePicker>`.

---

## Testing Checklist

- [ ] `createSite.jsx` behavior unchanged (Simple Site / Report / Dashboard / Blank all create same content as before)
- [ ] `authSignup.jsx` tenant flow shows template picker; selecting Simple Site creates page pattern + page; selecting Dashboard creates datasets + page pattern; Blank creates auth only
- [ ] `TenantList` Add tenant modal has Name, Subdomain, Email, Password + template picker
- [ ] `TenantList` Add tenant with Simple Site → tenant subdomain has site + auth + pages pattern + one blank page
- [ ] `TenantList` Add tenant with Blank → tenant subdomain has site + auth only
- [ ] Platform admin can navigate to tenant subdomain and it loads correctly
- [ ] Tenant admin can log in with the credentials provided during platform-admin add
