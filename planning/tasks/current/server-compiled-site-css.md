# Server-compiled per-site CSS, replacing the in-browser Tailwind compiler

**Initiatives:** [plat_tenant_hub](../../../../../planning/initiatives/plat_tenant_hub.md) (primary), [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** doing (P0–P5 done 2026-11-23, not committed; later: the size step) · **Created by:** amuro@albany.edu · **Edited by:** amuro@albany.edu

**Project:** DMS library + dms-server · **Topic:** themes / CSS · **Started:** 2026-11-22

## Objective

Every site gets **one stylesheet compiled by the server** that covers every class the site can render: the core
library and app code, the site's themes (code themes and `:theme` rows), class strings stored in its content, and
(later) its active plugins. The page links it in the head, so styles are there at first paint, and view pages stop
loading the in-browser Tailwind compiler from the CDN.

Split out of [dms-plugin-system.md](./dms-plugin-system.md) (owner's decision D5, 2026-11-22: server-compiled CSS,
"for reasons beyond plugins"), and the same as future direction 6 of [rsc-view-pages.md](../completed/rsc-view-pages.md)
("the CDN Tailwind runtime loads and compiles CSS in the browser on every page, on both paths; move that CSS to
build time"). The plugin system needs it before its P2 (runtime loading): a plugin's classes were never scanned by
the app build.

## Scope

- **In:** a compiler in dms-server; what it reads (candidates from code, themes, content, plugins); caching and
  rebuild triggers; serving and linking the sheet on the SPA, SSR and RSC paths; what the editor does for classes
  an author is typing; retiring the CDN script on view pages; measuring the effect.
- **Out:** changing what themes or authors write (the class strings stay as they are); the theme picker work
  (`dms_theme_management`, stopped); fonts (already server-injected, `ssr-runtime-theme-css-fouc.md`).

## Current state (2026-11-22)

- **Two compilers run.** The app build compiles `src/index.css` (`@import "tailwindcss"`, `@source "../scripts"`,
  the `dark` custom variant) with `@tailwindcss/vite` (`vite.config.js:273`, client build only) from the classes
  it finds in source. Every page also loads `@tailwindcss/browser@4` from jsDelivr (`index.html:27`, `defer`, with
  a second `dark` variant in a `text/tailwindcss` style), which scans the live DOM and compiles whatever the build
  sheet lacks.
- **Why the runtime compiler exists** (comments in `index.html` and `src/index.css`):
  - class strings stored in DMS content: `:theme` rows, section settings, seed scripts' output (e.g. the WCDB
    footer's `md:grid-cols-[1.4fr_0.5fr_0.5fr]`);
  - arbitrary-value classes **built at runtime by JS template literals** (e.g. `bg-[var(--t-cobalt)]`), which no
    scanner can see in source.
- **What it costs:**
  - a third-party script and a compile on every page load;
  - a flash after first paint while those classes resolve (the reason it was moved to the head with `defer`);
  - an ordering hazard between the two sheets (the `@source "../scripts"` comment);
  - the RSC path's measurements list it as a remaining per-page cost.
- **Sites are static builds** served per Host by dms-server on mercury, or by Netlify for sites whose DNS hasn't
  moved. Netlify-served sites have no dms-server in front of them, only the API host.

## Proposed changes

### 1. The compiler (dms-server)

- Tailwind 4's Node API: compile the host's input CSS once, then `build(candidates)` for a site's candidate set.
  The oxide scanner extracts candidates from strings. Check the exact API (`@tailwindcss/node`,
  `@tailwindcss/oxide`) in phase 1.
- **Input CSS:** the app's `src/index.css` (one copy, shipped with the build so the server compiles with the same
  directives, `@custom-variant dark` included), plus theme CSS variables where themes define them.
- **Candidates, by source:**
  1. **code** (core, app patterns, code themes): the app build writes its scanned candidate list to a manifest
     (`dist/.dms/css-candidates.json`), so the server never scans source;
  2. **`:theme` rows** of the site;
  3. **the site's content rows** (pages, sections/components, patterns): every string in `data` run through the
     scanner;
  4. **active plugins' `classes.txt`** (dms-plugin-system.md, when that lands);
  5. **classes composed in code** (template literals). P0 split these in two:
     - **code themes** compose classes from module constants and string operations (``text-[${C.fog}]``,
       ``[&_p]:!${T.metaXS.replaceAll(' ', ' [&_p]:!')}``): ~9,900 interpolations in ~30 theme files. The scanner
       can't read them, but **evaluating the theme module** and scanning its strings resolves every one (P0: avail
       v10 26 of 26, mny 3 of 3). The build does this for every registered theme and adds the result to the
       manifest;
     - **render-time classes** in components (``max-w-${size}`` in `sectionGroup.jsx:97`, ``w-[${width}]`` in
       `ColumnControls.jsx:249`, ``md:col-span-${n}`` in `wcdb_theme.js:34`): a handful, none seen on the 60 pages.
       These need a safelist or a rewrite (P4).
