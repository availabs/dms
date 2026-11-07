# Tenants on their own domains, with their pattern subdomains

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** next · **Created by:** ssangdod@albany.edu · **Edited by:** —

**Topic:** dms-manager / multi-tenant · **Started:** 2026-11-06

## Objective

Let a tenant register an external domain (e.g. `mitigateny.org`). The tenant is then served at that
domain, and its patterns that live on their own subdomains are served at `<sub>.<external domain>`, as
they were before the site became a tenant. Starts after the hub is running
([tenant-hub-server.md](../../../../../planning/shared/tasks/current/tenant-hub-server.md)).

## Current state

- Tenant lookup (`render/spa/dmsSiteFactory.jsx` ~408–437) takes the host's first label as the tenant
  subdomain; the same label is then used as the pattern subdomain in `pattern2routes`
  (`mountsForSubdomain`). So inside a tenant, a pattern with subdomain `''` doesn't match, and a
  pattern on its own subdomain can't be reached (`transit.mny.<domain>` is two labels deep, and the
  parser reads one).
- The hub copy works around both with data:
  [tenant-hub-copy-script.md](../../../../../planning/shared/tasks/current/tenant-hub-copy-script.md)
  rewrites `''` to the tenant subdomain and adds root `locations` for subdomain patterns.
- Host parsing is repeated in `getSubdomain` (`render/spa/utils`), `getSubdomainFromHost` (editSite),
  inline in `authSignup.jsx` and `patternList.jsx`, and `getBaseHost` (`utils/subdomainPath.js`, used by
  `sub://` links and retired-subdomain redirects). The SSR handler goes through `getSubdomain`.
- The login project on a tenant host is the subdomain (`dmsSiteFactory.jsx:53`).

## Proposed changes

1. **Tenant row:** `domains: ["mitigateny.org"]`.
2. **One host resolver in `utils/`** returning `{ tenant, patternSubdomain }`, replacing the copies above:
   - `<x>.<root domain>` → tenant `x`, pattern subdomain `''`;
   - `<external domain>` → that tenant, `''`;
   - `<sub>.<external domain>` → that tenant, `sub`.
   `pattern2routes`, `sub://` links, retired-subdomain redirects and the tenant/platform-admin checks
   all use it. **This makes the copy script's `''` rewrite and its root `locations` unnecessary**:
   patterns keep their original subdomains. Remove both from
   [tenant-hub-copy-script.md](../../../../../planning/shared/tasks/current/tenant-hub-copy-script.md)
   (or default its flag off) once this ships.
3. **Login project from the tenant row** (`tenant.app`) rather than the subdomain, so an external
   domain logs into the right project.
4. **Root site's tenant list** knows the root domain (from config or the request), so a tenant on
   `<x>.<root domain>` and one on its own domain both resolve.
5. **Server / deploy:** the hub's nginx and certificates cover each tenant's external domain and its
   pattern subdomains. Wildcard certificates need a DNS record our tooling can write only at Namecheap:
   for a client's own domain, list each pattern subdomain (HTTP challenge) or have the client add the
   records.
6. **Tenants tab:** a domains field per tenant.

## Testing checklist

- [ ] Tenant reachable at `<x>.<root>` and at its external domain, same content
- [ ] `''` patterns render at the external domain's root without the copy-script rewrite
- [ ] `<sub>.<external domain>` serves that pattern; `sub://` links stay on the external domain
- [ ] Login on the external domain uses the tenant's project
- [ ] SSR resolves the same tenant as the client for every host form
- [ ] Single-tenant sites unchanged
