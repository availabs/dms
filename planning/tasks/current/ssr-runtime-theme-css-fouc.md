# SSR: runtime-injected theme CSS/fonts cause a flash of unstyled content

## Status: IMPLEMENTED and LIVE-VERIFIED 2026-08-31

All 5 proposed changes landed (`dms` repo, `local-first-sync-updates`,
commits `6c544ac5` then a same-day branch-order correction `092fa76d` — see
"Implementation notes / gotcha hit" below). Client (`npm run build`) and
SSR (`npm run build:ssr`) both compile cleanly. Deployed to tessera.so via
`setup/scripts/server-update.sh` (zero-downtime) and confirmed live:
`curl`ing the raw SSR response now shows all 5
`data-dms-theme-font="..."` `<style>` tags embedded directly in `<head>`,
and a Playwright screenshot capture of a fresh load shows the fully themed
page (paper-grain background, bold display font, blue accents) in the
*first* captured frame (~450ms) — no more unstyled-then-styled flash.

## Objective

On an SSR page load, real content paints immediately (SSR renders correct
markup + `className`s), but the theme's actual visual identity — colors,
background textures, brand fonts, custom component classes — doesn't apply
until ~700-900ms later, once client JS has downloaded, parsed, hydrated, and
run an effect that injects `<style>` tags into `<head>`. The result is a
visible flash: real content in default/unstyled fonts, then a sudden jump to
the fully themed page. Fix it by generating the same `<style>` content
server-side and embedding it in the SSR HTML, so it's present at first paint.

## Scope

- In scope: `packages/dms/src/ui/useTheme.js` (the font/theme-CSS loader),
  `packages/dms/src/render/ssr2/handler.jsx` and
  `packages/dms/src/render/ssr2/express/middleware.mjs` (SSR head injection).
- Out of scope: the compiled build-time Tailwind CSS bundle (that part is
  already correctly linked/ordered; it only ever contained generic
  resets/utilities, never the theme's actual brand CSS — see "Current State").
  Also out of scope: any changes to `dms-template`'s `index.html` or
  `vite.config.js` — a previous attempt to fix this by reordering the
  compiled CSS `<link>` tag in `<head>` was tried and **confirmed
  ineffective** (see "False lead already ruled out" below); don't re-attempt it.

## Current State

### How themes inject their own CSS today (client-only)

A theme can declare a `fonts` array on its config (see e.g.
`src/themes/tessera/tessera-theme-v6.js:1504-1580`, the `fonts` const —
5 entries: a Google Fonts `@import`, a Tailwind-4 `@theme` block registering
brand font tokens, a `:root` re-pin of those tokens, the theme's entire
`_shared.css` design system inlined as one entry (`id: 'tessera-v6-shared'`),
and theme-only extras like the `.t6-band-sheet` background texture).

`getPatternTheme(themes, pattern)` (`ui/useTheme.js:110-140`) is called once
per pattern while building routes — directly, at the top level of every
pattern's `siteConfig.jsx` (`patterns/page/siteConfig.jsx:63`,
`patterns/datasets/siteConfig.jsx:45`, `patterns/auth/siteConfig.jsx:59,174`,
`patterns/mapeditor/siteConfig.jsx:38`, `patterns/admin/siteConfig.jsx:75`;
all plain function calls, not inside React render). As a side effect it
calls `loadThemeFonts(merged?.fonts, {selectedTheme, themes})`
(`ui/useTheme.js:137`), which — client-side only — builds a `<style>` (or
`<link>`-avoiding `@import`-in-`<style>`, deliberately, see the comment at
`useTheme.js:145-149`) DOM node per font entry via `buildFontNode()`
(`useTheme.js:203-258`) and appends it to `document.head`
(`useTheme.js:276`), deduped per font key across the page's lifetime
(`_loadedFontKeys`, module-level `Set`, `useTheme.js:192`).

**Critically, `loadThemeFonts` bails out immediately when there's no
`document`:**

```js
// useTheme.js:267
if (typeof document === 'undefined' || !document?.head) { debug(...); return; }
```