- **Theme `@theme` blocks** (theme `fonts` entries of type `tailwind`, injected as `<style type="text/tailwindcss">`
  and read today only by the runtime compiler) are **per-site input CSS**, appended to `src/index.css` before
  compiling: they define the font variables and tokens such as `--font-display` and weatheranalytics' `wca-*`
  palette, whose utilities exist only through them.
- **Output:** one sheet per site, minified, content-hashed; kept in memory and in `var/css/<app>/<site>/<hash>.css`
  so a restart doesn't recompile everything.

### 2. Serving and linking

- **Routes** (dms-server, registered before the hosted sites): `/_dms/css/<app>/<type>/<hash>.css`, immutable for a
  year; `/_dms/css/site/<app>/<type>.css`, the site's current sheet, `max-age=60` (10 while partial) plus an `ETag`,
  so a revalidation costs a 304. Both compressed by the server's compression middleware (brotli/gzip).
- **The link:** the build puts `<link rel="stylesheet" data-dms-site-css href="<api host>/_dms/css/site/<app>/<type>.css">`
  at the **end** of `<head>`, after Vite's own sheet, so it wins where they overlap. A server that serves the page
  points it at the hashed sheet:
  - **SSR:** `createSSRMiddleware` (`getSiteCss` option of `mountSSR`);
  - **RSC:** the Express mount resolves it per request (navigations too, since they render the head) and
    `resolveRscPage` rewrites the template head's link;
  - **hosted static builds** (dms-server `sites/`): a `transformIndex` hook rewrites the build's `index.html`, using
    the app and type from its `deploy-info.json` and the build's own manifest.
