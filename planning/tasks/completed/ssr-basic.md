# SSR Phase 1: Basic Server-Side Rendering with Data Mode

## Objective

Add server-side rendering to DMS page views using React Router 7's stable Data Mode SSR APIs (`createStaticHandler`, `createStaticRouter`, `StaticRouterProvider`). Pages render to full HTML on the server so users see content immediately instead of waiting for JS to load + API calls to complete.

SSR is additive — the existing SPA mode is unchanged. SSR runs inside dms-server (co-located with the Falcor API), enabled via `DMS_SSR` env var.

## Scope

**In scope:**
- Platform-agnostic SSR core in `render/ssr2/` (Web Request → HTML)
- Express adapter in `render/ssr2/express/` (first platform, designed for future Bun/Deno/etc.)
- Integration into dms-server via `mountSSR()` — one function call
- Fix `getSubdomain` bug in `dmsSiteFactory.jsx` (uses `window.location.host` instead of `host` param)
- Client hydration via `DmsSite` with `defaultData` + `hydrationData` props
- Two-build system (client + server via Vite)

**Out of scope:**
- React Server Components (Phase 3, after API stabilization)
- Streaming (`renderToPipeableStream`) — Phase 2
- In-process Falcor optimization (SSR uses HTTP to localhost for now)
- Deployment infrastructure decisions

## Background

- Research document: `planning/research/ssr-rsc-react-router.md`
- Reference project: `references/vite-ssr/` — proof-of-concept with correct SSR scaffolding
- Existing incomplete SSR code: `render/ssr/` — has server-safe `getSubdomain(host)` pattern to reference
- DMS already has `dmsSiteFactory()` (async) that generates React Router routes with loaders
- Falcor works in Node.js (proven by DMS CLI)

## Architecture

```
render/ssr2/                          # Platform-agnostic SSR core
├── index.js                          # Exports: createSSRHandler
├── handler.jsx                       # Web Request → { html, status, headers, siteData }
└── express/                          # Express adapter (first platform)
    ├── index.js                      # Exports: { mountSSR, createSSRMiddleware }
    ├── middleware.js                  # Express req/res ↔ Web Request adapter
    └── setup.mjs                     # mountSSR(app, config) — dev/prod Vite setup
```

**Data flow:**
1. Request hits dms-server Express → SSR catch-all middleware (after `/graph`, before 404)
2. Middleware converts Express `req` → Web `Request`
3. `handler.render(request)`:
   - First call: `dmsSiteFactory()` builds routes via Falcor HTTP (cached after first build)
   - `createStaticHandler(routes).query(request)` runs route loaders
   - `renderToString(<StaticRouterProvider />)` produces HTML
4. Middleware injects HTML into `index.html` template, embeds `siteData` as `<script>`
5. Client: detects `window.__dmsSSRData`, uses `hydrateRoot` + `DmsSite` with `defaultData`/`hydrationData`

