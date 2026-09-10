# SSR: resolve the correct tenant per request, not the master app

## Status: IMPLEMENTED 2026-08-27 (all 4 file changes from "Proposed Changes" below landed as specified). Both the client build and the dedicated SSR build (`npm run build:ssr`) compile cleanly. **Live verification against a real multi-tenant deployment is still outstanding** — see "Testing Checklist"; this requires infra access (a running SSR container, a real or seeded tenant subdomain) not available in this session.

## Objective

Fix SSR (`render/ssr2/`) so a request to a tenant subdomain (multi-tenant
mode, `VITE_DMS_MULTI_TENANT=1`) renders **that tenant's** site — data and
routes — instead of always rendering the master app's site. Today it
renders the master app's content/routes regardless of which host the
request came in on, which for a tenant subdomain has no matching route and
concretely renders `<div id="root"><div>404 - Not Found</div></div>` as the
server-rendered HTML, self-correcting only after client-side hydration
re-resolves the tenant correctly.

## Evidence — confirmed live in production, 2026-08-27

Deployed on `PROD_DOMAIN` (`setup/tasks/current/enable-ssr-mode.md` tracks
that infra rollout — this task is the follow-up fix it flagged and left
open). Two requests through real nginx/TLS, same server, same deploy:

- `https://PROD_DOMAIN/` → 200, real SSR HTML, `__dmsSSRData.defaultData[0].app === "tessera-test"` (master — correct, this *is* the master domain).
- `https://test_tessera_subdomain.PROD_DOMAIN/` (a real configured tenant — `app: "test_tessera_subdomain"` per its own tenant record inside the master's site data) → 200, but **byte-identical** to the master response: same `app: "tessera-test"` in `__dmsSSRData`, and the rendered body is literally `<div id="root"><div>404 - Not Found</div>...` because the master app's routes/patterns have nothing matching the tenant's own base path.

This is not hypothetical — it's the exact symptom a real visitor to any
`*.PROD_DOMAIN` tenant subdomain would see on first load today.

## Current State — root cause, traced to two specific gaps

**The good news: the client-side fix for the identical problem already
exists and is proven working.** `dmsSiteFactory()`
(`packages/dms/src/render/spa/dmsSiteFactory.jsx`, the shared async
function — not the `DmsSite` React component in the same file) already
contains full subdomain → tenant resolution logic, added for a different
but structurally identical bug fixed in
[`sync-bring-up-to-date.md`](../completed/sync-bring-up-to-date.md) Phase 2
(client-side sync used to initialize against the master app on a tenant
subdomain; fixed there, live-verified against a real tenant subdomain).
Relevant logic, `dmsSiteFactory.jsx:199-290`:

1. Always fetches the **master** site first (`data`, includes `data[0].tenants`).
2. `if (!isMultiTenant)` → return master routes. **(line 227)**
3. `getSubdomain(host)` (`render/spa/utils/index.js:14-32` — strips port, requires ≥3 dot-separated parts for a real domain, rejects an all-numeric last label so raw IPs don't misparse) — if no subdomain, return master routes (platform-admin / root-domain case). **(line 234-241)**
4. Look up `data[0].tenants.find(t => t.subdomain === subdomain)`. If no match, return a "Tenant not found" routes array. **(line 245-259)**
5. If matched: clone `dmsConfig`, swap `app`/`format.app`/`registerFormats[].app`/`attributes[].format` to `tenantApp`, **re-fetch** that tenant's own site data (`tenantData`), and return `pattern2routes(tenantData, {...config, dmsConfig: tenantDmsConfig})`. **(line 261-289)**

**SSR (`render/ssr2/handler.jsx`) calls this exact function for its routes**
(`createSSRHandler`'s `buildRoutes()`, line 85: `await dmsSiteFactory({dmsConfig, falcor, API_HOST: apiHost, DAMA_HOST: apiHost, themes, pgEnvs, host, adminPath})`)
— `host` is even already threaded through, and `buildRoutes` is already
keyed/cached per-host (`routeCache.set(host, entry)`, line 111) as if this
were expected to vary by tenant. **But it never passes `isMultiTenant`.**
Since `dmsSiteFactory`'s destructure (`dmsSiteFactory.jsx:208`) treats a
missing `isMultiTenant` as falsy, **every SSR request takes the
`if (!isMultiTenant)` fast path (step 2 above) unconditionally** — the
entire tenant-resolution branch that already works client-side is dead code
here. That's gap #1.

**Gap #2, independent of gap #1:** even with `isMultiTenant` wired through,
`dmsSiteFactory()`'s return value is just the routes array (plus the
optional `onResolvedSyncApp` callback added for the sync fix, which reports
only the resolved app *string*, not the data). `handler.jsx`'s `buildRoutes()`
computes the `siteData` it embeds as `window.__dmsSSRData` **separately and
earlier** (`handler.jsx:65-83`), via its own standalone
`dmsDataLoader(falcor, dmsConfigUpdated, '/')` call built from the **fixed**
`siteConfig.app`/`siteConfig.type` (themselves fixed at server startup from
`DMS_APP`/`VITE_DMS_APP` env vars — see below). This is always the master
site's data, full stop, regardless of `isMultiTenant`/`host`/gap #1's fix.
`__dmsSSRData` becomes the client's `defaultData` prop
(`src/entry-ssr.jsx` → `App({defaultData, hydrationData})` →
`<DmsSite defaultData={defaultData} ...>`), which seeds the client's
*initial* route/state before its own `dmsSiteFactory()` call resolves the
real tenant async — so even a routes-only fix (gap #1) would still ship the
wrong `defaultData` to the client, just changing what the mismatch looks
like rather than fixing it.

**Where the fixed `siteConfig.app` originates:**
`packages/dms-server/src/index.js:313-324`, the `mountSSR()` call:
```js
await mountSSR(app, {
  root: ...,
  serverEntry: '/src/entry-ssr.jsx',
  clientDir: ...,
  handlerConfig: {
    apiHost: `http://localhost:${PORT}`,
    siteConfig: {
      app: process.env.DMS_APP || process.env.VITE_DMS_APP,
      type: process.env.DMS_TYPE || process.env.VITE_DMS_TYPE,
      baseUrl: ...,
      authPath: ...,
    },
    // pgEnvs, etc. below
  },
});
```
This `handlerConfig` is a **one-time, server-startup** object — there's no
`isMultiTenant` field here at all today, and nothing here is (or should be)
re-evaluated per-request; the per-request part has to happen inside
`createSSRHandler`'s `render(request)`/`buildRoutes(host)`, which already
correctly re-derives `host` per request (`handler.jsx:122-123`) — only
`isMultiTenant` and the tenant-aware `siteData` are missing from that
per-request path.

## Proposed Changes

### 1. Thread `isMultiTenant` from env into `mountSSR()`'s config

**File:** `packages/dms-server/src/index.js`, inside the existing
`handlerConfig` object (~line 317-324). Add, following the exact
`DMS_X || VITE_DMS_X` precedence convention already used for every other
field here:
```js
isMultiTenant: (process.env.DMS_MULTI_TENANT || process.env.VITE_DMS_MULTI_TENANT) === '1',
```
This project already has `VITE_DMS_MULTI_TENANT=1` in `dms-template/.env`
(confirmed) — `process.env.VITE_DMS_MULTI_TENANT` is a plain env var read
in a Node/CJS process here (dms-server is not Vite-built), so this works
exactly like the existing `DMS_APP`/`VITE_DMS_APP` fallback already does
one field up. No `.env` changes needed.

### 2. Accept and use `isMultiTenant` in `createSSRHandler`

**File:** `packages/dms/src/render/ssr2/handler.jsx`.

- Destructure: `createSSRHandler({ adminConfigFn, themes, apiHost, siteConfig, pgEnvs = [], isMultiTenant = false })`.
- Pass it into the existing `dmsSiteFactory({...})` call inside `buildRoutes(host)` (currently missing).

This alone (gap #1) makes SSR's **routes** tenant-aware, reusing
`dmsSiteFactory`'s already-proven resolution logic verbatim — no new
subdomain-matching code to write or test from scratch.

### 3. Add an `onResolvedSiteData` callback to `dmsSiteFactory`, mirroring `onResolvedSyncApp`

**File:** `packages/dms/src/render/spa/dmsSiteFactory.jsx`.

Same pattern as the sync fix (`onResolvedSyncApp`, added in
`sync-bring-up-to-date.md` Phase 2, chosen specifically to avoid a breaking
change to `dmsSiteFactory`'s public return contract — it's a documented
export other code calls directly). Add a second, independent optional
callback param, invoked alongside every existing `onResolvedSyncApp?.(...)`
call site with the `{app, type, data}` that was *actually used* to build
the returned routes:

- Line ~228 (non-multi-tenant): `onResolvedSiteData?.(dmsConfig.app, siteType, data)`
- Line ~239 (no subdomain / platform admin): `onResolvedSiteData?.(dmsConfig.app, siteType, data)`
- Line ~250 (no tenant match): `onResolvedSiteData?.(null, null, null)` — mirrors the existing `onResolvedSyncApp?.(null)` right above it. (Minor design call for whoever implements: `null` is arguably more honest than falling back to master data here, since the routes for this case are already a synthesized "Tenant not found" page, not the master's real routes — but returning the master `data` instead is also defensible as a harmless no-op. Either is fine; pick one and note why.)
- Line ~288 (tenant matched): `onResolvedSiteData?.(tenantApp, siteType, tenantData)`

### 4. Use the callback in `handler.jsx`, delete the redundant standalone fetch

**File:** `packages/dms/src/render/ssr2/handler.jsx`, inside `buildRoutes(host)`.

Currently (lines 65-94): builds `dmsConfig`, does its **own** `dmsConfigUpdated`/`updateRegisteredFormats`/`updateAttributes`/`dmsDataLoader` fetch to get `siteData` (lines 76-82), *then* separately calls `dmsSiteFactory({dmsConfig, ...})` for `routes` (lines 85-94). That standalone fetch is now redundant: `dmsSiteFactory` already does the equivalent "always fetch the master site first" step internally (`dmsSiteFactory.jsx:210-218`) as part of building `routes` — with the callback from #3, `handler.jsx` gets the correctly-resolved data for free from the same call, no second network round-trip.

Proposed shape:
```js
let resolvedSiteData = null;
const routes = await dmsSiteFactory({
  dmsConfig, falcor, API_HOST: apiHost, DAMA_HOST: apiHost,
  themes, pgEnvs, host, adminPath: siteConfig.baseUrl || '/list',
  isMultiTenant,
  onResolvedSiteData: (app, type, data) => { resolvedSiteData = data; },
});
// ... routes.push(404 catch-all) as before ...
return { routes, siteData: resolvedSiteData };
```
Delete the now-unused `dmsConfigUpdated`/`siteType`/`siteInstance`/
`updateRegisteredFormats`/`updateAttributes`/`dmsDataLoader` block (lines
76-82) — this is a net simplification, not just a patch, since it removes
a duplicate fetch path that only existed because SSR couldn't previously
get the resolved data any other way.

`ensureRoutes()`/`routeCache` (lines 105-114) need no structural change —
they already cache `{routes, handler, siteData}` per `host`; `siteData`
just becomes correctly tenant-scoped instead of always-master once the
above lands.

### 5. `entry-ssr.jsx` — no change needed

`src/entry-ssr.jsx`'s `createHandler(config)` already does
`createSSRHandler({ adminConfigFn, themes, ...config })` — `isMultiTenant`
flows through the existing `...config` spread automatically once
`dms-server/src/index.js` puts it in `handlerConfig` (change #1).

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms-server/src/index.js` | Add `isMultiTenant` to `handlerConfig` passed to `mountSSR()` (~line 317-324) |
| `packages/dms/src/render/ssr2/handler.jsx` | Accept `isMultiTenant` param; pass it into the `dmsSiteFactory()` call; add `onResolvedSiteData` callback usage; delete the now-redundant standalone master-only `siteData` fetch |
| `packages/dms/src/render/spa/dmsSiteFactory.jsx` | Add optional `onResolvedSiteData(app, type, data)` callback, invoked at all 4 return points alongside the existing `onResolvedSyncApp` calls |
| `src/entry-ssr.jsx` | None — `isMultiTenant` flows through the existing `...config` spread |