- **Netlify-served sites (decided 2026-11-22): link the sheet on the API host.** These are static builds, so
  their `index.html` can't carry a content hash that changes on every content write. They keep the build-time
  link to the site's sheet by name on the API host (the build knows its `VITE_DMS_APP` / `VITE_DMS_TYPE`), with a
  preconnect to the API host at the top of the head. No `crossorigin` attribute is needed for a plain stylesheet.
  The API server compiles it from its own manifest (`DMS_CSS_MANIFEST`, or its served build's); the Netlify page's
  build sheet already carries every code theme's classes, so a slightly older server manifest only risks the
  site's newest code classes being ordered before content classes.
- **While a sheet is partial** (the app's first content scan hasn't finished, or failed) the server adds the
  in-browser compiler next to the link, pinned to the build's Tailwind version.

### 3. Rebuild triggers

- **Deploy:** a new build brings a new manifest; sheets compiled from it are new.
- **A write:** dms-server's change notification (Falcor writes and sync pushes, `index.js` `notifyAll`) passes every
  saved row to `noteChange`: its strings are scanned, and any valid class new to the app marks that app's sheets
  dirty. A pattern, theme or site row marks them dirty regardless (a theme choice may have changed). The next request
  rebuilds in the background and keeps serving the previous sheet until the new one is ready.
- **Restart:** each app's content classes are saved in `var/css/<app>/content.json` with the change-log revision they
  cover; a restart loads them and catches up from `dms.change_log` (30-day retention); a gap older than that rescans.
- **Plugin activation** (later): add the plugin's `classes.txt`.
- The hash changes only when the sheet does, so browsers re-fetch rarely.

### 4. The editor

An author typing a new class into a Card cell or theme field needs it styled before saving. The page editor
(`PageEdit`, `useRuntimeTailwind.js`) loads `@tailwindcss/browser` once per tab; view pages don't. After a save, the
rebuilt sheet covers the class. Dev (`vite` serve) keeps the in-browser compiler on every page. The admin theme
editors keep their own (they preview in iframes with the CDN script).

### 5. Retire the CDN script on view pages

Done: `index.html` no longer loads `@tailwindcss/browser`, its `text/tailwindcss` style or the jsDelivr preconnect.

## Phases

- [x] **P0 (inventory)** (2026-11-22, findings below): per site, what the runtime compiler adds beyond the build
      sheet. Load each measured site's pages headless, take the runtime `<style>`'s rules, and diff them against
      the build CSS. Classify each class by source: content, theme row, runtime template literal, plugin-like app
      code. Count the template-literal ones and list their places in code.
- [x] **P1 (compiler)** (2026-11-22, "Built" below)
  - [x] **P1a (themes in the build):** every registered theme evaluated at build time; its strings' candidates
        reach the build sheet (`@source "../.dms-build/theme-classes.txt"`) and the manifest.
  - [x] **P1b (the server compiler):** `dms-server/src/css/siteCss.js`; per-site sheets for all four apps; parity
        check.
- [x] **P2 (linking)** (2026-11-22): SSR, RSC, hosted static builds; the build-time link for Netlify-served sites;
      the in-browser compiler only in the page editor and dev, or with a partial sheet.
- [x] **P3 (rebuilds)** (2026-11-22): change-notification rebuilds, restart catch-up from the change log. The plugin
      activation hook waits for the plugin system.
- [x] **P4 (template literals)** (2026-11-22): a search of component code (outside theme objects, which evaluation
      resolves) for classes built at render time found one: `ColumnControls.jsx`'s ``w-[${width}]`` (an editor
      control; ten fixed rem widths), now a literal `widthClass` per entry. The two other P0 hits
      (``max-w-${size}`` in `sectionGroup.jsx`, ``md:col-span-${n}`` in `wcdb_theme.js`) are comments explaining
      why the code already uses literal maps. Not in the build: P4 needs the next build to take effect.
- [x] **P5 (measure)** (2026-11-23, "Measured" below): A (build `vsrc`, CDN compiler) vs C (build `css3`), interleaved
      on 5556 / 5557 (`chain_css.sh`, 2026-11-22 23:15 → 01:13), signed out and in; then the two outlier pages one
      load at a time with Chrome's counters, first-byte timing sequentially, and first-visit bytes.
- [ ] **Later (size):** the site's sheet now follows the build sheet (661 KB, every theme), so a page downloads both.
      Next step: on server-served pages, replace the build sheet's Tailwind part with the site's sheet (the plain CSS
      in it, e.g. `avl-graph.css`, served separately), cutting ~400 KB per page.

## Measured (2026-11-23)

`dms perf`, phase tier, RSC on, 9 sites signed out and 8 signed in, 5 runs, medians summed per page
(`scratchpad/css-p0/perf_summary.py`; runs `*-vsrc2-rsc-on` vs `*-css3-rsc-on`, `si-` for signed in):