This is explicitly documented as "SSR-safe (no-op without document)"
(`useTheme.js:189`) — i.e. it was designed to be *safe* to call during SSR
(doesn't crash), not to actually *produce* anything during SSR. Since
`getPatternTheme` (and therefore `loadThemeFonts`) already runs during route
building — which happens both client-side (`dmsSiteFactory.jsx`) and
server-side (SSR's `handler.jsx` calls the same route-building path, see
`ssr-multi-tenant-resolution.md` for the shared-code-path precedent) — the
theme's font/CSS entries ARE available and already resolved during SSR; they
just get silently discarded instead of turned into HTML.

### What SSR actually sends today

`packages/dms/src/render/ssr2/handler.jsx`'s `render()` (~line 122-163)
calls `ensureRoutes(host)` (which builds + caches routes per host, running
every pattern's `siteConfig.jsx` and therefore every `getPatternTheme` call
already), then `renderToString()`, then returns `{html, status, headers,
siteData}`. `siteData` flows to
`packages/dms/src/render/ssr2/express/middleware.mjs:58-61`, which builds:

```js
const headContent = `<script>window.__dmsSSRData=${serializedData}</script>`
// ...
.replace('<!--app-head-->', headContent)
```

`<!--app-head-->` is a real, already-wired injection point in
`dms-template/index.html`'s `<head>` — currently used for exactly one thing
(the SSR data script tag). This is the natural place to also inject the
theme's font/CSS `<style>` tags as a string, generated server-side.

### Live evidence (tessera.so, 2026-08-31)

Playwright trace of a fresh load (`scratchpad/network_trace.cjs`,
not committed — gitignored `scratchpad/`, rerun to reproduce):

- `t=13ms`: navigation starts.
- `t=611ms`: `domcontentloaded`. `t=617ms`: `load`. Real SSR content is
  already painted, unstyled (confirmed via screenshot: fallback fonts, no
  background, no brand color, default black-on-white).
- `t=724ms`: **five `<style>` tags appended to `<head>` via JS**, matching
  `tessera-v6-tw-theme`, `tessera-v6-font-stacks`, `tessera-v6-shared`,
  `tessera-v6-theme-extras`, and an unlabeled `data-dms-theme-font="google"`
  one — exactly the 5 entries in tessera-v6's `fonts` array, injected by
  `loadThemeFonts` once client JS hydrates and re-runs route building.
- Screenshot at this point shows the full themed page (paper-grain
  background, bold display font, blue accents) — this is the flash.

### False lead already ruled out

An earlier attempt fixed a *different*, real bug first (see
`packages/dms/src/render/spa/dmsSiteFactory.jsx:84-98` — `DmsSite`'s mount
effect was unconditionally recreating the React Router instance even when
SSR's `hydrationData` already matched, discarding the SSR-hydrated router
and forcing a loader re-run; that fix is real, committed, and stays as-is —
see the `dms` repo `local-first-sync-updates` branch, commit `c560337f`).

After that, the *same visible flash was still present*, and was initially
mis-diagnosed as the compiled Tailwind CSS `<link>` loading too late
(injected last in `dms-template/index.html`'s `<head>`, after the module
script and modulepreload links). A `dms-template`-side Vite plugin
(`hoistEntryCss` in `vite.config.js`) was built, tested, and deployed to
move that `<link>` to the very top of `<head>`. **It made no measurable
difference** — confirmed via before/after Playwright screenshot diffs
against the live redeployed site — because the compiled CSS bundle only
ever contained generic Tailwind resets/utilities; it never contained
tessera's actual theme CSS (that's the `fonts` array content above, which
is client-injected, not part of the build). That plugin has since been
**reverted** (`dms-template` commit `d269d12`, "fix") — don't reintroduce it
without new evidence it helps.

## Proposed Changes

### 1. Give `buildFontNode` (or a sibling) a string-producing SSR mode

**File:** `packages/dms/src/ui/useTheme.js`.

`buildFontNode(font)` (lines 203-258) already has all the logic to turn a
`font` entry into markup — it just does it via `document.createElement` +
`.textContent`/`.dataset`. Add a parallel pure-string version (or refactor
`buildFontNode` to build a `{tag, attrs, content}` descriptor once and have
two renderers — a DOM one for the client, a string one for SSR) that
produces the equivalent `<style ...>...</style>` (or, for `type: 'google'`/
`'css'`, the `<style>@import url(...);</style>` form — keep using
`@import`-in-`<style>`, not a `<link>`, for consistency with the documented
reasoning at `useTheme.js:145-149` and `useTheme.js:205-210`) as a string.

### 2. Collect font HTML during SSR route building instead of discarding it

**File:** `packages/dms/src/ui/useTheme.js`, `loadThemeFonts()` (line 260).

Right now, when `document` is undefined, the function just returns. Instead,
accept an optional collector via `ctx` (already threaded in from
`getPatternTheme` at line 137 — `loadThemeFonts(merged?.fonts, {
selectedTheme: patternSelection, themes })` — just add a third field, e.g.
`ctx.ssrCollect`, an array pushed into by whoever's driving SSR route
building):