No database, schema, or client-side (`DmsSite` component) changes needed —
the client-side half of this (`dmsSiteFactory`'s tenant resolution itself,
and its client-side consumer `DmsSite`) already works correctly today;
this task only wires SSR into logic that already exists and is already
proven.

## Testing Checklist

- [x] All 4 file changes implemented exactly as specified in "Proposed Changes".
- [x] `npm run build` (client) and `npm run build:ssr` (client + server bundles,
      exercises `entry-ssr.jsx` → `handler.jsx` → `dmsSiteFactory.jsx` directly)
      both compile cleanly with no new errors/warnings.
- [x] Full client test suite (`npx vitest run tests/`): 247/248 pass, same
      pre-existing unrelated `cardLayout.test.js` failure as before this change
      (confirmed via stash-and-rerun).
- [ ] Direct-to-container test (bypass nginx, mirrors how this bug was
      first confirmed): `docker exec dms-server node -e "fetch('http://localhost:5555/', {headers:{Host:'PROD_DOMAIN'}})..."` → `__dmsSSRData.defaultData[0].app === 'tessera-test'` (master, unchanged).
- [ ] Same, `Host: test_tessera_subdomain.PROD_DOMAIN` (or whatever real
      tenant subdomain exists at test time) → `__dmsSSRData.defaultData[0].app`
      now equals the **tenant's own** `app` (`test_tessera_subdomain` today),
      not `tessera-test`.