| | Signed out, A → C | Signed in, A → C |
|---|---|---|
| Total blocking time, warm visits | 28.2 → 46.7 s (+65 %) | 39.2 → 25.3 s (−35 %) |
| … without County Template | 4.8 → 3.5 s (−27 %) | 4.8 → 3.8 s (−21 %) |
| Longest task, warm | 17.5 → 25.8 s | 25.9 → 17.5 s (−33 %) |
| Complete, warm | 92.8 → 92.8 s | 91.1 → 89.6 s (−2 %) |
| Clicks: first paint / Complete | 15.9 → 10.0 s (−37 %) / 52.4 → 41.1 s (−22 %) | 21.4 → 23.8 s / 54.3 → 58.5 s |
| First paint, warm | 51.9 → 56.2 s (+8 %) | 42.7 → 51.2 s (+20 %) |

- **Where the in-browser compile used to run, the main thread is free now:** blocking time per site, signed out:
  avail.org 413 → 10 ms, weatheranalytics 74 → 0, npmrds2 205 → 98, platform docs 232 → 119, MitigateNY
  1.93 → 1.20 s; signed in the same pattern (avail.org 311 → 69 ms, MitigateNY 1.90 → 1.32 s). Complete times fell
  on nearly every site.
- **The outliers are two County Template pages** (drought, extreme heat), with 15–28 s of blocking per load in
  *both* builds and first paint climbing from repeat to repeat; they decide the sums either way (signed out C was
  worse, signed in C was better). Loaded one at a time with Chrome's counters (`stylecost.mjs`, 4 loads each),
  C is **not** more expensive there: style recalculation 0.37 → 0.20 s (drought) and 0.31 → 0.18 s (extreme heat),
  layout, script and total task time all lower. So the run-to-run swing is contention between the three parallel
  browsers on those heavy pages, not the extra sheet.
- **Server:** first byte is unchanged by the per-request sheet lookup (sequential GETs, docs home 50–65 ms on both;
  weatheranalytics home 65–100 ms on both). Platform docs' signed-in first-byte rise in the perf run (+180 ms a page)
  did not reproduce.
- **First-visit bytes** (compressed): A 80 KB build sheet + 59 KB of compiler JavaScript (then a compile on the main
  thread); C 94 KB build sheet + 40–44 KB site sheet, no script. About equal; the size step below would leave the
  ~42 KB site sheet plus the build's plain CSS.

## Built (2026-11-22, not committed)

**Files:**
- `vite-plugins/dmsCssCandidates.js` (new); `vite.config.js` (registered before `tailwindcss()`); `src/index.css`
  (`@source` of the theme classes); `src/themes/index.js` (exports `themeLoaders`); `index.html` (CDN compiler and
  jsDelivr preconnect removed); `.gitignore` (`.dms-build`)
- dms-server: `src/css/siteCss.js` (new); `src/index.js` (routes, `getSiteCss`, the hosted sites' `transformIndex`,
  `noteChange` on both change paths); `src/sites/index.js` (`transformIndex`); `tests/test-site-css.js` (new),
  `tests/test-sites.js` (transform case); `package.json` (`test`, `test:site-css`); `tests/CLAUDE.md`
- dms library: `render/ssr2/express/setup.mjs`, `render/ssr2/express/middleware.mjs`, `render/rsc/rscHandler.js`,
  `render/rsc/resolvePage.js` (the link); `patterns/page/pages/edit/useRuntimeTailwind.js` (new) and
  `patterns/page/pages/edit/index.jsx` (the editor's compiler)
- docs: `documentation/dms-server-env.md` (`DMS_CSS_MANIFEST`, `DMS_CSS_DIR`)

**How the sheet is made** (`siteCss.js`): manifest (input CSS, core candidates, per-theme candidates and `@theme`
blocks) + the themes the site's patterns select (a `:theme` row of that name replaces the code theme, as at render
time) + the app's content classes; one fresh Tailwind compiler per sheet (its `build` is cumulative), then
`optimize` (lightningcss, minified, same fallbacks as the build sheet), sha256 → 16 hex, written to
`var/css/<app>/<type>/<hash>.css`. Content scan: Postgres strips the cached rows inside `element-data` (`data`,
`externalSource`, `sourceInfo`, `symbologies`, …) before sending a row, in batches of 1,000 by id; the oxide scanner
extracts candidates; kept if valid under the input plus every theme's `@theme` blocks and not already core.
Tailwind comes from the app's `node_modules` (in Docker `/app/node_modules`, which the image already copies); a
version different from the manifest's is logged.