**dms-server integration (the developer experience):**
```javascript
// In dms-server/src/index.js — after Falcor routes, before 404:
if (process.env.DMS_SSR) {
  const { mountSSR } = await import('../../dms/src/render/ssr2/express/setup.mjs');
  await mountSSR(app, {
    root: path.resolve(__dirname, '../../../..'),
    serverEntry: '/src/entry-ssr.jsx',
    clientDir: path.resolve(__dirname, '../../../../dist/client'),
    handlerConfig: {
      apiHost: `http://localhost:${PORT}`,
      siteConfig: { app: process.env.DMS_APP, type: process.env.DMS_TYPE, ... },
    },
  });
}
```

## Implementation Steps

### Step 1: Fix `getSubdomain` + thread `host` + add `hydrationData` — DONE

**File:** `render/spa/dmsSiteFactory.jsx`

- [x] Fix `getSubdomain(host)` (lines 20-26): use `host` param instead of `window.location.host`
- [x] `pattern2routes()` (line 62): add `host` to destructured props with SSR-safe default, change line 66 to `getSubdomain(host)`
- [x] `DmsSite()`: add `host` to destructured config (line 232), default to `typeof window !== 'undefined' ? window.location.host : 'localhost'`
- [x] `DmsSite()`: add `hydrationData` to destructured config (line 218), pass to `createBrowserRouter` (line 318-324)
- [x] Pass `host` through `DmsSite`'s `pattern2routes` call (line 257) and `dmsSiteFactory` call (line 281)

### Step 2: Create `render/ssr2/handler.jsx` — DONE

**New file:** `render/ssr2/handler.jsx`

- [x] `createSSRHandler({ adminConfigFn, themes, apiHost, siteConfig, pgEnvs })` returns `{ render, invalidateRoutes }`
- [x] `render(webRequest)` — calls `dmsSiteFactory()` (cached), `createStaticHandler`, `query(request)`, `renderToString(<StaticRouterProvider />)`
- [x] Route caching: builds once on first request, `invalidateRoutes()` clears cache
- [x] Per-build Falcor instance via `falcorGraph(apiHost)` — created per route build
- [x] Returns `{ html, status, headers, siteData }` — also handles redirect responses
- [x] Redirect detection: if `handler.query()` returns a Response, extracts Location header

**New file:** `render/ssr2/index.js` — re-exports `createSSRHandler`

### Step 3: Create `render/ssr2/express/` adapter — DONE

**New file:** `render/ssr2/express/middleware.js`

- [x] `createSSRMiddleware({ getHandler, getTemplate })` → Express middleware
- [x] Converts Express `req` to Web `Request` (protocol, host, originalUrl)
- [x] Calls `handler.render(request)`, handles redirects (302)
- [x] Injects HTML into template (`<!--app-html-->`, `<!--app-head-->`)
- [x] Embeds `siteData` as `<script>window.__dmsSSRData=...</script>` (XSS-safe: escapes `<`, `>`, `&`)
- [x] Graceful fallback: on render error, serves SPA shell (no SSR content)

**New file:** `render/ssr2/express/setup.mjs`

- [x] `mountSSR(app, { root, serverEntry, clientDir, handlerConfig })`
- [x] Dev mode: Vite dev server (`middlewareMode`, `appType: 'custom'`), `vite.ssrLoadModule(serverEntry)` per request, `vite.transformIndexHtml()` for template
- [x] Prod mode: `express.static(clientDir)`, imports built server bundle once, caches template
- [x] `.mjs` extension for clean ESM import from dms-server CJS

**New file:** `render/ssr2/express/index.js` — re-exports `createSSRMiddleware` (mountSSR imported directly from setup.mjs)

### Step 4: Create site-specific SSR entry + update HTML/client — DONE

**New file:** `src/entry-ssr.jsx` (dms-site project root)

- [x] Imports `createSSRHandler`, site themes, `adminConfig`
- [x] Exports default `createHandler(config)` that wires site-specific config into handler

**Modified file:** `index.html` — **same file serves both SPA and SSR**

- [x] Add `<!--app-head-->` in `<head>` (after `<title>`)
- [x] Add `<!--app-html-->` inside `<div id="root">`
- These are HTML comments — completely invisible in SPA mode.

**Modified file:** `src/main.jsx` — **same file serves both SPA and SSR**

- [x] Detect `window.__dmsSSRData` — if present, use `hydrateRoot` with `defaultData`/`hydrationData`
- [x] If not present, existing SPA `createRoot` path runs unchanged

**Modified file:** `src/App.jsx` — **same file serves both SPA and SSR**

- [x] Accept `defaultData`, `hydrationData` props, forward to `DmsSite`
- In SPA mode these props are `undefined` — existing behavior unchanged.

### Step 5: Integrate into dms-server — DONE

**Modified file:** `packages/dms-server/src/index.js`

- [x] Restructure bottom of file: replaced `awaitReady().then(...)` with async `setupAndListen()` (line 72)
- [x] After `awaitReady()`, conditionally mount SSR: `if (process.env.DMS_SSR) { ... }` (line 76)
- [x] Dynamic import of `setup.mjs` via `await import()` for CJS→ESM interop (line 78)
- [x] Move 404 catch-all AFTER SSR mount — now at line 101
- [x] Config from env: `DMS_APP`, `DMS_TYPE`, `DMS_BASE_URL`, `DMS_AUTH_PATH`, `DMS_PG_ENVS`

### Step 6: Add build scripts — DONE

**Modified file:** `package.json`

- [x] `build:client`: `vite build --outDir dist/client`
- [x] `build:server`: `vite build --ssr src/entry-ssr.jsx --outDir dist/server`
- [x] `build:ssr`: `npm run build:client && npm run build:server`

**Modified file:** `vite.config.js`

- [x] Added `ssr.noExternal: ['@availabs/avl-falcor', 'react-router', 'lodash-es']` — these packages need to be bundled into the SSR build rather than treated as external node_modules

## Files Summary

| File | Action | What |
|------|--------|------|
| `render/spa/dmsSiteFactory.jsx` | Modify | Fix `getSubdomain`, thread `host`, add `hydrationData` |
| `render/ssr2/index.js` | Create | Export `createSSRHandler` |
| `render/ssr2/handler.jsx` | Create | Platform-agnostic SSR core |
| `render/ssr2/express/index.js` | Create | Express adapter exports |
| `render/ssr2/express/middleware.js` | Create | Express req/res ↔ Web Request |
| `render/ssr2/express/setup.mjs` | Create | `mountSSR()` — dev/prod Vite setup |
| `src/entry-ssr.jsx` | Create | Site-specific SSR entry |
| `index.html` | Modify | Add `<!--app-head-->`, `<!--app-html-->` |
| `src/main.jsx` | Modify | SSR hydration detection |
| `src/App.jsx` | Modify | Forward `defaultData`/`hydrationData` |
| `dms-server/src/index.js` | Modify | Optional SSR mount with `DMS_SSR` |
| `package.json` | Modify | Add build:client/server/ssr scripts |

## Key Technical Decisions

1. **Platform-agnostic core**: `handler.jsx` uses Web `Request` API. Express adapter in `express/` subfolder. Future Bun/Deno adapters in sibling folders.
2. **Co-located with dms-server**: SSR runs in same Express process as Falcor API. No CORS, no extra deployment.
3. **Reuse `dmsSiteFactory`**: Fix the `window` bug, then the same function works for both SPA and SSR.
4. **Route caching**: Built once on first request, `invalidateRoutes()` for admin changes.
5. **Client hydration via `DmsSite`**: Reuse existing `defaultData` prop (already supports sync route generation). Add `hydrationData` prop for `createBrowserRouter`.
6. **`DMS_SSR` opt-in**: Without the env var, dms-server is unchanged. Zero risk to existing deployments.
7. **Falcor over HTTP**: SSR Falcor calls go to `http://localhost:PORT/graph`. Same transport as SPA. In-process optimization deferred.
8. **`.mjs` for setup**: dms-server is CJS. Dynamic `import()` loads the ESM setup file. `.mjs` extension makes this explicit.

