# Tenants on their own domains, with their pattern subdomains

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) · **Status:** doing · **Created by:** ssangdod@albany.edu · **Edited by:** ssangdod@albany.edu

**Topic:** dms-manager / multi-tenant · **Started:** 2026-11-06 · **Branch:** `tenant-domains` (dms and dms-template)

## Objective

A tenant's patterns that live on their own subdomains are served again, as they were before the site
became a tenant, at two kinds of host:

- **Nested under the hub's domain (Phase A, first):** `<sub>.<tenant>.availabs.com`, e.g.
  `albany.mny.availabs.com` for a MitigateNY county pattern. Owner, 2026-11-09.
- **On the tenant's own domain (Phase B):** the tenant registers an external domain (e.g.
  `mitigateny.org`), is served at that domain, and its subdomain patterns at `<sub>.<external domain>`.

The hub runs at availabs.com since 2026-11-09
([tenant-hub-server.md](../../../../../planning/shared/tasks/completed/tenant-hub-server.md)).

## Current state

- Tenant lookup (`render/spa/dmsSiteFactory.jsx` ~408–437) takes the host's first label as the tenant
  subdomain; the same label is then used as the pattern subdomain in `pattern2routes`
  (`mountsForSubdomain`). So inside a tenant, a pattern with subdomain `''` doesn't match, and a
  pattern on its own subdomain can't be reached (`transit.mny.<domain>` is two labels deep, and the
  parser reads one: it would look up tenant `transit` → "Tenant not found").
- The hub copy works around the first with data:
  [tenant-hub-copy-script.md](../../../../../planning/shared/tasks/completed/tenant-hub-copy-script.md)
  rewrites `''` to the tenant subdomain (`mny`, `tny`) and adds root `locations` for subdomain patterns;
  its apply report records each pattern's original `subdomain` / `base_url`.
- Host parsing is repeated in `getSubdomain` (`render/spa/utils/index.js:22`), `getSubdomainFromHost`
  (`editSite.jsx:16`, and inline at :239), inline in `authSignup.jsx:47`, `patternList.jsx:201,240` and
  `patternEditor/default/settings.jsx:137`, and `getBaseHost` (`utils/subdomainPath.js`, used by `sub://`
  links and retired-subdomain redirects). The SSR handler goes through `getSubdomain`.
- **Server side:** dms-server's `utils/subdomain.js` `getSubdomain(req)` (a hand mirror, from `Origin`)
  feeds per-subdomain grants (`grantsAt(…, { subdomain })`) in `routes/auth`, `auth/index.js`, sync
  writes, DAMA upload / datatypes / tiles auth. On the hub today it returns the tenant label (`mny`),
  which matches the copy's rewritten pattern subdomains.
- The login project on a tenant host is the subdomain (`dmsSiteFactory.jsx:53`).
- **Infrastructure:** `*.availabs.com` (DNS record and certificate) covers one label only;
  `x.mny.availabs.com` has no DNS and would fail TLS. nginx's `*.availabs.com` server name already matches
  any depth. The DNS hook (`deploy/acme_namecheap_dns.mjs`) treats each `*.<domain>` host's `<domain>` as
  a Namecheap zone and `splitDomain` accepts only `sld.tld`, so `*.mny.availabs.com` can't be issued yet.

## Compatibility: why a branch (2026-11-09)

Every site runs this code: the production dms-server and the hosted sites build from master, and the
host parser decides routing (pattern mounts, `sub://` links, retired-subdomain redirects) and, on the
server, per-subdomain grants. A change in how a host is read can move a site's patterns or permissions.
The DNS hook also renews the existing sites' certificates (certbot saved it for devtny, transportny,
weatherenterprise). So the work stays on `tenant-domains` in both repos until it's tested end to end;
no merge to master or deploy before.

**Rule for the code:** the new reading is **opt-in by a configured root domain** (`VITE_DMS_ROOT_DOMAIN`
on the client, `DMS_ROOT_DOMAIN` on the server; only the hub sets them). Without it every resolver
returns exactly what today's code returns, and that is pinned by tests for each host form the existing
sites use (`www.`, `hazardmitigation.`, `npmrds.devtny.org`, `*.localhost`, bare IPs, ports).

## Plan

### Phase A: `<sub>.<tenant>.<root domain>` — IN PROGRESS

1. **One host resolver** in `packages/dms/src/utils/hostResolver.js`:
   `resolveHost(host, { rootDomain, isMultiTenant })` → `{ tenant, patternSubdomain, baseHost }`.
   - no root domain: today's behaviour (first label; `tenant` = that label when multi-tenant, and
     `patternSubdomain` = the same label, as now);
   - `<root>` → tenant `''`, pattern `''`; `<t>.<root>` → tenant `t`, pattern `''`;
     `<p>.<t>.<root>` → tenant `t`, pattern `p`; deeper → tenant = last label, pattern = the rest
     joined (`a.b`), which no pattern has, so the tenant's 404.
   - `baseHost` for `sub://` links: `<t>.<root>` inside a tenant, so links stay under the tenant.
   Replaces `getSubdomain`, `getSubdomainFromHost`, the inline copies and `getBaseHost` (keep the old
   exports as thin callers for existing importers). Unit tests, legacy forms included.