**Results (test server 5557, hub DB, build `css3`):**

| Site | Sheet (minified) | Themes | Content classes | First content scan (from this laptop, over the network) |
|---|---|---|---|---|
| avail.org (`hub`) | 258 KB | availabs | 87 | 0.3 s |
| TransportNY (`tny`) | 292 KB | transportnyv2, transportny | 177 | 87 s |
| MitigateNY + County Template (`mny`) | 274 KB | mnyv1, mny_admin | 168 | 436 s (337 k rows) |
| weatheranalytics | 256 KB | weather_analytics | 23 | 0.3 s |

- **Look parity:** today's look (build `rscsi2` + the CDN compiler on 5556) vs the new build with jsDelivr blocked, on
  the 16 probe pages: every element identical on 14 pages; avail.org's 6 pages differ only in one box-shadow written
  in another color notation (`oklab` vs `rgba`, the same `#1B1C1F` at 10 %). Before this work the same comparison
  differed on ~390 elements per avail.org page and 4–6 on MitigateNY's.
- **Ordering check:** on all 60 measured pages, no Tailwind class that renders is in the build sheet but missing from
  the site's sheet (which would let a conflicting class in the later sheet win). The only such classes are the
  graph's plain CSS (`avl-graph.css`), which doesn't compete with utilities.
- **The editor:** signed in on MitigateNY: a view page makes no jsDelivr request and has no in-browser compiler; the
  editor loads it, and a class no sheet has (`bg-[#abcdef]`) is styled at once; back on a view page it is gone. No
  page errors.
- **Tests:** `test-site-css.js` 23/23 on SQLite and on Postgres 17 (Docker); `test-sites.js` 31/31; the rest of
  dms-server's `npm test` passes. `test-config-dirs.js` fails on this machine before and after this change (it
  touches none of its files).
- **Fixed on the way:** the oxide `Scanner` returns nothing for `{ file }` entries without sources, so theme files
  are read and passed as `{ content }`; theme folders skip mockup HTML, `scripts/` and data files over 1 MB (a
  4.6 MB TransportNY mockup dataset took 25 s); evaluation ~6–10 s for 33 themes.

**Not checked live:** a save through the test server (it writes to the live hub database; the save → rebuild path is
covered by the tests on SQLite and Postgres); a hosted static build and a Netlify-built page (the routes and the
rewrite are tested; no build of either kind was served).

## P0 findings (2026-11-22)

**Method.** Server 5556 (build `rscsi2`, RSC on, hub DB), the 60 pages of the 9 measured sites' latest perf runs
(`idx2-rsc-on`), signed out. For each page: load headless, scroll, take the `@tailwindcss/browser` `<style>` and
every class in the DOM, diff the classes it styles against the build sheet (`index-*.css`, 8,071 classes), then
look each missing class up literally in code (`src/`, `data-types/`) and in the app's `data_items` (read-only). Then
16 pages (the 10 with missing classes plus one per other site) were loaded twice, normally and with jsDelivr
blocked, and every element's computed style compared (25 properties). Scripts and results:
`dms-template/scratchpad/css-p0/` (`collect.mjs`, `analyze.mjs`, `classify.mjs`, `evaltheme.mjs`, `parity.mjs`,
`realdiff.py`; `missing.json`, `classified.json`, `parity.jsonl`).

**What the runtime compiler adds beyond the build sheet:**

