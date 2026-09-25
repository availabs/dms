# Shrink the initial JS graph — split by pattern, section type, and editor surface

> Opened 2026-09-22. Owner's Lighthouse run on a built MNY `dist` (FCP 1.8 s, LCP 5.9 s, TBT 770 ms)
> showed that once the network is throttled, **JS transfer dominates** — see the 2026-09-22 entry in
> [`planning/shared/bundle-size-log.md`](../../../../planning/shared/bundle-size-log.md) and the
> throttled trace in [`site-bootstrap-payload-and-pattern-lookup.md`](../current/site-bootstrap-payload-and-pattern-lookup.md).
> The data-layer work in that task took `/cenrep` from 1,350,149 B to 453,318 B; this task is about
> the 1.47 MB of JS that arrives before any of it matters.

**STATUS: CLOSED 2026-09-24 — implemented + verified; NOT committed/deployed (owner).** Follow-ups under
*Remaining* are deferred until the page-load task (`../current/site-bootstrap-payload-and-pattern-lookup.md`)
shows whether more JS splitting is the next bottleneck. Eager JS
**4,730,660 → 2,087,562 B raw, 1,393,628 → 636,077 B gzip (−54%)**; Slow-4G FCP/LCP on MNY `/` 13.5 s → 10.2 s.
Optional follow-ups listed under *Remaining* below. Attribution below is from a real sourcemap analysis, not a
guess. See **Implementation plan (2026-09-24)** below for the phase checklist — it refines item (1).

## Measurement method (repeatable)

