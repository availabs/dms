# Server Rendering DMS with React Router 7

Research document covering SSR and React Server Components (RSC) for DMS page views, with a focus on React Router 7 Data Mode.

## Contents

1. [Current State of DMS Rendering](#1-current-state-of-dms-rendering)
2. [React Router 7 Modes](#2-react-router-7-modes)
3. [SSR with Data Mode (No RSC)](#3-ssr-with-data-mode-no-rsc)
4. [React Server Components](#4-react-server-components)
5. [Existing Reference: `references/vite-ssr/`](#5-existing-reference-referencesvite-ssr)
6. [DMS-Specific Challenges](#6-dms-specific-challenges)
7. [Proposed Path: SSR via Data Mode](#7-proposed-path-ssr-via-data-mode)
8. [Future: RSC for View Sections](#8-future-rsc-for-view-sections)
9. [Security](#9-security)
10. [Recommendations](#10-recommendations)

---

## 1. Current State of DMS Rendering

DMS runs as a **pure client-side SPA**:

- Vite 7 + `@vitejs/plugin-react` + React Compiler
- React 19.1, React Router 7 (library/data mode via `createBrowserRouter`)
- TailwindCSS 4
- Falcor for all data fetching (works in both browser and Node.js)
- Deployed to Netlify as static files

**Render flow today:**
1. Browser loads `index.html` (empty shell)
2. JS bundle loads, `DmsSite` component mounts
3. `DmsSite` fetches site config from API (patterns, pages, etc.)
4. `pattern2routes()` generates React Router route objects with loaders
5. `createBrowserRouter(routes)` creates the router
6. Route loaders run on navigation, fetching page data via Falcor
7. Components render with loaded data

**Pain points:**
- No content until JS loads and executes (bad for SEO, slow first paint)
- Double data fetch: site config fetch, then page data fetch
- `preloadPageSections` helps with dataWrapper sections but only after the router is running

---

## 2. React Router 7 Modes

React Router 7 offers three modes. DMS currently uses Library Mode (manual `createBrowserRouter`). The path forward is Data Mode for SSR.

| Mode | SSR | RSC | File Routing | Vite Plugin Required | DMS Fit |
|------|-----|-----|-------------|---------------------|---------|
| **Library Mode** | No | No | No | No | Current setup |
| **Data Mode** | Yes (manual) | Yes (low-level APIs) | No | No | **Best fit** |
| **Framework Mode** | Yes (built-in) | Yes (via plugin) | Yes | Yes (`@react-router/dev`) | Too opinionated |

### Why Not Framework Mode

Framework Mode requires:
- `react-router.config.ts` with file-based routing
- The `@react-router/dev` Vite plugin controlling the build
- Registering DMS routes at both `/` and `/*` due to how framework mode handles root paths
- Giving up control of the render pipeline (entry points, HTML template, etc.)

DMS generates routes dynamically from API data. Framework Mode's file-based routing is a mismatch -- DMS routes aren't known at build time, they're fetched from the database. Data Mode lets us keep `pattern2routes()` and `dmsPageFactory()` exactly as they are, while adding server rendering on top.

### Data Mode SSR APIs

These are the stable (non-RSC) APIs for SSR in Data Mode:

| API | Purpose |
|-----|---------|
| `createStaticHandler(routes)` | Creates a server-side handler that matches requests to routes and runs loaders |
| `handler.query(request)` | Takes a Web `Request`, runs matched loaders/actions, returns a context |
| `createStaticRouter(dataRoutes, context)` | Creates a router from the handler's context (for `renderToString`) |
| `StaticRouterProvider` | Renders the static router into HTML, embeds hydration data as `<script>` |
| `createBrowserRouter(routes, { hydrationData })` | Client-side: hydrates from server-embedded data |

These are **stable** APIs (not `unstable_` prefixed) and are the same ones used by the existing `references/vite-ssr/` project.

---

## 3. SSR with Data Mode (No RSC)

This is the immediate, practical path. No RSC, no experimental APIs -- just server-side rendering of the existing component tree.

### Architecture

```
                     Request
                        |
                        v
                   +---------+
                   | Express |  (or Hono, Fastify, etc.)
                   +---------+
                   /          \
           Dev Mode            Prod Mode
          /                          \
   Vite Dev Server              Static assets
   (middlewareMode)             (dist/client/)
          |                          |
          v                          v
   entry-server.jsx            dist/server/entry-server.js
          |
          v
   1. dmsSiteFactory() → route objects with loaders
   2. createStaticHandler(routes)
   3. handler.query(webRequest)  → runs loaders via Falcor
   4. createStaticRouter(dataRoutes, context)
   5. renderToString(<StaticRouterProvider />)
   6. Inject into index.html template
          |
          v
       Response (full HTML with data)


   Client (hydration):
   entry-client.jsx
          |
          v
   hydrateRoot(
     <RouterProvider
       router={createBrowserRouter(routes, {
         hydrationData: window.__staticRouterHydrationData
       })}
     />
   )
```

### How It Works with DMS

1. **Server startup**: Call `dmsSiteFactory({ app, type, API_HOST, ... })` to fetch site config and generate routes. Cache the routes (invalidate on admin changes).

2. **Per request**: `createStaticHandler(routes).query(request)` matches the URL, runs the matched route's `loader` function. The DMS loader calls `dmsDataLoader(falcor, config, path)` which fetches page data via Falcor from dms-server. This all runs server-side in Node.js -- Falcor's HTTP transport works identically.

3. **Render**: `createStaticRouter` + `StaticRouterProvider` renders the full component tree to HTML. The `StaticRouterProvider` automatically embeds loader data as a `<script>` tag for hydration.

4. **Hydrate**: Client receives full HTML (visible immediately), then `hydrateRoot` attaches event handlers and takes over. `createBrowserRouter` receives the hydration data so it doesn't re-run loaders.

### What Changes from Current SPA

| Concern | SPA (now) | SSR (proposed) |
|---------|-----------|----------------|
| Entry point | Single `main.jsx` | Split: `entry-server.jsx` + `entry-client.jsx` |
| Router creation | `createBrowserRouter` | Server: `createStaticHandler` → `createStaticRouter`; Client: `createBrowserRouter` with hydration |
| Site config fetch | Client-side in `DmsSite` component | Server-side at startup via `dmsSiteFactory()` |
| `window` usage | Everywhere | Must guard or extract (see Challenges) |
| Build | Single client build | Two builds: `vite build` (client) + `vite build --ssr` (server) |
| Deployment | Static files (Netlify) | Node.js server (Netlify Functions, Fly.io, Railway, etc.) |
| First paint | After JS loads + API call | Immediate (HTML has content) |

### Build Configuration

```javascript
// vite.config.js (mostly unchanged, just add ssr entry)
export default defineConfig({
  plugins: [
    tailwindcss(),
    react({ babel: { plugins: [['babel-plugin-react-compiler']] } }),
  ],
  // No changes needed -- ssr entry is specified at build time
})
```

```json
// package.json scripts
{
  "build:client": "vite build --outDir dist/client",
  "build:server": "vite build --ssr src/entry-server.jsx --outDir dist/server",
  "build": "npm run build:client && npm run build:server"
}
```

---

## 4. React Server Components

RSC is a separate concern from SSR. SSR renders components to HTML strings on the server; RSC renders components to a streaming **Flight** protocol that the client can progressively hydrate without shipping the server component code to the browser.

### Current Status in React Router (February 2026)

- All RSC APIs are prefixed with `unstable_` -- subject to breaking changes in minor/patch releases
- RSC Data Mode shipped first; RSC Framework Mode followed in v7.9.2 (September 2025)
- Stabilization timeline is unclear -- may or may not happen before React Router v8
- RSC Framework Mode does **not** support SPA mode or pre-rendering yet

### RSC Data Mode APIs

| API | Purpose |
|-----|---------|
| `matchRSCServerRequest` | Matches routes, returns RSC Flight response (`unstable_RSCPayload`) |
| `routeRSCServerRequest` | Routes request to RSC server, handles HTML vs data requests |
| `RSCHydratedRouter` | Client-side: hydrates from RSC payload |

The `lazy` field of RSC route configs expects the same shape as Route Module exports, so routes defined for Data Mode SSR can be incrementally upgraded to RSC.

### Key RSC Concepts for DMS

**Server Components** can be `async`, fetch data directly, and never ship their code to the browser:

```jsx
// This component runs ONLY on the server
export async function ServerComponent() {
  const products = await db.query("SELECT * FROM products");
  return (
    <div>
      <h1>Products ({products.length})</h1>
      <ul>{products.map(p => <li key={p.id}>{p.name}</li>)}</ul>
      <InteractiveFilter /> {/* "use client" -- only this ships to browser */}
    </div>
  );
}
```

**Loaders can return JSX** -- a stepping stone before full `ServerComponent` routes:

```jsx
export async function loader() {
  const sections = await getSections();
  return {
    renderedContent: (
      <div>
        {sections.map(s => renderSection(s))} {/* Server-only rendering */}
      </div>
    ),
  };
}
```

This is particularly relevant for DMS where **content determines components** -- instead of bundling every possible section component for the client, RSC would only send the ones actually used on a page.

**Mixed route trees**: Nested routes can freely mix server and client component routes. A server route can contain a client route child, and vice versa. This enables incremental adoption.

### RSC Build Requirements

| Dependency | Version | Notes |
|-----------|---------|-------|
| `@vitejs/plugin-rsc` | v0.5.x | Experimental Vite RSC plugin |
| `@react-router/dev` | latest | Provides `unstable_reactRouterRSC` (Framework Mode only) |
| React | >= 19.0.4 / 19.1.5 / 19.2.4 | Must use patched versions (see Security) |
| Vite | >= 6+ | Environment API required by RSC plugin |

For Data Mode RSC (no Framework Mode), you need `@vitejs/plugin-rsc/plugin` (note the `/plugin` subpath -- different from Framework Mode which uses `@vitejs/plugin-rsc` directly) and the low-level React Router RSC APIs. The plugin handles `"use client"` / `"use server"` boundary compilation.

### RSC Data Mode Entry Points

Data Mode RSC requires **three explicit entry points** (vs Framework Mode which manages these internally):

```
src/
  entry.rsc.tsx       # RSC server: matches requests, generates RSC Flight payloads
  entry.ssr.tsx       # SSR server: converts RSC payload to HTML for initial page load
  entry.browser.tsx   # Browser: hydrates HTML, sets up server action callbacks
```

**Vite config for Data Mode RSC:**

```javascript
import rsc from "@vitejs/plugin-rsc/plugin";   // note: /plugin subpath
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    rsc({
      entries: {
        client: "src/entry.browser.tsx",
        rsc: "src/entry.rsc.tsx",
        ssr: "src/entry.ssr.tsx",
      },
    }),
  ],
});
```

**Route config uses `RSCRouteConfig` with `lazy` imports:**

```javascript
import type { unstable_RSCRouteConfig as RSCRouteConfig } from "react-router";

export function routes() {
  return [
    {
      id: "root",
      path: "",
      lazy: () => import("./root/route"),
      children: [
        { id: "home", index: true, lazy: () => import("./home/route") },
        { id: "about", path: "about", lazy: () => import("./about/route") },
      ],
    },
  ] satisfies RSCRouteConfig;
}
```

The `lazy` field expects the same exports as Route Module exports (loader, ServerComponent/default, ErrorBoundary, etc.), unifying the API surface between Data Mode and Framework Mode.

**Key Data Mode RSC APIs used in entry points:**

- `entry.rsc.tsx`: `matchRSCServerRequest` + RSC serialization from `@vitejs/plugin-rsc/rsc` (`renderToReadableStream`, `decodeAction`, `decodeFormState`). Uses `import.meta.viteRsc.loadModule()` for cross-environment module loading.
- `entry.ssr.tsx`: `routeRSCServerRequest` + `RSCStaticRouter` for server rendering. Renders Flight payload to HTML via `react-dom/server.edge`.
- `entry.browser.tsx`: `RSCHydratedRouter` from `react-router/dom` + `createCallServer` for post-hydration server action RPC.

This three-entry architecture gives full control over each layer of the RSC pipeline -- exactly the kind of control DMS needs for its dynamic route generation.

---

## 5. Existing Reference: `references/vite-ssr/`

The project at `references/vite-ssr/` is a proof-of-concept SSR setup. It demonstrates the architecture but has several gaps.

### What It Gets Right

- **Manual SSR with Data Mode APIs**: Uses `createStaticHandler` / `createStaticRouter` / `StaticRouterProvider` -- exactly the approach we want
- **Express + Vite middleware**: Dev mode uses `vite.ssrLoadModule()` for hot reloading; prod uses pre-built server bundle
- **Shared routes**: Same `routes.jsx` imported by both client and server entries
- **Template injection**: Server reads `index.html`, replaces `<!--app-html-->` and `<!--app-head-->` with SSR output
- **Two-build system**: Separate client and server builds

### What's Missing or Broken

1. **DMS integration is commented out**: `routes.jsx` has the DMS import commented out -- it only renders static "Hello world" routes
2. **`window.location.host` in `getSubdomain()`**: `dmsSiteFactory.jsx` calls `window.location.host` which would crash server-side
3. **Incomplete `handleDataRequest`**: References `queryRoute` which is never imported
4. **TailwindCSS CDN workaround**: Uses browser CDN script alongside the Vite plugin -- indicates CSS-in-SSR wasn't fully solved
5. **No React Compiler**: Uses plain `@vitejs/plugin-react`
6. **No `preloadPageSections`**: The dataWrapper preload system didn't exist when this was built
7. **Hydration data path**: `entry-client.jsx` references `window.__staticRouterHydrationData` but this is actually embedded by `StaticRouterProvider` automatically

### Useful as Starting Point

The server.js, entry-server.jsx, and entry-client.jsx files provide the correct scaffolding. The main work is:
1. Wire up `dmsSiteFactory()` to generate routes server-side
2. Fix `window` references in DMS code
3. Handle TailwindCSS properly in SSR
4. Integrate `preloadPageSections` (already runs in loaders, should work as-is)

---

## 6. DMS-Specific Challenges

### 6.1 Dynamic Route Generation

DMS routes are generated at runtime from API data, not defined statically. The `dmsSiteFactory()` async function fetches site config and calls `pattern2routes()` to produce route objects.

**For SSR**: Call `dmsSiteFactory()` at server startup and cache the result. Invalidate when admin changes patterns. This is a one-time fetch, not per-request.

```javascript
// server.js
let cachedRoutes = null;

async function getRoutes() {
  if (!cachedRoutes) {
    cachedRoutes = await dmsSiteFactory({ app, type, API_HOST, ... });
  }
  return cachedRoutes;
}
```

### 6.2 `window` References

Several DMS files reference `window` which doesn't exist server-side:

| File | Usage | Fix |
|------|-------|-----|
| `dmsSiteFactory.jsx` `getSubdomain()` | `window.location.host` | Accept host as parameter, extract from `Request` on server |
| Various components | `window.scrollTo`, `window.innerWidth` | Guard with `typeof window !== 'undefined'` or move to `useEffect` |
| `@availabs/avl-falcor` | May reference `window` for config | Verify -- Falcor HTTP transport should work in Node |

### 6.3 Falcor in Node.js

Falcor's `HttpDataSource` makes HTTP requests to the graph endpoint. This works in Node.js -- no browser APIs required. The DMS CLI already proves this: it uses the same `dmsDataLoader` → Falcor path from Node.

**Optimization opportunity**: When dms-server runs on the same machine as the SSR server, Falcor requests could be short-circuited to in-process calls instead of going through HTTP.

### 6.4 Component SSR Compatibility

Most DMS view components should render fine in SSR since they produce standard React elements. Components that need attention:

| Component | Issue | Fix |
|-----------|-------|-----|
| **Lexical Editor** | Uses `contentEditable`, DOM APIs | Only affects edit mode -- view mode uses `getHtmlSync()` which is pure computation |
| **MapLibre GL** | WebGL, requires `<canvas>` | Render placeholder on server, hydrate with map on client |
| **DataWrapper** | Complex state machine | View path should work -- `preloadPageSections` already computes state outside React |
| **Charts (Recharts, etc.)** | SVG-based, should work | Verify no `window.ResizeObserver` dependencies |

### 6.5 CSS in SSR

TailwindCSS 4 with `@tailwindcss/vite` generates CSS at build time. For SSR:
- Client build produces CSS files with hashed names in `dist/client/assets/`
- The `index.html` template includes `<link>` tags pointing to these files
- Server injects HTML into the template, so CSS loads from the same `<link>` tags
- No special SSR CSS handling needed (unlike CSS-in-JS solutions)

### 6.6 Deployment Infrastructure

Moving from static Netlify to SSR requires a server runtime:

| Option | Pros | Cons |
|--------|------|------|
| **Netlify Functions** | No infra change, same platform | Cold starts, function timeout limits |
| **Fly.io** | Full Node.js server, low latency | New platform to manage |
| **Railway** | Simple Node.js deployment | New platform |
| **Self-hosted (existing dms-server)** | Co-locate with API, eliminate network hops | More ops burden |

The most interesting option is co-locating SSR with dms-server -- the Falcor data is on the same machine, eliminating network round trips for data loading.

---

## 7. Proposed Path: SSR via Data Mode

### Phase 1: Basic SSR (No RSC)

Add server-side rendering using stable React Router 7 Data Mode APIs.

**Files to create:**
- `src/entry-server.jsx` -- Server render function using `createStaticHandler` / `renderToString`
- `src/entry-client.jsx` -- Hydration entry using `hydrateRoot` / `createBrowserRouter`
- `server.js` -- Express server with Vite middleware (dev) / static serving (prod)

**Files to modify:**
- `src/App.jsx` -- Extract route config so it can be shared between client and server entries
- `vite.config.js` -- No changes needed (ssr entry specified at build time)
- `package.json` -- Add build:client, build:server, start:server scripts

**Key implementation:**

```jsx
// entry-server.jsx (sketch)
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { renderToString } from 'react-dom/server';
import { dmsSiteFactory } from './dms/src';

let routesPromise = null;

export async function render(request) {
  // Lazy-init routes (cached after first call)
  if (!routesPromise) {
    routesPromise = dmsSiteFactory({ app, type, API_HOST, ... });
  }
  const routes = await routesPromise;

  const { query, dataRoutes } = createStaticHandler(routes);
  const context = await query(request);

  if (context instanceof Response) return context; // redirects

  const router = createStaticRouter(dataRoutes, context);
  const html = renderToString(<StaticRouterProvider router={router} context={context} />);

  return { html, status: context.statusCode };
}
```

**Scope**: Page pattern view mode only. Admin, edit mode, forms, and datasets patterns remain client-only (they're behind auth and don't benefit from SSR).

### Phase 2: Streaming SSR

Replace `renderToString` with `renderToPipeableStream` for streaming. This sends the HTML shell immediately and streams in content as loaders resolve.

```jsx
import { renderToPipeableStream } from 'react-dom/server';

// Instead of renderToString, pipe the stream to the response
const { pipe } = renderToPipeableStream(
  <StaticRouterProvider router={router} context={context} />,
  {
    onShellReady() {
      // Send the HTML shell immediately
      response.setHeader('Content-Type', 'text/html');
      pipe(response);
    },
  }
);
```

### Phase 3: RSC (When Stable)

Once React Router stabilizes RSC APIs (drops `unstable_` prefix), convert view-mode section components to server components.

**Best candidates for RSC:**
- **Rich Text (Lexical) view**: Already uses `getHtmlSync()` -- pure computation, no client JS needed
- **Spreadsheet view**: Table HTML can be rendered server-side; interactivity (sort, filter) stays client
- **Card view**: Static HTML rendering, only interactive elements need client JS
- **Graph view**: SVG charts could be server-rendered; client hydrates for tooltips/zoom

**Pattern**: Use loaders returning JSX as a stepping stone:

```jsx
// Before full RSC -- loader returns pre-rendered sections
export async function loader({ request, params }) {
  const data = await dmsDataLoader(falcor, config, path);
  return {
    data,
    // Pre-render static sections as JSX (server-only)
    renderedSections: data.sections
      .filter(s => isStaticSection(s))
      .map(s => <ServerRenderedSection key={s.id} section={s} />),
  };
}
```

---

## 8. Future: RSC for View Sections

DMS section rendering is a natural fit for RSC because **the data determines which components render**. Today, the client bundles every possible section component (Spreadsheet, Card, Graph, Rich Text, Map, etc.) even if a page only uses one.

### How It Would Work

```
Page View (Server Component)
├── Layout (Server) -- renders nav, sidebar from theme
├── Section: Rich Text (Server) -- renders Lexical JSON to HTML, zero client JS
├── Section: Spreadsheet (Client) -- "use client", needs interactivity
├── Section: Card (Server) -- renders card HTML, only card links need client JS
└── Section: Graph (Client) -- "use client", needs D3/Recharts interactivity
```

**Bundle size impact**: A page with only Rich Text sections would ship zero section component JS to the browser. Today it ships ~200KB+ of component code that's never used.

### Section Component Classification

| Component | RSC Candidate | Reason |
|-----------|--------------|--------|
| Rich Text (Lexical) | Yes (excellent) | View is pure HTML from `getHtmlSync()`, no interactivity |
| Card | Partial | Static content is server-renderable; links and hover states need client |
| Spreadsheet | Partial | Table HTML is server-renderable; sort/filter/pagination need client |
| Graph | No (initially) | Chart libraries (Recharts) rely heavily on browser APIs |
| Map | No | MapLibre GL requires WebGL |
| Selector | No | Purely interactive |

### The `"use client"` Boundary Challenge

DMS section components are registered dynamically via `registerComponents()` and resolved at runtime. RSC requires `"use client"` directives at module boundaries at compile time. This means:

1. Each section component file that uses hooks/interactivity needs `"use client"` at the top
2. The section resolver needs to handle both server and client components
3. The `componentRegistry.js` system needs to be RSC-aware

This is the biggest architectural challenge for RSC in DMS and is best deferred until the APIs stabilize.

---

## 9. Security

### CVE-2025-55182 (CVSS 10.0) -- Critical RCE in RSC Flight Protocol

In December 2025, a critical vulnerability was found in React Server Components:

- **Impact**: Unauthenticated remote code execution on the server via insecure deserialization of HTTP requests
- **Root cause**: `requireModule` in `react-server-dom-webpack` didn't validate export names, allowing access to `Function` constructor
- **Affected**: `react-server-dom-webpack`, `react-server-dom-parcel`, `react-server-dom-turbopack` in React 19.0.0, 19.1.0, 19.1.1, 19.2.0
- **Fixed in**: React 19.0.1, 19.1.2, 19.2.1 (December 3, 2025)
- **Public exploits exist** and real-world exploitation was observed

### Additional CVEs

- **CVE-2025-55183** (CVSS 5.3): Source code exposure through RSC
- **CVE-2026-23864** (CVSS 7.5): Denial of service

### Safe Versions (as of February 2026)

React >= 19.0.4, >= 19.1.5, or >= 19.2.4

### Implications

1. **SSR without RSC has no new attack surface** -- `renderToString` / `renderToPipeableStream` are battle-tested APIs that don't involve the Flight protocol
2. **RSC introduces server-side code execution from client requests** -- the Flight protocol deserializes client data on the server, which is inherently risky
3. Any RSC deployment must pin React to patched versions and actively track security updates
4. The current DMS `package.json` has `"react": "^19.1.0"` which could resolve to vulnerable versions unless the lockfile pins correctly

**Recommendation**: Phase 1 (SSR without RSC) is safe. Phase 3 (RSC) should wait not just for API stability but also for the security model to mature.

---

## 10. Recommendations

### Immediate (Phase 1): SSR with Data Mode

**Do this now.** The APIs are stable, the reference project provides scaffolding, and the DMS architecture already supports it:

- `dmsSiteFactory()` generates routes with loaders -- works server-side as-is
- `dmsDataLoader` uses Falcor HTTP transport -- works in Node.js (proven by CLI)
- `preloadPageSections` runs in loaders -- already designed for pre-React execution
- View components produce standard React elements -- `renderToString` compatible

**Scope**: Page pattern view mode. Admin/edit/forms stay client-only.

**Effort**: Medium. Main work is the entry point split, `window` guards, and deployment infrastructure.

### Near-term: Streaming SSR (Phase 2)

Upgrade `renderToString` to `renderToPipeableStream` for faster time-to-first-byte. Low effort once Phase 1 is working.

### Wait: RSC (Phase 3)

Monitor React Router for RSC API stabilization (drop of `unstable_` prefix). When stable:

1. Add `"use client"` directives to interactive section components
2. Convert view-only sections (Rich Text, static Cards) to server components
3. Use loader-returns-JSX pattern as a stepping stone
4. Audit `componentRegistry.js` for RSC compatibility

**Don't build on `unstable_` APIs in production.** The December 2025 CVE and the API churn make RSC premature for DMS today. SSR without RSC delivers 90% of the benefit (fast first paint, SEO, preloaded data) without the risk.

### Infrastructure

Co-locating the SSR server with dms-server is the best option -- it eliminates network round trips for Falcor data loading and simplifies deployment. Express middleware or a separate process on the same host both work.

---

## References

### Blog Posts
- [React Router RSC Preview](https://remix.run/blog/rsc-preview) -- Data Mode RSC APIs, incremental adoption
- [React Router RSC Framework Mode Preview](https://remix.run/blog/rsc-framework-mode-preview) -- Framework Mode Vite plugin
- [Incremental Path to React 19](https://remix.run/blog/incremental-path-to-react-19) -- Migration strategy

### Documentation
- [React Router: Picking a Mode](https://reactrouter.com/start/modes) -- Library vs Data vs Framework
- [React Server Components How-To](https://reactrouter.com/how-to/react-server-components)
- [matchRSCServerRequest API](https://reactrouter.com/api/rsc/matchRSCServerRequest)
- [RSCHydratedRouter API](https://reactrouter.com/api/rsc/RSCHydratedRouter)

### Templates / Examples
- [RSC Framework Mode Template](https://github.com/remix-run/react-router-templates/tree/main/unstable_rsc-framework-mode)
- [Parcel RSC Starter](https://github.com/jacob-ebey/experimental-parcel-react-router-starter) -- Data Mode RSC with Parcel
- [Existing reference: `references/vite-ssr/`](../../references/vite-ssr/) -- Manual SSR proof-of-concept

### Security
- [Critical RSC Vulnerability (react.dev)](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components) -- CVE-2025-55182
- [RSC DoS + Source Exposure (react.dev)](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components)

### Other
- [React Router v8 Discussion](https://github.com/remix-run/react-router/discussions/14468) -- RSC stabilization timeline
- [@vitejs/plugin-rsc](https://www.npmjs.com/package/@vitejs/plugin-rsc) -- Vite RSC plugin (v0.5.x, experimental)
- [React Architecture: SPA, SSR, or RSC](https://reacttraining.com/blog/react-architecture-spa-ssr-rsc) -- Tradeoff analysis