```js
if (typeof document === 'undefined' || !document?.head) {
  if (Array.isArray(ctx.ssrCollect)) {
    for (const font of fonts) {
      const key = fontKey(font);
      if (!key || ctx.ssrCollect.__seen?.has(key)) continue; // dedupe within this collection pass
      const html = buildFontNodeHtml(font); // the new string-producing function from step 1
      if (html) ctx.ssrCollect.push(html);
    }
  }
  return;
}
```

Keep the client-side dedup (`_loadedFontKeys`) exactly as-is — it's
per-page-lifetime and orthogonal to this. The SSR collection pass needs its
own local dedup scoped to a single `ensureRoutes(host)` build (multiple
patterns on the same site can share `fonts` entries — the master `page`
pattern and e.g. `mapeditor` might both pull in the same Google Fonts
entry), since it runs once per host-build, not once per page lifetime.

**Concurrency note:** do NOT use a module-level array for this — `dms-server`
is a long-running Node process handling concurrent requests for potentially
different hosts/tenants. The collector must be a fresh array created and
threaded through **for that one `ensureRoutes(host)` call**, not shared
mutable module state. Since `getPatternTheme`/`loadThemeFonts` are called
synchronously during route building (not deferred/async), a plain
locally-scoped array passed down through the existing `ctx` parameter is
safe — no `AsyncLocalStorage` needed.

### 3. Thread the collected HTML through `ensureRoutes`'s cache and `render()`

**File:** `packages/dms/src/render/ssr2/handler.jsx`.

`ensureRoutes(host)` already builds + caches `{routes, handler, siteData}`
per host (`routeCache.set(host, entry)`). Add a `themeFontsHtml` (joined
string of all collected font HTML) to that same cached entry, computed once
per host build. `render()` (~line 122) already destructures
`{routes, handler, siteData}` from `ensureRoutes(host)` — add
`themeFontsHtml` there too, and include it in the object `render()` returns
(~line 158-163) alongside `siteData`.

### 4. Inject into `<!--app-head-->` alongside the existing SSR data script

**File:** `packages/dms/src/render/ssr2/express/middleware.mjs`, line 58.

```js
const headContent =
  `<script>window.__dmsSSRData=${serializedData}</script>` +
  (result.themeFontsHtml || '')
```

No change needed to `dms-template/index.html` — `<!--app-head-->` is
already there and already wired.

### 5. Client-side: avoid re-injecting what SSR already sent

`loadThemeFonts`'s existing `_loadedFontKeys` dedup (module-level `Set`,
survives for the page's lifetime) needs to know about fonts SSR already
embedded, or the client will append duplicate `<style>` tags on hydration
(harmless visually — last one wins, same content — but wasteful and messy
in devtools). Simplest fix: have the SSR-injected `<style>` tags carry the
same `data-dms-theme-font`/`id` attributes `buildFontNode` already uses
(step 1's string version should reuse the exact same attribute-setting
logic), then on the client, seed `_loadedFontKeys` at startup by reading
which `data-dms-theme-font`/`id`-tagged `<style>` tags are already present
in `document.head` (from the SSR-rendered HTML) before the first
`loadThemeFonts` call runs. Needs a small init check near where
`_loadedFontKeys` is declared (`useTheme.js:192`) or where `DmsSite` mounts.

## Files Requiring Changes

| File | Change |
|---|---|
| `packages/dms/src/ui/useTheme.js` | Refactored `buildFontNode` into a shared `fontNodeSpec()` + two renderers: DOM (`buildFontNode`) and string (`buildFontHtml`). `loadThemeFonts` checks `ctx.ssrCollect` **first** (see gotcha below), collecting HTML strings there instead of appending DOM nodes; falls through to the original `document.head.appendChild` path otherwise. `getPatternTheme` gained a third `ssrCollect` param. Client-side dedup (`_loadedFontKeys`) now seeded once from any `data-dms-font-key`-tagged `<style>` tags already in `document.head` (i.e. ones SSR rendered), via `seedLoadedFontKeysFromSSR()`. |
| `packages/dms/src/patterns/{page,datasets,auth,mapeditor,admin}/siteConfig.jsx` | (Not in the original plan — the actual threading path.) Each of the 6 `getPatternTheme(themes, pattern)` call sites now destructures `ssrCollect` from its config-factory args and passes it as the third arg. |
| `packages/dms/src/render/spa/utils/index.js` | `pattern2routes(siteData, props)` destructures `ssrCollect` from `props` and includes it in the `configObj` built for every pattern (the single choke point all 6 `siteConfig.jsx` factories are called through). |
| `packages/dms/src/render/ssr2/handler.jsx` | `buildRoutes(host)` creates a fresh `ssrCollect = []`, passes it into `dmsSiteFactory({...})` (which passes `config` — including `ssrCollect` — straight through to `pattern2routes`, no change needed there), and returns `themeFontsHtml: ssrCollect.join('')` alongside `routes`/`siteData`. `ensureRoutes(host)` caches it per host; `render()` returns it. |
| `packages/dms/src/render/ssr2/express/middleware.mjs` | Append `result.themeFontsHtml` to `headContent` before the `<!--app-head-->` replace. |