```bash
cd dms-template
VITE_DMS_APP=mitigat-ny-prod VITE_DMS_TYPE=prod VITE_DMS_PG_ENVS=hazmit_dama \
  npx vite build --outDir dist-analyze --emptyOutDir --sourcemap
node <attribute.mjs> dist-analyze/assets/index-*.js.map      # see script below
```
`attribute.mjs` decodes the sourcemap's VLQ mappings and charges each run of generated characters to
the source file that produced it (source-map-explorer's approach, no dependency). Keep a copy in
`scratchpad/` — it is ~60 lines and worth rerunning after each split. `npm run analyze`
(vite-bundle-analyzer) gives the same picture interactively.

## Where the bytes are

**`index-*.js` — 2,542,472 B raw / ~736 kB over the wire. 95% is first-party library code, not deps.**

| bytes (raw) | % | module |
|---|---|---|
| 560,198 | 22.1 | `patterns/page/components` — the section components (Card, Spreadsheet, Map, Graph, filters…) |
| 290,896 | 11.5 | `patterns/mapeditor/MapEditor` |
| 270,020 | 10.7 | `patterns/datasets/pages` |
| 230,674 | 9.1 | `ui/components/lexical` |
| 172,357 | 6.8 | `ui/components/graph_new` |
| 136,654 | 5.4 | `patterns/admin/pages` |
| 93,816 | 3.7 | `patterns/datasets/components` |
| 80,414 | 3.2 | `ui/icons/icon_defs.jsx` |
| 64,401 | 2.5 | `patterns/page/pages` |
| 61,071 | 2.4 | `ui/components/table` |
| ~90,000 | 3.5 | `dms-template/data-types/*/pages` (ETL plugin admin pages) |

**`vendor-*.js` — 1,049,846 B raw / ~332 kB over the wire.**

| bytes (raw) | % | package |
|---|---|---|
| 182,026 | 17.4 | react-dom |
| **124,457 + 50,398 + 31,572 + 21,325 + 17,941 ≈ 245,693** | **23.4** | **lexical + @lexical/{table,react,yjs,list}** |
| 91,421 | 8.7 | react-router |
| **66,646 + 19,731 ≈ 86,377** | **8.2** | **yjs + lib0** (collaborative editing) |
| **56,347** | **5.4** | **prismjs** (code highlighting in the editor) |
| 52,472 | 5.0 | falcor |
| 46,400 | 4.4 | lodash-es |
| 18,614 + 18,417 | 3.5 | colorbrewer + d3-scale-chromatic |

**`maplibre-*.js` — 1,053,382 B raw / ~278 kB over the wire**, already its own chunk but still in the
eager graph (a manualChunk is not a lazy chunk).

## The work, ranked by measured bytes × feasibility

### 1. Lazy-load pattern siteConfigs — ~450 kB raw, lowest risk ⭐
`patterns/index.js` statically imports all five siteConfigs, so **every page of every site downloads
the map editor (290,896 B) and the admin pattern (136,654 + 24,206 B)** whether or not the site uses
them. `resolvePatterns()` is *already declared `async`* and already returns a promise — so it can
`await import()` each pattern, and the caller can resolve only the `pattern_type`s the site's pattern
rows actually name (that list is in the site data before routes are built).

This also removes the biggest static importer of `maplibre-gl` (see 3).

### 2. Lazy-load section components from the ComponentRegistry — ~730 kB raw ⭐
`ComponentRegistry/index.jsx` eagerly imports 10 section types; `patterns/page/components` is
560,198 B and `ui/components/graph_new` another 172,357 B. A page with no graph, no map and no
spreadsheet still ships all three.

The `Foo.config.jsx` / `Foo.jsx` split this repo already follows makes this tractable: the **config
(metadata, controls, defaultState) must stay eager** — themes and the admin UI read it — while
`EditComp`/`ViewComp` become `React.lazy(() => import('./Foo'))` behind a `<Suspense>`. Start with the
three heaviest and least-universal: Map, Graph, Spreadsheet.

### 3. Make `maplibre-gl` load on demand — 278 kB over the wire
`ui/components/map/avl-map.jsx:1087` already does it right
(`import("maplibre-gl").then(m => setMaplibreModule(...))`). Nine other modules import it statically;
after (1) and (2) the remaining eager ones are
`patterns/page/.../ComponentRegistry/map/*` and `.../map/useComparisonSeriesLayers.js`. Same treatment.
(The themes' own map components — transportny routecreation/detour — already ride in lazy theme chunks.)

### 4. Split the editor surface from the view surface — ~630 kB raw across both chunks
Our `ui/components/lexical` is 230,674 B, and the lexical family + yjs + prismjs add ~388 kB to
vendor. **Caveat, verified:** view mode *does* mount lexical — `RichtextView`
(`ComponentRegistry/richtext/index.jsx:118`) renders through `UI.ColumnTypes.lexical` — so the core
cannot simply move to the edit path. What can: the toolbar and plugin set, **prismjs** (code
highlighting), **yjs/@lexical/yjs/lib0** (collaboration), and `@lexical/table`'s editing surface.
Needs a read-only renderer path that mounts core + nodes without the editor plugins.

### 5. Smaller, cleaner
- `ui/icons/icon_defs.jsx` (80,414 B) — every icon definition is eager.
- `dms-template/data-types/*/pages` (~90 kB) — ETL plugin *admin* pages, only reachable from datasets
  /admin routes; `data-types.js` could register them lazily.
- `patterns/datasets/pages` (270,020 B) + `datasets/components` (93,816 B) — route-level `React.lazy`
  inside the datasets siteConfig, same shape as (1).
- Remove the dead `lucide-react` dep (already flagged in the bundle-size log).

## Expected effect

(1) + (2) + (3) take roughly 1.0–1.2 MB raw (~300–350 kB over the wire) out of the initial graph.
At the Slow-4G rate Lighthouse simulates that is ~2.5–3 s off the `index` download alone, plus a
proportional cut to the 770 ms TBT, since the same bytes are what the main thread parses and executes.

## Watch out for

- **SSR.** `render/ssr2` server-renders pages; lazy components must not blank the server-rendered
  HTML (the bundle-size log flags exactly this as the reason maplibre was left eager). Verify with
  `DMS_SSR=1 npm run server:dev` that content still appears in the HTML source, as the theme-splitting
  work did.
- **Registry metadata must stay eager** — `controls`, `defaultState`, `name`, `type` are read to build
  the section editor UI before any component mounts.
- **Don't regress the lazy-theme work** — `src/themes/index.js`'s loader map and the
  `@carbon/icons-react` / `lucide-react` `manualChunks: undefined` rule exist so a site downloads only
  its own theme. Any new `manualChunks` entry must not sweep those into `vendor`.
- Measure after each step with the sourcemap attribution, and record it in the bundle-size log —
  the previous entries there are the reason this task could start from numbers instead of guesses.


## Implementation plan (2026-09-24)

**Baseline re-measured 2026-09-24** (same command, MNY env): `index` **2,627,377 B / 771.57 kB gzip**
(+85 kB since 09-22), `vendor` 1,049,855 B / 340.59 kB gzip, `maplibre` 1,053,430 B / 284.79 kB gzip.
Attribution unchanged in shape: page/components 560,614 · mapeditor 290,896 · datasets/pages 270,850 ·
lexical 230,642 · admin/pages **184,278** (was 136,654) · graph_new 172,444 · dms-template data-types ~115 kB.

### Refinement of item (1): split at the *page-component* level, not the siteConfig level
Code reading showed pattern-level laziness would save little on MNY:
- **The admin pattern is mounted on every site** — `pattern2routes` always prepends `AdminPattern`
  (`/list`), so `patterns/admin` can never be skipped by pattern type.
- **MNY has a datasets pattern** (`/cenrep`), so datasets can't be skipped by type either.
- **`page/siteConfig.jsx` imports `RegisterPlugin` from `mapeditor/MapEditor`** (the 1,232-line editor
  module) — so even a site with no mapeditor pattern pulls the editor through the page pattern.

Instead: every siteConfig stays eager (it only builds route config), and the *page components* it
mounts (`type:` entries) become lazy. That removes admin/auth/datasets/mapeditor pages from every page
view regardless of which pattern types a site has, and needs no change to the async route-building
machinery (`DmsSite` fast paths, SSR `buildRoutes`, `main.jsx` hydration order).

### The primitive: an SSR-safe `lazyComponent(id, load)` (`utils/lazyComponent.jsx`)
`React.lazy` alone would blank SSR (`renderToString` emits the Suspense fallback) and mismatch
hydration — the exact reason the 09-01 maplibre investigation stopped. The primitive avoids both:
- **Resolved ⇒ synchronous.** Once loaded, the `React.lazy` factory returns a *sync thenable*, so
  React's `lazyInitializer` marks it resolved before checking (verified in React 19.2.5 prod + dev
  builds) — no suspend, no fallback.
- **Server preloads everything.** `preloadAllLazyComponents()` (loops until no new ids register, so
  lazies defined inside lazy modules are covered) runs before `renderToString` → SSR HTML unchanged.
- **Server records what rendered.** `renderToString` is synchronous, so a collector set around it
  captures the ids that actually rendered; the middleware ships them as `__dmsSSRData.lazy`.
- **Client preloads those ids before `hydrateRoot`** (`main.jsx`, same place themes are awaited) →
  hydration renders synchronously and matches the server HTML.
- **SPA:** a `<Suspense>` inside the wrapper shows a fallback until the chunk lands; the page
  loader additionally preloads the section types on the page so the chunk fetch runs in parallel with
  data instead of after it (Phase 3).
- **Stale-chunk recovery:** a failed chunk load does the same one-shot `sessionStorage`-guarded
  reload the lazy theme loader does.

### Phases
- [x] **P0 — Baseline** re-measured (above); attribution script copied to the session scratchpad.
- [x] **P1 — Primitive + SSR plumbing** (2026-09-24; `tests/lazyComponent.test.js`, 6 passing — SSR fallback
  before preload, sync render after, nested registration, id collection, named preload, dedupe): `utils/lazyComponent.jsx`; `ssr2/handler.jsx` preload-all +
  collect; `middleware.mjs` payload `lazy`; `dms-template/src/main.jsx` preload before hydrate; export
  from the library index.
- [x] **P2 — Pattern page components lazy** (2026-09-24) — also: datasets data-type page registries point at
  shared lazy wrappers (`datasets/pages/dataTypes/lazyPages.js`); admin format's `PatternList`
  DisplayComp lazy (both sides of its `{EditComp, ViewComp}`). Eager JS 4,730,660 → 4,107,763 B raw
  (1,393,628 → 1,204,649 B gzip). MapEditor stayed eager until P3 (the page Map section imports it).: admin (SiteEdit, NewSite, ThemeList, ThemeEdit,
  PatternEditor), auth pages, datasets pages, mapeditor (MapEditor, MapViewer), page `PageEdit`.
  Move `PluginLibrary`/`RegisterPlugin`/`PLUGIN_TYPE` out of `MapEditor/index.jsx` into a tiny module
  (re-exported from `MapEditor` for BC). Measure.
- [x] **P3 — Section components lazy** (2026-09-24) — Map's `MapSection` (config + `controls` stay eager;
  `HEIGHT_OPTIONS`/`PANEL_POSITION_OPTIONS` moved to `map/constants.js` so settings don't import the
  section) and **`UI.Graph`** (`ui/components/graph_new/lazyGraph.js` — the Graph *section* is a thin
  wrapper; the 172 kB is the UI registry's graph). New optional registry key **`preload()`** +
  `preloadSectionComponents()`; the page pattern's loader `preload` hook now always runs and awaits the
  page's section chunks in parallel with the (still opt-in) section-data preload. Spreadsheet/Card left
  eager — their weight is dataWrapper/Table, which MNY pages need anyway. **maplibre left the eager graph
  as a side effect** (its only eager importers were the Map section + MapEditor): eager JS
  **2,525,726 B raw / 767,794 B gzip** (index 1,475,871 + vendor 1,049,855).: Map, Graph, Spreadsheet (+ any other non-universal type);
  configs (`controls`, `defaultState`, `name`, …) stay eager; page loader preloads the page's section
  types. Measure.
- [x] **P4 — maplibre + vendor bucket** (2026-09-24) — maplibre already left the eager graph in P3. `vendor`
  narrowed to the framework core (`VENDOR_CORE`: react, react-dom, scheduler, react-router, falcor*,
  avl-falcor, lodash-es); every other dep follows its importers. Eager **2,409,842 B / 733,383 B gzip**
  (vendor 407,244 + index 2,002,598 — index grew because eagerly-used deps now live there). d3/colorbrewer
  moved to the graph chunk. SPA re-probed clean. Original line:: cut remaining static `maplibre-gl` importers from the eager
  graph; narrow the `manualChunks` catch-all `vendor` bucket so deps used only by lazy chunks (d3 for
  graphs, etc.) stop being force-merged into eager `vendor` (the exceljs trap, generalised). Measure.
- [x] **P5 — Editor surface, tier (a)** (2026-09-24) — code-split only what a read-only editor *never mounts*:
  ToolbarPlugin (editable only), collaboration (new `editor/CollabPlugin.tsx` wraps CollaborationPlugin +
  `createCollabProvider` → yjs/y-protocols/@lexical/yjs/sync-manager), and the flag-gated Autocomplete /
  Actions / TreeView (@lexical/devtools-core) plugins; `sectionArray` joins the page-structure room via
  `import()` (only runs when `__dmsSyncAPI` exists). Eager **2,195,195 B / 663,489 B gzip**.
  **Zero rendered-output change, verified:** DOM diff (normalised `#root` + every rich-text instance) of 14
  MNY pages, pre-task baseline build vs P5 build → 14/14 identical (301 lexical instances). Edit mode
  verified in a no-backend harness page (toolbar loads lazily, typing fires onChange, no errors).
  - [ ] **tier (b), NOT done — needs an owner decision:** ComponentPicker, EmojiPicker, DragDropPaste,
    SpeechToText, History, TabFocus/TabIndentation, DraggableBlock, FloatingLinkEditor, FloatingTextFormat,
    TableHoverActions all mount in *view* mode today (the floating ones portal invisible DOM into the
    editor, and DraggableBlock leaves a `draggable` handle). Gating them behind `editable` is ~40–50 kB
    raw (~12–15 kB gzip) + the per-page `emoji-list` request, but it IS a DOM/behaviour change to a
    shared primitive — ask first. prismjs (56 kB) stays eager with CodeHighlightPlugin, which does affect
    view rendering of code blocks; a lazy highlighter mounted only when the document has a code node
    would move it out without a DOM change.
- [x] **P6 — Smaller** (item 5), partly (2026-09-24): **every `dms-template/data-types/*/pages` registry** (15
  files) now lazy-loads its page components (`Create`, now_playing's `Webhook`) — the registries are eager
  for every site via `src/data-types.js`, so MNY was shipping npmrds/work_zone/OSM create pages. ~100 kB
  → 2.6 kB eager. Convention added to `data-types/CLAUDE.md` ("Adding a new plugin" step 4). Eager
  **2,087,562 B / 636,077 B gzip**. Not done: `icon_defs` (lazy icons would pop in / differ under SSR —
  needs a subsetting design, not a lazy wrapper) and the `lucide-react` removal (a dependency/lockfile
  change with zero `dist` effect — left to the owner).
- [x] **Verify** (2026-09-24) — see the progress log. SSR was verified through the library's own
  `mountSSR` dev path in a standalone Express process, **not** a second `DMS_SSR=1` dms-server: that
  would also start task polling / stalled-task recovery / schedule sweeps against the shared DBs.
- [x] **Log** — `planning/shared/bundle-size-log.md` 2026-09-24 entry (per-step table).

### Files changed
- **New:** `utils/lazyComponent.js`; `patterns/mapeditor/MapEditor/pluginRegistry.js`;
  `patterns/datasets/pages/dataTypes/lazyPages.js`; `…/ComponentRegistry/map/constants.js`;
  `ui/components/graph_new/lazyGraph.js`; `ui/components/lexical/editor/CollabPlugin.tsx`;
  `tests/lazyComponent.test.js`.
- **Library:** `index.js` (exports `lazyComponent`, `preloadLazyComponents`); `render/ssr2/handler.jsx`
  (preload + collect; `window.URL` on the stub); `render/ssr2/express/middleware.mjs` (`lazy` payload);
  `patterns/{admin,auth,datasets,mapeditor,page}/siteConfig.jsx`; `patterns/admin/admin.format.js`;
  `patterns/datasets/pages/SourcePage.jsx` + `dataTypes/{csv_dataset,gis_dataset,internal_table,
  file_upload}/index.js` + `defaultPages.js`; `patterns/mapeditor/MapEditor/index.jsx` (re-exports the
  registry); `…/sections/componentRegistry.js` (`preloadSectionComponents`); `…/sections/sectionArray.jsx`;
  `…/ComponentRegistry/map/{config.jsx,index.jsx,settings/more.jsx}`; `…/ComponentRegistry/graph_new/
  config.jsx`; `api/preloadSectionData.js` (`findPageItem`, `pageSectionTypes`); `ui/index.js`;
  `ui/components/lexical/editor/editor.tsx`.
- **dms-template:** `src/main.jsx`; `vite.config.js` (`VENDOR_CORE`); 15 × `data-types/*/pages/index.js(x)`;
  `data-types/CLAUDE.md`.

### Remaining (optional follow-ups, not started) — detailed 2026-09-24
Raw bytes from the final build's sourcemap; gzip ≈ 30% of raw for our code (the eager index's ratio).

0. **TransportNY gets none of these wins until its `vite.config.js` changes** (highest value). Its
   `manualChunks` sends every id containing `dms` to one `dms` chunk and every `node_modules` id to
   `vendor`. That re-merges every lazy split into two eager chunks. Fix = drop the `dms` bucket and use
   a `VENDOR_CORE`-style `vendor`. It's TransportNY's own config file (not a synced copy), so it's edited
   in `transportNY/`; verify with the same eager-graph measurement.
1. **Lexical view-mounted plugins — two parts, not one.**
   - **1a, DOM-neutral (~21 kB raw / ~6 kB gzip):** ComponentPicker, EmojiPicker (also triggers the
     per-page `emoji-list` fetch), TableCellResizer, TableHoverActions, SpeechToText, DragDropPaste,
     TabFocus. In read-only mode each renders nothing. The typeahead menus need typing, and the other
     two already return `null` when not editable. Wrap them in `editable && …` + lazy-load. The DOM diff
     should stay identical, so this doesn't need a BC decision.
   - **1b, DOM-changing (~28 kB raw / ~8 kB gzip):** DraggableBlock (always portals an invisible
     `draggable` handle), FloatingLinkEditor (always portals its hidden editor), FloatingTextFormat
     (portals an empty div on text selection), plus the ColorPicker/DropDown they share with the
     toolbar. Gating these removes invisible elements from view mode. **Owner decision.**
   - `InlineImageComponent.tsx` also imports FloatingLinkEditor + FloatingTextFormat, so those two only
     leave the eager graph if that import is handled too.
2. **prismjs (56 kB raw + `@lexical/code` 16 kB ≈ 22 kB gzip) — harder than first noted.**
   `@lexical/code` 0.39 imports `prismjs` and 8 language grammars at module top, and `CodeNode` (required
   in `PlaygroundNodes` to deserialize any saved code block) comes from that same module. A lazy
   highlighter alone doesn't cut the import. Options: a later lexical that separates the Prism highlighter
   from the node (unconfirmed); a local CodeNode not taken from `@lexical/code`; or dropping CodeNode (non-BC
   for any saved code block).
3. **Section menu + editors (~83 kB raw / ~25 kB gzip).** `section.jsx` calls `getSectionMenuItems(...)`
   on every section render. In view mode the result only renders when `showEditIcons`
   (`editPageMode && onEdit`), so anonymous viewers build a menu they never see. Fix: move the call into a
   lazily-loaded `<SectionMenu>` rendered only under `showEditIcons` (and in edit mode). sectionMenu 31.9k
   carries ColumnManager 13.4k, ComplexFilters 9.1k, AddFormulaColumn 7.5k, ConditionValueInput 6.5k,
   TemplateManager 4.8k, controls_utils 3.5k, Add{Static,Calculated}Column 4.5k. Needs a check that
   nothing viewer-facing reads `sectionMenuItems`, plus a DOM diff.
4. **Graph config's eager d3 (~45 kB raw / ~13 kB gzip).** `graph_new/config.jsx` computes
   `DefaultPalette = getColorRange(20, "div7")` at module load and imports `SchemeOptions`/`ValueFormats`.
   That keeps d3-scale-chromatic 18.3k, d3-color 8.2k, d3-format 4.9k, d3-interpolate 3.3k, d3-scale
   2.7k and `graph_new/utils.js` 13k eager. Fix: compute lazily, and give the option lists a lightweight
   module or make them lazy inside `controls`.
5. **Map `controls` (~48 kB raw / ~14 kB gzip).** `map/settings/controls.jsx` 20.3k + symbology/filters
   settings ~7k, and through `settings/filters.jsx` MapEditor `stateUtils` 7k + `LayerManager/colors` 8.8k
   + `utils` 4.7k. The Map config's `controls: MapControls` is a function resolved in view mode too (the
   same `section.jsx` block as item 3). Extract `normalizeLayerClickFilterConfig` into a tiny module;
   defer `controls` resolution to where it's used.