2. **dmsSiteFactory / pattern2routes / SSR:** tenant lookup by `tenant`, mounts by `patternSubdomain`;
   the SSR handler's per-host cache keyed by the full host (already).
3. **Login project:** stays the host's tenant label (now from the resolver, so `albany.mny.<root>` logs
   into `mny`). Reading `tenant.app` instead needs the tenant row before auth starts; it matters only for
   external domains, so it moves to Phase B.
4. **Server mirror:** `dms-server/src/utils/subdomain.js` gets the same rule (hand mirror, no import),
   returning the pattern subdomain for grants when `DMS_ROOT_DOMAIN` is set.
5. **Hub data:** undo the copy script's root rewrite (`mny`/`tny` → `''`, drop the added root
   `locations`) from the apply report's originals, and default the script's flag off. Must land together
   with the code on the hub (the code alone would make `mny.availabs.com` look for `''` patterns).
6. **Infrastructure:**
   - DNS: `*.mny` and `*.tny` A records in the availabs.com zone (per tenant).
   - Certificate: `*.mny.availabs.com`, `*.tny.availabs.com` added to `dms-server-hub`; adding a tenant
     reissues it.
   - DNS hook: map a `*.<x>.<zone>` name to its Namecheap zone and write `_acme-challenge.<x>`; existing
     single-level zones unchanged (diff the plan for every current site).
   - `targets.json` `ownServers.hub.hosts` + `env.VITE_DMS_ROOT_DOMAIN`; `server.env` `DMS_ROOT_DOMAIN`.
7. **Expect:** the login token is per host (`localStorage`), so signing in on `mny.availabs.com` doesn't
   carry to `albany.mny.availabs.com` — as on the original sites across their subdomains.

### Phase B: domain aliases — IN PROGRESS (design 2026-11-10, build started 2026-11-11)

Netlify model (owner, 2026-11-10): every tenant gets a **default domain** from the hub
(`<tenant>.availabs.com`), every subdomain pattern a default host under it (`<sub>.<tenant>.availabs.com`,
Phase A), and the tenant can add **domain aliases**: domains it owns, served the same way
(`devmny.org`, `albany.devmny.org`). Aliases serve; they don't redirect. **Domain aliases first**; a
host alias (one exact host → tenant + pattern) is not planned.

**Where it lives:** a new **tenant overview** page, `/list/tenants/:tenantId` on the platform root,
opened from a tenant's name on the Tenants tab. It gets its own sidenav group, as an open pattern does.
Mockups: `src/themes/tessera/design_system_v6/pages/admin-tenant-overview.html` (identity, auth
project, **domains**, pattern subdomains, danger zone) and `admin-tenants.html` (names link to it,
`domains` column).

1. **Tenant row:** `aliases: [{ domain: 'devmny.org' }]`, edited on the tenant overview's domains card.
   On save: lowercase, no scheme/port, unique across tenants, not the root domain or under it.
2. **Resolver:** host under the root domain → Phase A. Otherwise the longest alias the host ends with:
   `<alias>` → that tenant, pattern `''`; `<sub>.<alias>` → that tenant, `sub`. Otherwise not found. The
   map is built from the root site's tenant rows, so the alias step runs after the root site loads
   (`dmsSiteFactory` Step 1); `resolveHost` takes the map as an argument.
3. **Login project from `tenant.app`** (Plan step 3, moved here): on an alias host the label means
   nothing, so `DmsSite` can't set the project from the host before the tenant is resolved.
