# Shrink the initial JS graph — split by pattern, section type, and editor surface

> Opened 2026-09-22. Owner's Lighthouse run on a built MNY `dist` (FCP 1.8 s, LCP 5.9 s, TBT 770 ms)
> showed that once the network is throttled, **JS transfer dominates** — see the 2026-09-22 entry in
> [`planning/shared/bundle-size-log.md`](../../../../planning/shared/bundle-size-log.md) and the
> throttled trace in [`site-bootstrap-payload-and-pattern-lookup.md`](./site-bootstrap-payload-and-pattern-lookup.md).
> The data-layer work in that task took `/cenrep` from 1,350,149 B to 453,318 B; this task is about
> the 1.47 MB of JS that arrives before any of it matters.

**STATUS: MEASURED, not started.** Attribution below is from a real sourcemap analysis, not a guess.

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

## Progress log

- 2026-09-22 — Task created from a sourcemap attribution of a real MNY production build. No code
  changes yet.