| Site | Pages | Classes only the runtime styles | Where they come from | Elements that change without it (pages probed) |
|---|---|---|---|---|
| avail.org (`availabs`) | 6 | 37 | 26 from the evaluated v10 theme; 11 in ~40 component rows (written by the v10 build scripts) | ~390 per page (all 6): nav and text colors fall back to the inherited ink |
| County Template | 12 | 3 | all from the evaluated mny theme (`MNY_RULE` constants) | 4–6 (3 pages): border colors fall back to `currentColor` |
| MitigateNY | 12 | 1 | the same mny theme constant | 4 (1 page) |
| TransportNY (landing, status, freight atlas, npmrds2, docs) | 22 | 0 | — | 0 |
| weatheranalytics | 8 | 0 | — | 0 |

- **No class built at render time by component code** appeared on any of the 60 pages. Every theme-composed class
  was recovered by evaluating the theme module (through Vite's SSR loader) and scanning its strings.
- **Content-row classes** appeared only on avail.org. Elsewhere, content strings use classes the code already has.
- **The runtime sheet currently overrides the build sheet for every class it emits**, not only the missing ones: it
  comes later, in the same layers. The CDN URL floats (`@4`, now 4.3.5; the build has 4.3.3), so the only other
  differences seen were notation (`oklab(…)` vs `rgba(…)`, the same colors). That is an uncontrolled version
  dependency on every page.
- **Theme `@theme` blocks:** every measured site's theme but mny injects one (`avail-v10-tw-theme`,
  `transportny-tw-theme`, `wca-tw-theme`; 24 theme files have one). Font families did not change without the
  runtime on any probed page, because the themes also pin `--font-*` in a plain `<style>`. But `font-display` and
  weatheranalytics' `wca-*` colors exist only through them (unused on the visited pages).
- **Size.** One 556 KB build sheet serves every site, with every theme's classes. The visited pages' classes compile
  to 22–66 KB per site (unminified; a lower bound for a full site sheet, which adds the rest of its pages, content
  and the view-side core).
- **Content scan cost.** One full text scan of an app's `data_items`: hub 0.08 s, weatheranalytics 0.03 s, tny 10.6 s
  (27 k components, 174 MB), **mny 105 s** (331 k components, 2.5 GB, mostly section data caches). The first scan
  has to be a background job, cached in `var/css`, with incremental change-log updates after it. Scanning only the
  attributes that can hold classes would cut it further (P1).
- **Node API checked:** `@tailwindcss/node` 4.3.3 `compile(src/index.css + @theme block)` 28 ms, `build(candidates)`
  6 ms. The `@tailwindcss/oxide` `Scanner.scanFiles([{content, extension}])` pulls candidates straight out of
  JSON text. Output matches the runtime's rules for the sampled classes.
- **Not covered:** signed-in pages, the editor, Netlify-served sites, and pages outside the perf samples.

**What this changes in the plan:**

1. **The build can close most of the gap on its own.** Evaluate every registered theme at build time and add its
   strings as candidates (a generated safelist file, or `@source inline(…)`). This alone makes the build sheet
   cover TransportNY, weatheranalytics and MitigateNY completely on these pages. The CDN script could then leave
   those sites' view pages before the server compiler exists. Proposed as the first step of P1.
2. **The server compiler's real job is content classes, theme rows and per-site `@theme` input**, plus a
   per-site sheet a fraction of today's 556 KB.
3. **P4 (template literals) shrinks** to the few render-time component classes above.

## Files requiring changes (expected)

- `index.html`: the CDN script and its style; preconnects
- `src/index.css`: shipped as the server's input; the duplicated `dark` variant in `index.html` goes
- `vite.config.js`: emit the candidate manifest
- `packages/dms-server/src/…`: the compiler module, its cache and route, the change-log hook
- `packages/dms/src/render/ssr2/handler.jsx`, `render/rsc/ViewDocument.jsx`, `render/rsc/generateHTML.js`: the head
  link