6. **`icon_defs.jsx` (83 kB raw / ~25 kB gzip).** 99 icon exports, all eager; `ui/icons/index.jsx`
   re-registers ~104 names, and `UI.Icon` resolves by name from data/themes at render. Icons are
   visible in SSR HTML, so a naive lazy wrapper would pop in and change server output. Approach: record
   which names view pages actually render (crawl), keep those eager, move the rest (editor/admin/menu
   icons) to a lazy set that preloads with the edit surfaces.
7. **`lucide-react`** — declared in dms-template's root `package.json` (not the submodule's, as the log
   said). It's only imported by `themes/tessera/design_system_v2/theme/icons.js`, which no live tessera
   entry reaches. Removing it changes `package.json`/lockfile/`node_modules` only; zero `dist` effect.
9. **Page loader awaits section chunks** (added in P3) — `preload` in `patterns/page/siteConfig.jsx`
   awaits `preloadSectionComponents`, which puts one serial chunk fetch (e.g. the 70 kB graph chunk on
   MNY `/`) before the *whole* page renders, including a hero that doesn't need it. Kicking the
   preload off without awaiting (sections briefly show their Suspense fallback) would take that hop
   off LCP. Found during the 2026-09-24 Lighthouse diagnosis, see
   `../current/site-bootstrap-payload-and-pattern-lookup.md`.