## Post-Implementation Fixes

These issues were found and fixed during integration testing after all steps were complete.

### SSR Environment Fixes

- [x] **linkedom for SSR DOM** — `handler.jsx` stubs `globalThis.window` and `globalThis.document` using linkedom (needed by Lexical's `$generateHtmlFromNodes` which requires a real DOM)
- [x] **Falcor CJS/ESM interop** — added `falcor-shim.js` alias in vite.config.js to resolve Falcor's CJS exports for SSR bundling
- [x] **`ssr.noExternal`** — `@availabs/avl-falcor` and `colorbrewer` must be bundled (not externalized) for SSR

### Lexical SSR Fixes

- [x] **IconNode `renderToStaticMarkup` crash** — `IconNode.exportDOM()` called `renderToStaticMarkup` inside React's `renderToString` (non-reentrant). Removed the nested render, `exportDOM` now just sets `data-lexical-icon` attribute
- [x] **AutocompleteNode SSR** — fixed for Node.js environment compatibility
- [x] **ButtonNode SSR** — fixed for Node.js environment compatibility
- [x] **Hydration mismatch warnings** — added `suppressHydrationWarning` to lexical View's `dangerouslySetInnerHTML` div (linkedom vs browser DOM attribute ordering/CSS formatting differences are expected)

### Component Fixes

- [x] **Virtual.jsx SSR** — fixed to render all rows during SSR (no window/viewport in SSR context)
- [x] **Non-DOM prop warnings** — destructured non-DOM props (`loading`, `singleSelectOnly`, `displayDetailedValues`, `keepMenuOpen`, `tabular`, `displayInvalidMsg`, `onSearch`) from `text.jsx` Edit and (`show`, `isLink`, `searchParams`, `hideControls`) from `TableCell.jsx` LinkComp before spreading onto native elements
- [x] **404 flash fix** — fixed DmsSite to not flash 404 during initial data load

### Build Optimization

- [x] **SSR build 8x faster** — converted `vite.config.js` to `defineConfig(({ isSsrBuild }) => ...)` function form. Skips React Compiler (babel-plugin-react-compiler) and TailwindCSS for SSR builds. 25s → 3s.
- [x] **Build progress plugin** — added `buildProgress()` plugin that logs `transforming (50)...transforming (100)...` to stderr during builds

### Production Fixes

- [x] **Per-host route caching** — replaced single global route cache with a per-host `routeCache` Map in `handler.jsx`. Different subdomains produce different route sets (via `pattern2routes` filtering). In dev mode each request creates a fresh handler; in prod mode routes are cached per-host on first request.
- [x] **`getSubdomain` localhost fix** — production mode required `> 2` dot segments to detect a subdomain (`sub.example.com` = 3 parts). `songs.localhost` only has 2 parts, so `getSubdomain` returned `false` → both the songs pattern AND the no-subdomain b3 pattern matched → two layouts rendered. Fixed by detecting `.localhost` hostnames and using the `>= 2` threshold regardless of `NODE_ENV`. Must rebuild BOTH client and server (`build:ssr`) since client also runs `getSubdomain`.

## Testing

- [x] SPA build unchanged: `vite build` succeeds (verified — all chunks build correctly)
- [x] SSR dev mode: `DMS_SSR=1 DMS_APP=avail DMS_TYPE=site npm run dev` in dms-server — view source shows HTML content
- [x] SSR hydration: page becomes interactive after JS loads, client-side nav works
- [x] SSR prod: `npm run build:ssr` then `NODE_ENV=production DMS_SSR=1` dms-server
- [x] Graceful fallback: if SSR render fails, return SPA shell (SPA template served)
- [x] Subdomain routing in production: per-host caching + localhost-aware `getSubdomain` verified working
- [ ] SPA dev unchanged: `npm run dev` works, client-side nav works
- [ ] No SSR regression: dms-server without `DMS_SSR` behaves identically