- the editor's route entry: the lazy runtime compiler

## Testing checklist

- [ ] Parity: on every page of the measured sites, no element's computed style differs between today (build sheet
      + runtime compiler) and the server sheet, signed out and signed in, light and dark
- [ ] A class added in the editor is styled while editing, and in view after saving
- [ ] Editing a `:theme` row restyles the site's view pages on the next load
- [ ] A deploy that adds code classes rebuilds every site's sheet
- [ ] Restart: sheets served from `var/css` without recompiling every site
- [ ] No request to jsDelivr from any view page
- [ ] Perf: no regression in first byte; first paint and LCP equal or better

## Open questions

- Content-row scanning cost: P0 measured 105 s for MitigateNY's full `data_items` (2.5 GB). Background first
  scan plus incremental updates, as planned. Which attributes can hold classes, so the scan skips section data
  caches?
- Theme CSS variables (P0): yes, the `@theme` blocks in theme `fonts`. They become per-site compiler input.
- Signed-in and editor pages: what do the edit UI's classes add, and do they belong in a separate editor sheet?

## Progress log

- 2026-11-22 — task created, split out of `dms-plugin-system.md` (D5); inherits `plat_tenant_hub`, also serves
  `dms_page_load_performance` (rsc-view-pages future direction 6). `dms_theme_management` considered and not
  linked: it is stopped.
- 2026-11-22 — owner decision: Netlify-served sites link the sheet on the API host (stable per-site URL,
  revalidated by `ETag`), rather than keeping the runtime compiler until their DNS moves.
- 2026-11-22 — P0 (inventory) done: 60 pages, 9 sites, signed out ("P0 findings"). Only avail.org (37 classes, ~390
  elements per page) and MitigateNY / County Template (3 classes, 4–6 elements) depend on the runtime compiler.
  All theme-composed classes are recoverable by evaluating the theme modules; content classes appear only on
  avail.org. Proposed first step of P1: theme evaluation in the build.
- 2026-11-22 — P1a (themes in the build), P1b (server compiler), P2 (linking) and P3 (rebuilds) built and checked
  on test server 5557 ("Built"): look parity with today on the 16 probe pages, no ordering gaps on the 60 measured
  pages, the editor's compiler, tests on SQLite and Postgres. P5 (measure) started (`chain_css.sh`). Not committed.
- 2026-11-23 — P5 (measure) done ("Measured"): blocking time down on every site where the in-browser compile ran;
  the County Template drought / extreme-heat swings are contention between parallel browsers (Chrome's counters
  show less style, layout and script time with the new build). Fixed on the way: the CSS build plugin ran inside
  vitest (which loads `vite.config.js`) and broke every library test; it now stays out of vitest.
- 2026-11-23 — found while testing the plugin build: the build's Tailwind auto-detection scans the planning and
  research markdown, so a class written in a doc (`bg-[#abcdef]` in this file) reaches the build sheet and the core
  manifest. A size follow-up: `@source not` the `planning/`, `research/` and `documentation/` folders.
- 2026-11-23 — the markdown exclusion (`@source not "../**/*.md"` in `src/index.css`): build sheet 661.8 → 654.3 KB,
  core candidates 3,189 → 2,775 (site sheets 233–276 KB). It exposed a **bug in the content scan**: it stored only
  content classes that weren't core candidates, so a class that left core with a new manifest (here: named in a doc,
  rendered from content, e.g. avail.org's `md:grid-cols-[max-content_1fr]` from the v10 build scripts) vanished
  from the site's sheet and lost to a conflicting class (grid columns on two avail.org pages). Fixed: every valid
  content class is kept; the saved scan is versioned (`v: 2`), and an older one is rescanned. Regression test in
  `test-site-css.js` (26). The gap check's `inline-editor-image` / `font-display` hits are false positives (they
  appear only inside other classes' selectors).