### Implementation notes / gotcha hit

**`typeof document === 'undefined'` is not a reliable SSR signal in this
codebase** — `handler.jsx` stubs a real `document` globally via `linkedom`
(`globalThis.document = dom.document`) specifically so other components
(Lexical) can call `document.createElement` during `renderToString`. The
first implementation pass checked `document` first and only used
`ctx.ssrCollect` in the `document === undefined` branch — which meant SSR
never actually hit the collector branch at all: `loadThemeFonts` took the
normal DOM path, appended `<style>` nodes into the *stubbed* `document.head`,
and `renderToString` (which serializes the actual React tree, not the
stubbed document) silently dropped them. Deployed, verified live, and
confirmed to still reproduce the original bug — the theme tags were absent
from both the raw SSR response and `themeFontsHtml`. Fixed by checking
`Array.isArray(ctx.ssrCollect)` **first**, unconditionally, before looking
at `document` at all — an explicit collector is a stronger, more direct
signal than environment-sniffing a value that's been intentionally stubbed
for an unrelated reason. Second deploy confirmed fixed (see Testing
Checklist). If touching this branch again, keep the collector check first.

## Testing Checklist

- [x] `npm run build` (client) and `npm run build:ssr` both compile cleanly.
- [x] `curl` on the raw SSR response (`curl -A "Mozilla/5.0" https://tessera.so/`)
      shows all 5 `data-dms-theme-font="..."` `<style>` tags embedded
      directly in `<head>` — confirmed after the branch-order fix (was empty
      after the first, buggy deploy — see gotcha above).
- [x] Playwright screenshot capture of a fresh load shows the theme's real
      CSS (paper-grain background, bold display font, blue accents) present
      in the *first* captured frame (~450ms), not appearing ~700-900ms later.
- [ ] Network trace confirming no `<style data-dms-theme-font=...>` mutation
      event fires after `load` (i.e. client hydration doesn't also inject
      them) — not explicitly re-verified after the fix; worth a quick check
      since the dedup-seeding path (`seedLoadedFontKeysFromSSR`) is what's
      supposed to prevent this.
- [ ] No duplicate `<style data-dms-theme-font=...>`/`id`-tagged tags in
      `document.head` after hydration — same as above, not explicitly
      re-checked post-fix.
- [ ] Test against at least one other SSR-multi-tenant-relevant site if one
      exists in a test/dev tenant, to confirm this isn't tessera-specific
      wiring — the fix lives entirely in shared `dms` code
      (`useTheme.js`/`ssr2/`/pattern `siteConfig.jsx` files), so it should
      apply to any site with a themed `fonts` array. Not yet tested outside
      tessera.so.
- [x] Confirm the reverted `hoistEntryCss` Vite plugin stays reverted — it
      was not resurrected as part of this work.
- [x] Live verification on tessera.so after deploy: `curl` + Playwright both
      confirm no visible unstyled-then-styled flash on a fresh load.

## Notes for whoever picks this up

- This is a `dms` submodule fix (`packages/dms/src/ui/useTheme.js`,
  `packages/dms/src/render/ssr2/`) — scoped here in `src/dms/planning/`,
  not the root `dms-template/planning/` tree, per `dms-template/CLAUDE.md`'s
  planning split.
- Affects every SSR-enabled site using a theme with a `fonts` array, not
  just tessera — `useTheme.js` is shared DMS library code.
- Deploying this environment's fix requires pushing to the `dms` repo's
  `local-first-sync-updates` branch (this deploy server's `src/dms`
  submodule tracks that branch via a **local-only** `git config
  submodule.src/dms.branch local-first-sync-updates` override in this
  checkout's `.git/config` — `dms-template`'s tracked `.gitmodules` no
  longer pins a branch, intentionally, so other clones default to `dms`'s
  `master`). Redeploy via `setup/scripts/server-update.sh` (zero-downtime,
  see `setup/CLAUDE.md`).
- Related, already-fixed-and-separate: the router-recreation-on-hydration
  bug (`dmsSiteFactory.jsx`, `dms` commit `c560337f`) and the SSR
  multi-tenant resolution bug (`ssr-multi-tenant-resolution.md`, same
  submodule). This task is independent of both — don't conflate the three
  when testing/reviewing.
