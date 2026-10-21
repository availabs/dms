# dms-server serves each site's built files by request host

**Initiatives:** [plat_qa_automation](../../../../../planning/initiatives/plat_qa_automation.md) · **Status:** built · **Release:** commit — library `auto_deploy`, uncommitted · **Created by:** rdubowsky@albany.edu · **Edited by:** —

The library half of the first step of
[serve-sites-from-mercury.md](../../../../../planning/shared/tasks/current/serve-sites-from-mercury.md) (dms-template):
serve every site from the one dms-server container instead of Netlify. That doc holds the whole plan, the mercury
survey and the owner's decisions.

## Objective

One dms-server process serves several sites' built client files from the `<checkout>-sites` folder next to the
app checkout, picking the site from the request's `Host`. It replaces what Netlify does for a static SPA today: serve the build's files, fall back to
`index.html`, apply host redirects, add the security headers. Without that folder, nothing changes.

## Scope

**Included (first step, SSR off):**
- the host → site lookup, re-read from disk without a restart;
- the live build per site;
- static files, the `index.html` fallback, `_redirects` 3xx rules, the security headers and cache headers.

**Excluded (later, in the dms-template plan's "After" list):** per-site SSR, preview cookies, old-chunk fallback
across builds, the test-address exception in `getSubdomain()`.

## Current State

- `dms-server/src/index.js` serves no client files unless `DMS_SSR` is set. Then `mountSSR()` serves one
  `dist/client` for one `DMS_APP`/`DMS_TYPE`, read once at startup (`index.js:357-380`).
- A middleware at `index.js:48` sets CORS and `Cache-Control: no-store` on every response.

## Proposed Changes

**Folder layout** (written by the deploy tool; the server only reads it):
```
<checkout>-sites/<site>/site.json     {"hosts": ["www.example.org", "*.example.org"], "live": "<build id>"}
<checkout>-sites/<site>/builds/<build id>/client/     index.html, assets/, public files, _redirects
```

**`src/sites/index.js` → `createSitesMiddleware({ sitesDir })`**, registered right after `compression()`, so a
site request never reaches the API routes, the CORS/no-store middleware or the JWT middleware:
- **Host lookup:**
  - Strip the port and a trailing `.localhost`, which lets a laptop open `www.example.org.localhost` with no DNS.
  - Match exact hosts first, then `*.domain` wildcards, longest first.
  - A host claimed by two sites matches neither, and is logged.
  - No match → `next()`.
- **Reloading:** the site list and each `site.json` are re-read when they change, checked at most once a
  second (directory listing plus mtimes).
- **Live build:** `builds/<live>/client`. A missing build → 503. Folder names must be plain names (no `/`, no `..`).
- **Order per request:**
  - security headers (the set `netlify.toml` sends today);
  - `_redirects` 3xx rules (full-URL host rules with `/*` splat or an exact path, plus path-only rules; the
    query string carries over; 200 rewrites are ignored, since static-first plus the fallback covers them);
  - static files. `assets/*` are immutable for a year, and everything else gets `no-cache`.
  - Then `index.html` for any other GET/HEAD, except a missing `/assets/*` → 404, so a stale chunk request gets
    a real error instead of HTML. Other methods → 405.

## Files Requiring Changes

- `packages/dms-server/src/sites/index.js` (new)
- `packages/dms-server/src/index.js`: the one registration block
- `packages/dms-server/tests/test-sites.js` (new), `package.json` scripts

## Status (2026-10-21): built, uncommitted

- [x] `packages/dms-server/src/sites/index.js`: `createSitesMiddleware`, `parseRedirects`, `normalizeHost`.
- [x] `packages/dms-server/src/index.js`: registered right after `compression()`, pointed at `<checkout>-sites`.
- **Design note (owner, 2026-10-21): no setting.** `DMS_SITES_DIR` was replaced by a fixed folder next to the checkout
  (`${repo root}-sites`, the same root the SSR mount uses, named like `deploy.sh`'s `<repo>-build`), so it works on
  every laptop with no `.env` line. It sits outside the repo so Vite's dependency scan (every `**/*.html`), its
  watcher, Tailwind and ESLint never see the built files. In the container the root is `/app`, so the mount target
  is `/app-sites`. A missing folder is silent; `.env.example` explains it.
- [x] `tests/test-sites.js`, added to `npm test` and as `npm run test:sites`; listed in `tests/CLAUDE.md`.
- **Design notes:**
  - **Redirect `!`:** forced rules run before static files. Rules without `!` run only when no file matched,
    which is Netlify's shadowing rule.
  - **Not served:** the build's `_redirects`.
  - **Not logged:** site requests are registered before the request logger, so they don't appear in its log.
  - **`X-Site-Build: <live build id>`** on every site response (added 2026-10-21). The deploy tooling checks it
    after publishing: builds of the same commits have identical files, so only the server can say which
    one answered. Covered in `tests/test-sites.js`.

## Testing Checklist

- [x] HTTP integration test (`tests/test-sites.js`), 30/30 passing (2026-10-21; the 30th: no folder → every request passes through). Two sites in a temp folder plus
  a stub API route. It covers:
  - host lookup: exact, wildcard, `.localhost`, port, conflict, no match → API;
  - files, cache headers, the fallback and the `/assets` 404;
  - redirects: host splat, exact root, query carry-over, `!` vs file shadowing;
  - security headers on site responses only;
  - live switch and rollback without a restart, a missing build, a new site appearing;
  - unreadable `site.json`, path traversal in `live` and in the URL.
- [x] Real builds (2026-10-21), using a one-shot probe instead of the owner's dev server:
  - **Setup:** devtny (`npm run deploy -- devtny --build-only`, master) and the cached mnyprod build (template
    `1fcccb4a`), symlinked into a temp sites folder and served by the middleware. Loaded in headless Chromium at
    `*.localhost` names.
  - **devtny:** `www.devtny.org` home, `/tsmo` and `npmrds.devtny.org` render. Titles and text match the live
    Netlify site (`/tsmo` and `npmrds` show sign-in to an anonymous visitor, as live does).
  - **MNY:** `hazardmitigation.ny.gov` and `albany.hazardmitigation.ny.gov` render, the county subdomain resolves
    to the Albany site, and the screenshots are fully themed.
  - **No page errors**, and no failed requests to the local server.
  - **MNY's `_redirects`:** `www.mitigateny.org/plans?x=1` → 302 `https://hazardmitigation.ny.gov/plans?x=1`,
    `albany.mitigateny.org/` → 302 `https://albany.hazardmitigation.ny.gov/`, and `/service-worker.js` serves
    the file.
  - The one broken image (the Albany seal) is broken on live too: its `src` is a Wikipedia page, not an image.
- [x] Owner's dev server, no setting (2026-10-21): with `~/code/dms-template-sites` in place, `:3001` answers
  `www.devtny.org.localhost` → TransportNY, `hazardmitigation.ny.gov.localhost` and `albany.…` → MitigateNY, plain
  `localhost` → the API status page, and a Falcor read still works.
- [x] Inside Docker via `deploy.sh` (2026-10-21, image `…-3b94ec60-dms-4beec22c`): sites served from the read-only
  `/app-sites` mount, both sites render in Chromium, and a live-build switch is picked up with no container restart.
  Details in the dms-template plan, step 2.
- [ ] The end-to-end local run "as on mercury" (dms-template plan) belongs to the next step, after the build
  script exists.