- [ ] Rendered body for the tenant request is real tenant content, not
      `<div>404 - Not Found</div>`.
- [ ] Live, through real nginx/TLS: `curl https://test_tessera_subdomain.PROD_DOMAIN/`
      (or the real production tenant domain at fix time) shows the same —
      this is the actual user-facing symptom from the 2026-08-27 confirmation
      above, so re-run that exact check.
- [ ] Platform-admin / root-domain path unaffected: `PROD_DOMAIN` still
      renders the master site correctly (no regression from adding the
      `isMultiTenant` branch).
- [ ] No-subdomain and unmatched-subdomain cases still behave sanely (fall
      through to master / "Tenant not found" respectively — same as
      client-side already does).
- [ ] Hydration: load the tenant subdomain in a real browser, confirm no
      React hydration-mismatch console error — server-rendered tenant
      routes/data should now agree with what the client's own
      `dmsSiteFactory()` call resolves independently (it already resolves
      correctly; this task's job is only to make SSR agree with it, not to
      change client behavior).
- [ ] `routeCache` (per-host caching in `ensureRoutes`) still isolates
      different tenant subdomains from each other correctly — hit two
      different tenant subdomains in sequence against the same warm server
      process, confirm each gets its own cached entry, not the other's.
- [ ] Re-run the exact evidence repro from this file's "Evidence" section
      and confirm it no longer reproduces.

## Notes for whoever picks this up

- This is a `dms` submodule (`packages/dms`, `packages/dms-server`) fix —
  correctly scoped here in `src/dms/planning/`, not the root
  `dms-template/planning/` tree (see `dms-template/CLAUDE.md`'s planning
  split).
- The companion infra task, `setup/tasks/current/enable-ssr-mode.md` (in
  the sibling `setup/` deployment-infra repo, not this submodule), tracks
  turning `DMS_SSR=1` on for real in production and is what surfaced this
  bug. That file documents the live rollout state (currently: `DMS_SSR=1`
  is live on `PROD_DOMAIN`, master domain confirmed correct, tenant
  subdomains still broken pending this task) — check it for current
  production status before testing live, and update it once this fix ships
  so its own testing checklist can be re-run there too.
- `getSubdomain()`'s `minParts` logic depends on `process.env.NODE_ENV`
  (`render/spa/utils/index.js:24`) — confirmed `NODE_ENV=production` is set
  in the SSR runtime image (`Dockerfile.ssr`), so the real-domain 3-part
  threshold applies correctly server-side; this was empirically confirmed
  working during the 2026-08-27 investigation (the tenant subdomain's
  4-label host parsed to the correct subdomain both client- and
  server-side), not just assumed.