4. **Server:** `utils/subdomain.js` needs the alias map for grants (read the root site's tenants, cache,
   refresh on change); CORS allows alias origins (the hub's client calls `https://availabs.com`).
**Decided 2026-11-10 (owner):** tenant admins add aliases, verified by DNS; a **primary domain**.

6. **Verification:** an alias is saved unverified and not served. The card shows a per-tenant TXT token
   (`_dms-verify.<domain>` = `dms-verify=<token>`) plus the A / `*` records. The hub server checks TXT and
   A, on "check now" and on a schedule, and writes `verified_at` / status on the alias; unverified after
   7 days → dropped. The TXT proves control of the domain: DNS pointing at the hub alone doesn't say
   *which* tenant the owner meant. The card shows in the tenant's own admin too (its site overview), as well
   as on the root's tenant overview.
7. **Primary domain:** `primary: '<domain>'` on the tenant row (default: the default domain), selectable
   only for a verified, HTTPS-on domain. It's the host for generated links, `sub://`, emails. **Redirect in
   dms-server, not nginx:** a request for a page on a tenant host that isn't primary → 301 to the same
   pattern subdomain and path on the primary (`albany.mny.availabs.com/x` → `albany.devmny.org/x`). It's
   a middleware in front of the SSR handler, using the server's resolver mirror (`utils/subdomain.js`)
   and the cached alias map, so a change of primary is live without an nginx reload. Never redirected: API
   routes (`/graph`, `/sync`, `/auth`, `/dama-admin`, uploads), `/.well-known/`, and the tenant admin
   (`/list`) on the default domain (the way back if an alias breaks). SPA-only builds have no server
   step: a client fallback in `dmsSiteFactory` (as retired-subdomain redirects do) covers them.
8. **Certificates and the front proxy: out of scope (owner, 2026-11-10).** An alias is assumed to arrive
   valid — its HTTPS and its routing to the hub are in place outside the hub — so nginx and certificates
   are not updated per alias, and the card shows no HTTPS column or `_acme-challenge` record. The hub's
   part is verification (TXT + A), serving a verified alias, and the primary redirect. (`sites_https.mjs`'
   `lookup()` is a model for the A check; nothing there reads the DB.)
9. **Tenant side (mockup `admin-site-domains.html`):** `/list/domains` in the tenant's own admin
   (`mny.availabs.com/list/domains`), a sidenav entry shown to a user with **`manage-domains`**, a
   site-level verb on the tenant's site row (CLAUDE.md rule 3). Same domains + pattern-subdomains cards as
   the root's tenant overview; no name, subdomain or removal (hub staff only). The aliases live on the
   hub's tenant row, and a tenant admin has no grants in the hub's app, so add / remove / make primary /
   check now go through a server route that checks `manage-domains` on the tenant's site and writes the
   hub row. Another tenant's domain is refused as "in use on this hub", without naming it.

### Progress (2026-11-09, branch `tenant-domains`, uncommitted)

- [x] **1. Resolver:** `packages/dms/src/utils/hostResolver.js` — `setRootDomain` / `getRootDomain`,
  `resolveHost`, `legacyFirstLabel` (the admin copies' old reading), `hostTenant`, `newPatternSubdomain`.
  `hostResolver.test.js`: 8 tests (inert without a root domain; legacy forms; root, tenant, nested, deeper,
  ports, case, `www`; outside the root domain → legacy). `src/utils` + `src/render` vitest: 50/50.
- [x] **2. Wiring:**
  - `render/spa/utils`: `getTenantSubdomain` / `getPatternSubdomain` (both `getSubdomain` without a root
    domain); `pattern2routes` mounts, grants, filters and retired redirects by the pattern subdomain, and
    passes `tenantSubdomain` to every pattern config next to `subdomain`.
  - `dmsSiteFactory`: `rootDomain` prop → `setRootDomain` (only when multi-tenant); tenant lookup, the
    login project and the master-cache skip by `getTenantSubdomain`.
  - SSR: `createSSRHandler({ rootDomain })`; dms-server passes `DMS_ROOT_DOMAIN || VITE_DMS_ROOT_DOMAIN`;
    dms-template `App.jsx` passes `VITE_DMS_ROOT_DOMAIN`.
  - `getBaseHost` (`sub://`, retired redirects): the tenant's host under a root domain.
  - Admin / auth: the inline parsers in `editSite` (+ its base-URL link column), `patternList`, the
    pattern settings editor and `authSignup` now call `newPatternSubdomain` / `hostTenant` (legacy result
    unchanged); the Tenants sidenav entries (admin ×2, auth) and `TenantsPage` gate on `tenantSubdomain`.
    On the hub a tenant's new patterns are no longer stamped with the tenant label, and the subdomain
    field is shown again.
- [x] **4. Server mirror:** `dms-server/src/utils/subdomain.js` returns the pattern subdomain when
  `DMS_MULTI_TENANT=1` and `DMS_ROOT_DOMAIN` is set; checked with a `node -e` script (legacy hosts, Origin,
  rooted hosts, multi-tenant off). Env documented (`documentation/dms-server-env.md`, `.env.example`).
- [x] **Fix, Tenants tab (2026-11-10):** a tenant added on the Tenants tab showed as a blank row to the
  user who added it until a reload (repro on the rig: blank for 15 s). `addTenant` appended a bare
  `{ref, id}`; the page keeps its own edited copy of the list and the row was written straight to the
  server, so the stub never resolved. It now carries `name`/`subdomain`/`app` with the ref
  (`tenantList.jsx`); the saved site row still holds `{id, ref}` only (no `_dirty`). Re-run: shows at once.
  Rig left with two test tenants (`acmesync`, `acmesynctwo`).
- [x] **5. Hub data, on the rig (2026-11-10):** `deploy/tenant_hub_unrewrite.mjs` (new; dry run by default,
  one transaction, report keeps each row's data before/after). Reads the copy's `--apply` report for each
  pattern's original subdomain: `mny`/`tny` → the original `''`/null; **a root alias (`www`) → `''`**, not
  `www`: a *primary* mount on `www` never matches a root host (`patternMounts.js` `mountsForSubdomain`), so
  restoring it would hide `tsmo2`, `npmrds_sub`, `Freight Atlas (v2)` on `tny.<root>`; `locations` entries on
  the tenant → `''`. Rig `hub_work`: mny 7 / 81 rows, tny 19 / 41 (the copy's counts exactly), nothing left
  over; re-run changes 0. Report `scratchpad/tenant-hub/report-unrewrite-apply.json`. **Mount check**
  (`mountsForSubdomain` over each tenant's linked patterns): the tenant root's mounts before (rewrite +
  label reading) and after (reversed + rooted reading) are identical (mny 13, tny 17); after, 66 nested mny
  hosts and 7 tny ones each serve their pattern plus the `*` ones. **Live hub: done 2026-11-12** (owner, with
  the code, databases backed up): mny 6 / 80 (the datasets test pattern had been removed since the rig
  copy); tny's counts weren't recorded (a dry run now should change 0).
  - Still to do on the script: default the copy script's `rootSubdomainRewrite` off for future copies.
- [ ] **6. Infrastructure — code done 2026-11-12 (template master, uncommitted), issuing on mercury is the owner's:**
  - **DNS: nothing to do.** The `*.availabs.com` A record answers any depth: `albany.mny.availabs.com`,
    `x.tny.availabs.com` resolve to mercury, nginx's `*.availabs.com` server name already sends them to the
    hub, and over https (certificate not checked) `albany.mny.availabs.com` answers 200. Only the certificate
    is missing (it has `availabs.com`, `*.availabs.com`).
  - `deploy/sites_https.mjs`: an own server may add `*.<label>.<domain>` hosts; they go on its certificate
    (`dms-server-hub`). nginx serves the names the certificate covers over https and the rest plain, so
    adding a wildcard never takes https off `availabs.com` while the reissue is pending. Checked: with the old
    targets the generated nginx file is byte-identical; with the new ones only the hub's two `server_name`
    lines change; simulated old certificate → the two new wildcards get a plain block, the rest unchanged.
  - `deploy/acme_namecheap_dns.mjs`: a wildcard's zone is its last two labels (it already wrote
    `_acme-challenge.mny` into availabs.com because of host order; now independent of it). Old vs new
    code: same zone and record for every current site's names.
  - `deploy/targets.json`: hub hosts += `*.mny.availabs.com`, `*.tny.availabs.com`; env +=
    `VITE_DMS_ROOT_DOMAIN`. A new tenant needs its `*.<tenant>.availabs.com` host and a reissue.
  - **On mercury (owner):** `git pull`; `node deploy/sites_https.mjs` (dry run: only the hub certificate
    changes); `sudo node deploy/sites_https.mjs --staging`; then `--apply` (the timer would do it within a
    minute anyway once pulled); check `https://albany.mny.availabs.com/` has no certificate warning.
- [x] **Live check on the local rig (2026-11-10)**, server `DMS_ROOT_DOMAIN=localhost` (added to
  `server.env`), Vite :5562 and the owner's `.env` with `VITE_DMS_ROOT_DOMAIN=localhost`:
  - `mny.localhost` home, `/playground`; `albany.mny.localhost` (Albany County plan), `allegany.mny` `/` and
    `/2024`, `broome.mny`; `tny.localhost`, `/freightatlas`, `transit.tny`, `nevi.tny`: render.
  - `nope.mny.localhost`, `a.b.mny.localhost` → the tenant's 404; `zzz.localhost` → "Tenant not found".
  - Login on `albany.mny.localhost/auth/login` posts `project: "mny"`.
  - Root `/list` shows Tenants; `mny.localhost/list` doesn't.
  - `albany.mny/cenrep` sends an anonymous user to login (as on the live hub's `mny`, noted before).
  - Not checked live yet: `sub://` links (no page found with one; `getBaseHost` is unit-level only),
    per-subdomain server grants on a nested host, SSR (the `:5563` image predates the branch).
  - **Fix found:** a tenant created from the Tenants tab or tenant signup stamped its auth/admin and
    template patterns with the tenant label; with a root domain they'd be unreachable. Now `*` for
    auth/admin and no subdomain (root) for template patterns when a root domain is set
    (`tenantList.jsx`, `authSignup.jsx`); legacy unchanged. Not yet exercised live.
  - **Rig, not Phase A:** two causes of ~30 s page loads. (1) Right after a container start, lookups
    of the production DAMA hosts (`mercury`, `neptune`, read-only) failed with `EAI_AGAIN` and hung; the
    container now pins both in `/etc/hosts` (`--add-host`, see below). (2) **Auth layer, intermittent:**
    3,127 snapshot reloads in one browser run (`owners.js` `appSnapshot` fresh, from `canRead` →
    `authorize`'s retry-on-miss, `routes/auth/index.js:107`): every read whose subject misses reloads
    the whole app snapshot, so a list of unmirrored sources (`readableSources`) can reload it hundreds
    of times and saturate the database (187% CPU; every request queued). Not reproduced on demand
    afterwards. Task: [auth-snapshot-reload-on-miss.md](./auth-snapshot-reload-on-miss.md) (the hub's tenants
    have no pgEnv mirror rows, so every external read misses).
  - Rig server now runs as:
    `docker run -d --name dms-hub-local-server --network dms-hub-local -p 127.0.0.1:5560:5555
    --add-host mercury.availabs.org:169.226.252.84 --add-host neptune.availabs.org:169.226.134.164
    --user $(id -u):$(id -g) --env-file $S/server.env -w $SRV -v $R:/repo:ro -v $S/configs:$SRV/src/db/configs:ro
    -v $S/server-var:$SRV/var -v $S/server-logs:$SRV/logs node:24-trixie-slim node --max-http-header-size=1048576 src/index.js`

### Phase B progress (2026-11-11, branch `tenant-domains`, uncommitted)

- [x] **Resolver (B2):** `utils/hostResolver.js` — `setDomainAliases(tenants)` (verified aliases only;
  a domain two tenants claim goes to the first), `primaryDomainOf`, `isAliasCandidate`,
  `resolveHost(host, root, aliases)` (alias step after the root-domain step; longest alias wins;
  returns `alias`), `normalizeAliasDomain` / `aliasDomainProblem`. Tests: `hostResolver.test.js` 13.
- [x] **Primary redirect, client fallback (B7):** `utils/primaryDomain.js` (`resolvePrimaryRedirect`,
  `applyPrimaryDomainRedirect`); tests `primaryDomain.test.js` 4.
- [x] **dmsSiteFactory:** registers the aliases from the root site's tenant rows before reading the
  host; an alias candidate that matches no verified alias → "Domain … is not set up on this hub";
  applies the primary redirect before building tenant routes; on an alias host the login project is
  the tenant's app (`aliasProject` state in `DmsSite`; `PROJECT_NAME` passed to `pattern2routes`)
  and the master-app cache is skipped.
- [x] **Formats:** tenant format gets `aliases` (json) and `primary` (text); site `permissionDomain`
  gets `manage-domains` (no fields). Not yet registered on the rig (`register-formats.js`).
- [x] **Server (B4, B6, B7):**
  - `utils/subdomain.js`: alias map (`setDomainAliasMap`), `primaryDomainOf`, `rootDomain()`;
    `getSubdomain` reads the pattern subdomain on an alias origin.
  - `routes/domains/store.js`: the hub site's linked tenant rows (cached 30 s, reloaded every 30 s,
    pushes the map to `subdomain.js`); `writeTenant` goes through the Falcor controller
    (`setDataById`: change_log + broadcast).
  - `routes/domains/verify.js`: token = HMAC(`DMS_DOMAIN_TOKEN_SECRET` || `JWT_SECRET`, hub app +
    tenant row id) — nothing stored; checks TXT `_dms-verify.<d>`, A `<d>`, A probe
    `dms-wildcard-check.<d>` against `DMS_DOMAIN_TARGET_IPS` (else the root domain's A records);
    `DMS_DOMAIN_DNS_SERVERS` for a test resolver. Verified once TXT + A pass, and stays verified.
  - `routes/domains/index.js`: `GET /domains/:tenant`, `POST …/add|remove|primary|check`; hub
    `manage-tenants` or the tenant's `manage-domains`; another tenant's domain → 409 "in use on this
    hub"; writes serialized per tenant; hourly sweep re-checks pending aliases, drops them after 7 days.
  - `utils/primaryRedirect.js` (mirror of the client's) mounted first in `index.js`: 301 for GET/HEAD
    asking for HTML only.
  - `sites/index.js` `aliasOf`: a verified alias host is served by the site serving the root domain.
  - Test: `tests/test-tenant-domains.js` (no DB, fake DNS) 11/11; `npm run test:tenant-domains`.
- [x] **UI:** `components/domainsCard.jsx` (+ `.theme.js`, registered as `admin.domainsCard`): default
  domain row, alias rows (DNS pill, primary tag, make primary, remove), records panel while unverified
  or failing (TXT `_dms-verify`, A `@`, CNAME `*` → default domain), check now, add field; all calls
  to `/domains/:tenant`. Pages: `pages/tenantOverview.jsx` (`/list/tenants/:tenantId`, root,
  manage-tenants; header + domains card) and `pages/siteDomains.jsx` (`/list/domains`, tenant host,
  manage-domains; header + stats + card). Sidenav "Domains" (admin and auth menus) on a tenant host
  with a root domain. Tenant names on Tenants link to the overview. `MANAGE_DOMAINS` in
  `utils/adminPermissions.js`. Not ported yet from the overview mockup: name editing, the
  pattern-subdomains card, the danger zone; the tenants table's `domains` column.
- [x] **Fix, pre-existing (found here):** `dms-manager/wrapper.jsx` memoized the page on `[data, item]`,
  so a user who arrived after the route's data never reached it: on a tenant host (routes built once)
  every admin page kept the localStorage seed user (`groups: ['public']`) for good — no Domains entry,
  no Sites for an admin. Now `[data, item, user]`. Root hosts hid it by rebuilding routes after login.
- [x] **Rig live check (2026-11-11):**
  - Test DNS server: `scratchpad/tenant-hub/dns/dns.mjs` in container `dms-hub-local-dns` (network
    `dms-hub-local`, `172.18.0.4:5353`, answers from `dns/records.json`). `server.env` +=
    `DMS_DOMAIN_DNS_SERVERS=172.18.0.4:5353`, `DMS_DOMAIN_TARGET_IPS=127.0.0.1`. Vite :5562 config
    (`vite.hub.config.mjs`) now `allowedHosts: true`, bound to 127.0.0.1; browser maps `*.test` with
    `--host-resolver-rules`. Scripts: `dns/api.sh`, `phaseb.mjs`, `probe2.mjs`, `probe3.mjs`.
  - Rig data/users added for the check: user `mny-domains@local.test` (password as the other rig users)
    in new group `mny Domain Admins` (project mny); mny's site row (566430) got
    `authPermissions = {"*": {groups: {"mny Domain Admins": ["manage-domains"]}}}` (it had none — this
    also changes what other users see on mny's admin; revert by removing the key). Tenant row 2903392
    now carries aliases `devmny.test` (verified, primary) and `mitigateny.test` (pending).
  - API: add → pending with the problem text and the records; another tenant adding it → 409 "in use
    on this hub"; invalid / www / under-root / duplicate → 400; primary before verified → 400; TXT
    right + A elsewhere → pending "points at 192.0.2.9, not the hub"; all records → verified; primary
    set; change_log rows written. hub-member → 403; `mny-domains` → 200 on mny, 403 on tny; add +
    remove as tenant admin.
  - Server redirect (Host headers, Accept html): `mny.localhost` → 301 `devmny.test`;
    `albany.mny.localhost/plan?x=1` → `albany.devmny.test/plan?x=1`; `/list/domains` on the default
    domain, `devmny.test`, `tny`, root, and API calls not redirected.
  - Browser: `mny.localhost` → `devmny.test` (client fallback), mny home renders there;
    `albany.mny.localhost` → `albany.devmny.test`; `mny.localhost/list` stays; `nope.test` → "Domain
    "nope.test" is not set up on this hub". Login on `devmny.test` posts `project: "mny"`.
    `/list/domains` renders for `mny-domains` (after the wrapper fix).
  - **Slow pages on the rig** (17–45 s) are the snapshot flood
    ([auth-snapshot-reload-on-miss.md](./auth-snapshot-reload-on-miss.md)): Postgres at 100% on the
    snapshot query during every mny/tny load. It now reproduces on every cold load.
- [x] **Root tenant overview checked in the browser (staff):** `localhost:5562/list/tenants/2903392`
  shows MitigateNY, primary devmny.test, the three domain rows and the pending alias's records; the
  tenant side `devmny.test:5562/list/domains` (as `mny-domains`) the same card with the Domains
  sidenav entry. Fixes found on the way: the overview read `useParams()` (empty inside DMS routes: the
  manager matches its own paths) → the `params` prop; the records grid used `t-meta*`, which
  uppercases, and the TXT token is case-sensitive → mono, unchanged case. Screenshots
  `scratchpad/tenant-hub/shots/phaseb-tenant-overview.png`, `phaseb-tenant-domains.png`.
  Add / remove / make primary / check now were exercised through the API, not by clicking.
- [x] Docs: `dms-server-env.md` + `.env.example` rows for `DMS_DOMAIN_TOKEN_SECRET`,
  `DMS_DOMAIN_TARGET_IPS`, `DMS_DOMAIN_DNS_SERVERS`.
- **Rig rebuilt 2026-11-11** from the 2026-11-11 garage backups (copy script `--no-root-subdomain-rewrite`, so
  no un-rewrite step; template `hub_copied_1111`), plus the pgEnv mirror (hub runbook step 6c). The Phase B rig
  data above is GONE: mny's aliases, the `mny-domains@local.test` user, the `mny Domain Admins` group and the
  site-row grant. Re-create them before the next Phase B browser check. Tenant row ids changed.
- [x] **Rig data re-created and checked again (2026-11-11, after the rebuild):**
  - `hub_auth_work`: users `hub-staff@local.test` (`AVAIL`), `hub-member@local.test` (`mny Public`,
    `tny Public`), `mny-domains@local.test` (new group `mny Domain Admins`, project mny), password `hubtest123`.
    mny's site row 566430 now HAS grants from the backup; `"mny Domain Admins": ["manage-domains"]` was added
    to its `groups` (remove that key to revert). mny's tenant row is now 2968313 (tny 2968314); the
    `/domains/:tenant` API takes the SUBDOMAIN (`mny`), not the row id. New token
    `0211f8517530727b3d3bdf6ccba43d4c` in `dns/records.json`. Aliases: `devmny.test` verified + primary,
    `mitigateny.test` pending.
  - Browser (anonymous): `mny.localhost` → `devmny.test`, `albany.mny.localhost` → `albany.devmny.test`,
    `www.mny.localhost` → `devmny.test`, `nope.test` and `mitigateny.test` (pending) → "not set up on this
    hub", `tny.localhost` unchanged. Pages settle in ~6 s (17–45 s before the snapshot fix).
  - **Card click-test** (`scratchpad/tenant-hub/phaseb-click.mjs staff|tenant`): as staff on
    `/list/tenants/2968313` and as `mny-domains` on `devmny.test/list/domains`, by clicking: add alias →
    pending with records + problem → DNS records set → check now → verified → make primary → remove (confirm
    names the fallback primary) → make primary on devmny.test. Every POST 200; final state as before.
    Screenshot `shots/phaseb-click-staff.png`.
  - **`www.devmny.test`** served the mny home and stayed on `www`; fixed the same day, below.
- [x] **`www.` redirect (2026-11-11):** `resolvePrimaryRedirect` (server `utils/primaryRedirect.js` and its
  client mirror `utils/primaryDomain.js`) now compares the request host with the canonical one,
  `<pattern sub>.<primary || the alias asked on || <tenant>.<root>>`, instead of `alias === primary`, so a
  `www.` host goes to the same host without it: `www.devmny.org` → the primary, `www.<alias>` → `<alias>`
  with no primary, `www.tny.<root>` → `tny.<root>`. The admin exemption now applies only when the move would
  leave the default domain (`www.tny.<root>/list` → `tny.<root>/list`; `www.mny.<root>/list` with a primary
  stays). The root's own `www` is still nginx's. Tests: vitest `primaryDomain.test.js` + `hostResolver.test.js`
  18/18, `test:tenant-domains` 11/11. Rig: `www.devmny.test/plan?x=1` → 301 `devmny.test:5562/plan?x=1`,
  `www.tny.localhost/npmrds` → 301 `tny.localhost:5562/npmrds`; browser `www.devmny.test` → `devmny.test`.
  Then `www.<pattern sub>.<domain>` too: `resolveHost` (client `hostResolver.js` `patternSub`, server
  `subdomain.js`, hand mirror) drops a leading `www` label from the pattern subdomain (`www.albany` →
  `albany`; only a whole label: `wwwx` untouched), so the redirect sends it on. Before, `www.albany.devmny.test`
  served the tenant's home. Tests: vitest `src/utils` 55/55, `src/render` 5/5; `test:tenant-domains` 11/11.
  Rig: `www.albany.devmny.test/plan` → 301 `albany.devmny.test:5562/plan`; `www.albany.mny.localhost` →
  `albany.devmny.test`; browser lands on the Albany plan page. Over HTTPS this needs a certificate that
  covers `www.<sub>.<domain>` (a `*.<domain>` wildcard does not), so the redirect only helps plain HTTP or
  a tenant with a broader certificate.
- [x] **Host parsing centralised on the client (2026-11-11).** The legacy single-label reading (2 labels on
  *.localhost, 3 elsewhere, none on a bare IPv4 host) now has ONE client copy, `utils/hostResolver.js`
  `legacySplit` → `{ label, base }` (+ `legacyFirstLabel`, `legacyBaseHost`), next to `resolveHost`. Moved
  onto it: the router's `getSubdomain` (`render/spa/utils/index.js`, its development reading as
  `anyHostTwoLabels`), `subdomainPath.js` `getBaseHost`, editSite's Base URL column (now `getBaseHost`), and
  TransportNY's `LogoNav` current subdomain (`resolveHost` → pattern subdomain, else `legacyFirstLabel`). The
  server keeps its hand mirror (`utils/subdomain.js`, cross-referenced). Proof of no change: a temporary vitest
  kept the old copies verbatim and compared them with the new code over 30 hosts × {no root, root + aliases,
  root localhost} × {development, not}: identical (a forced rule change made it fail, so it bites). Two
  deliberate differences: (1) a bare IPv4 host's base is the host itself (getBaseHost stripped an octet,
  editSite did with a port; both made broken addresses, and every copy's comment meant "an IP has no
  subdomain"); (2) LogoNav on a tenant-hub host reads the pattern subdomain (`tny.<root>` → '', was `tny`);
  outside the hub it only ever compares with configured site subdomains, where old and new agree. Tests:
  vitest `src/utils` + `src/render` + `retiredSubdomain` 75/75 (new `legacyBaseHost` / `legacySplit` cases);
  the full client suite's 16 failures are the same 16 on the committed code (unrelated: themes, auth
  vocabulary, sync). Rig: tny `/freightatlas` titled Freight Atlas; `devmny.test/list` Sites table Base URLs
  `allegany.devmny.test:5562/2024`, …
  - Mirror rows with the parentage fix (dms `8e764fd1`): mny and tny, 15,284 / 15,284 views and 14,013 /
    14,013 sources resolve to their own row. `authorize` read of hazmit_dama view 13633 (source 12891, not
    public) for anonymous and a `mny Public` member: deny; with the pre-fix `owners.js`: ALLOW for both.
- [x] **Mockups synced (2026-11-11)** (`src/themes/tessera/design_system_v6/pages/`):
  `admin-tenant-overview.html` and `admin-site-domains.html`: records grid as built (mono, case kept,
  `minmax(0,1fr)`), the check's problem line (amber), "removed after 7 days" note, the default domain's "the admin
  at /list stays here"; overview: identity, pattern-subdomains and danger zone marked NOT BUILT, danger zone
  reworded to DELETE (backup first, subdomain freed). `admin-tenants.html`: Remove → Delete dialog as built
  (plan list, typed confirm, Delete disabled until it matches), note under the table. Checked rendered
  (`scratchpad/tenant-hub/shots/mock-*.png`).
- [x] **SSR route cache vs domain changes (2026-11-11).** The production SSR handler (`render/ssr2/handler.jsx`)
  cached each host's routes until a restart (its `invalidateRoutes` had no caller), so on the live hub an alias
  host first hit before verification kept "not set up", and a removed alias kept serving. Now
  `routes/domains/store.js` `onChange(fn)` fires when the host → tenant mapping changes (tenant subdomains,
  verified aliases, primaries; signature compared on every refresh: at once after a `/domains` write in the
  same process, else within the 30 s reload), `mountSSR` returns `{ invalidateRoutes }` (a no-op in dev, where
  every request builds a fresh handler), and `index.js` connects the two. The handler bumps a generation so a
  build started before an invalidation is not stored. Checked on the rig: a production-mode harness
  (`scratchpad/tenant-hub/ssrharness.mjs`, the same wiring as index.js, the SSR bundle built into
  `ssrbuild/`): `ssrcheck.test` cached "not set up" (9 ms repeats) → verified → next request after the notice
  renders MitigateNY, `albany.ssrcheck.test` the Albany plan → removed → notice at +18 s → "not set up" again.
  Other admin changes (a pattern added, a theme edited) still wait for a restart, as before.
- [x] **Formats registered on the rig (2026-11-11):** `register-formats.js --db hub-local-dms --app hub|mny|tny
  --extra src/patterns/{qa,mapeditor,chat}/*.format.js --apply`: 23 rows each (including `admin+tenant` with
  `aliases` / `primary`, `admin+site` with `manage-domains`); a second run: 23 current, 0 to write. First the
  emitter had to be fixed: `emit-formats.mjs`'s stub exported a fixed name list, and `admin.format.js` has
  imported `TenantList` since the Tenants tab (`afdb01a6`), so the emitter failed for every site (also the
  `declarations.test.js` "emitter prints the same rows" failure). The stub now exports the names each
  importer asks for (read from its import statement). After registering: `/domains` permissions unchanged
  (mny-domains 200 mny / 403 tny, member 403, staff 200), 10 pages load, both card click-throughs pass. NOT
  registered on the live hub or any production site: that is the per-site registration step in Alex's
  [format-declarations-server-side.md](./format-declarations-server-side.md) (not this task's); tell Alex
  about the emitter fix, since `emit-formats.mjs` is that task's script.
- [ ] Not built yet: a verified alias whose DNS later
  moves away stays verified (only shown).

## Testing checklist

- [ ] Resolver unit tests: every legacy host form returns today's values with no root domain
- [ ] Single-tenant sites unchanged (devtny, a MitigateNY build, a `*.localhost` dev site)
- [ ] `mny.<root>` home renders with patterns back on `''` (after the data step)
- [ ] `<sub>.mny.<root>` serves that pattern; `sub://` links stay under `mny.<root>`
- [ ] Unknown `<x>.mny.<root>` → the tenant's 404, not another tenant; `a.b.c.<root>` → not found
- [ ] Login on `<sub>.mny.<root>` uses project `mny`
- [ ] Server grants: a per-subdomain grant on a nested host applies, and only there
- [ ] SSR resolves the same tenant and pattern subdomain as the client for every host form
- [ ] DNS hook: plan for every existing site unchanged (checked locally 2026-11-12); `*.mny.availabs.com` issues (staging first)
- [ ] Phase B: tenant reachable at its external domain; `<sub>.<external>` serves that pattern