8. **Pre-existing, found here (own tasks):**
   - **SSR portal failure on most MNY inner pages.** Most likely culprit: `ui/components/MultiSelect.jsx`
     compact mode portals its menu to `document.body` on *every* render (not only when open), guarded by
     `typeof document === 'undefined'`, which the linkedom stub defeats. Filter controls use compact mode,
     and `/` (no filters) SSRs fine. Fix: a real SSR/mounted flag instead of `typeof document` in the
     portal guards (MultiSelect, Popup, Modal, Dialog, Drawer).
   - **Dev-mode SSR "Invalid hook call".** The submodule's `package.json` lists `react`/`react-dom` under
     `dependencies`, so npm installs a nested copy under the `file:` link. Fix: move them to
     `peerDependencies` (+ `devDependencies` for the library's own tooling) and reinstall. This also
     affects any other consumer that installs the package.

## Progress log

- 2026-09-22 — Task created from a sourcemap attribution of a real MNY production build. No code
  changes yet.
- 2026-09-24 — Implementation started. Baseline re-measured (index 2,627,377 B / 771.57 kB gzip). Plan
  refined: page-component-level splits via an SSR-safe `lazyComponent` primitive instead of
  pattern-level siteConfig laziness (admin always mounted; MNY has datasets; page imports MapEditor).
- 2026-09-24 — P1 done: `utils/lazyComponent.js` + handler preload/collect + middleware `lazy` payload +
  `main.jsx` preload-before-hydrate; exported `lazyComponent`/`preloadLazyComponents` from the library index.
- 2026-09-24 — P2 + P3 done. Measured with a new eager-graph script (entry chunk + its static imports,
  recursively; `scratchpad/eager.mjs` in the session scratchpad): **4,730,660 B / 1,393,628 B gzip →
  2,525,726 B / 767,794 B gzip (−45% over the wire)**; maplibre (1,053,428 B) is no longer eager.
- 2026-09-24 — **Verified.** SPA (built `dist`, `vite preview`, Playwright): home/login/admin render; a
  37-page nav crawl loads maplibre + map chunks only on the 2 pages with maps, graph chunk only where
  graphs are; no new console errors. SSR (library `mountSSR` dev path on a spare port, prod API):
  `/`, `/list`, `/cenrep`, `/auth/login`, `/auth/signup` render full content inside *completed*
  Suspense boundaries, `__dmsSSRData.lazy` lists the right ids, **zero new hydration messages** (the only
  one — login/signup attribute mismatch — is `AuthLayout`'s random `imgI` background, pre-existing).
  Tests: 490 pass; 3 fail in files this task didn't touch (`avlGraphThemeDefaults` golden vs
  `graph_new/theme.js`; `syncDeltaConvergence` ×2).
- 2026-09-24 — **Gotcha fixed:** maplibre runs `window.URL.createObjectURL(...)` at import time whenever
  `window` exists. Eagerly it evaluated *before* `handler.jsx` installed its `window` stub; lazily it
  evaluates after → crash. Fix: the stub now carries Node's `URL`. Lesson for any future split: a
  module with import-time `typeof window` behaviour changes behaviour on the SSR server once it's lazy.
- 2026-09-24 — **Pre-existing, NOT caused by this task (separate follow-up):** (a) dev-mode SSR in this
  checkout crashes on every route with "Invalid hook call" — the dms submodule's deps are installed
  nested (npm `file:` link), incl. its own `react` 19.2.7 vs root 19.2.5, and `use-immer`/`@lexical/react`
  resolve the nested copy. Worked around for verification with a scratch Node resolve hook, no repo
  change. (b) Most MNY inner pages fail SSR with "Portals are not currently supported by the server
  renderer" and fall back to the SPA shell — reproduced identically with the Map section restored to its
  pre-split static import. Cause: portal guards test `typeof document`, which the linkedom stub makes
  true on the server (same trap `ssr-runtime-theme-css-fouc.md` hit).
- 2026-09-24 — P5 tier (a) + P6 (data types) done. Final eager graph **2,087,562 B / 636,077 B gzip**.
  Final checks on the finished code: DOM diff baseline vs final (14/14 identical); SSR `/`, `/cenrep`,
  `/list` clean; logged-in datasets list → source → table → create (read-only navigation, no errors);
  dms tests 490 pass / same 3 pre-existing failures; lint clean on every added line.
- 2026-09-24 — **Throttled result** (real Slow 4G + 4× CPU via CDP, cold cache, MNY `/`, 2 runs each):
  FCP/LCP **13.5 s → 10.2 s**; JS over the wire 1,461,044 → 778,747 B; TBT ~2.05 s → ~1.98 s (unchanged —
  main-thread time is work the page needs anyway). The remaining gap after JS is the data waterfall
  (`site-bootstrap-payload-and-pattern-lookup.md`).
- 2026-09-24 — **Closed by owner** ("close this task for now and I will come back to it based on the results
  of the page loading task"). Archived to `tasks/completed/`; follow-ups 0–8 stay listed here, with a deferred
  pointer in `todo.md`.
