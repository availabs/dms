# Boot chain — fewer serial hops before first render

> Opened 2026-09-24 from the render-delay analysis in
> [`site-bootstrap-payload-and-pattern-lookup.md`](./site-bootstrap-payload-and-pattern-lookup.md)
> ("Render-delay chain on `/`"). Owner asked to implement options 1–4 from that list.

**STATUS: IMPLEMENTED + VERIFIED 2026-09-24 — not committed/deployed (owner).** Real-throttle hero render
**−420 ms desktop-like / −1.44 s mobile-like**; boot chain 9 → 4 serial hops after the JS. Lighthouse's
simulated LCP did not move — see *Why Lighthouse didn't move* below.

## Objective

On MitigateNY `/`, once the hero image is fixed, LCP is almost all *render delay*: 2.6 s desktop /
14 s mobile (Lighthouse). That is the app walking **9 serial network hops** after the JS arrives, plus
CPU on the same path. Four of those hops are serial only because of how the data loader is written.
Cut the artificial hops and the avoidable critical-path CPU without changing what any page renders.

## Scope — options 1–4

1. **Batch dms-format ref expansion.** `api/proecessNewData.js` `loadDmsFormats` runs
   `for (const key of dmsKeys) { … await falcor.get(…) }` — one round trip per dms-format attribute,
   in series, though every key's ref ids are already on the row. Issue one `falcor.get` for all keys
   of an item; run sub-format recursion in parallel (still *before* the parent assignment, which the
   current code relies on); expand the active items of `processNewData` in parallel instead of one
   by one. Site boot 4 → 2 hops (row, then `dms_envs` + `patterns` + `theme_refs` together); page
   3 → 2 (list, then `draft_sections` + `sections` together). Same output shape.
2. **Don't await section chunks in the page loader.** The P3 bundle-split `preload` hook awaits
   `preloadSectionComponents`, putting one chunk fetch (MNY `/`: the 70 kB graph chunk) in front of
   the whole page render. Start it, don't await it. Trade-off: a lazy section can show its (empty)
   Suspense fallback for the chunk's download time on SPA navigation.
3. **`modulepreload` the site's theme chunk(s).** The theme chunk waits for the pattern rows (to learn
   the theme name). A per-site build knows its themes: new build-time `VITE_DMS_PRELOAD_THEMES`
   (comma list of theme loader names) → a Vite plugin injects `<link rel="modulepreload">` for those
   theme chunks (+ their static imports) into `index.html`, so they download with the main JS.
   `deploy-mnyprod` sets `mnyv1,mny_admin`. dms-template change (`vite.config.js`, `package.json`).
4. **Merge each theme once per route build.** `getPatternTheme` (`ui/useTheme.js`) computes
   `mergeTheme(defaultTheme, themes[selection])` for every pattern — 110× on MNY for ~3 distinct
   themes; `mergeTheme` deep-clones at every level. Cache that base merge per theme registry object
   (one `pattern2routes` run) + selection; the per-pattern merge still returns a fresh object.

Out of scope: options 5–7 (inlined boot data, server-side expansion, prerender).

## Baseline (the code at the end of `bundle-split-initial-graph.md`, = current `dist`)

Observed request order on `/` (unthrottled): JS → site row @287 → `dms_envs` @341 → `patterns` @351 →
`theme_refs` @409 → theme chunks @427 → (route build ~180 ms) → page list @656 → `draft_sections` @812 →
`sections` @849 → graph chunk @877 → (render) → hero image @1058 ms.
Lighthouse (hero swapped to WebP so LCP isolates render delay): desktop LCP 2.7 s, render delay 2,608 ms.

## Plan

- [x] P0 — Baseline (real CDP throttling, cold cache, hero swapped to WebP bytes so LCP measures render;
      median of 3; harness `scratchpad/bootchain.mjs` in the session scratchpad):
      unthrottled hero request @920 ms / LCP 1,272 ms · desktop-like (40 ms, 10 Mbps) @2,201 / 3,772 ms ·
      mobile-like (150 ms, 1.6 Mbps, 4× CPU) @9,199 / 10,212 ms.
- [x] P1 — Batch ref expansion. `loadDmsFormats` collects every key's paths into one `falcor.get`; sub-format
      recursion runs concurrently (each row once) before assignment; a row referenced under two keys gets
      its own copy (separate gets used to give it one); `processNewData` expands active items concurrently.
      `tests/processNewDataBatching.test.js` (3) — old code would make 4 gets where this makes 2.
- [x] P2 — Non-blocking section-chunk preload (`patterns/page/siteConfig.jsx`).
- [x] P3 — `themeModulePreload` plugin in `vite.config.js` (reads `src/themes/index.js`'s loader map; skips
      chunks the entry already imports); `deploy-mnyprod` sets `VITE_DMS_PRELOAD_THEMES=mnyv1,mny_admin`.
- [x] P4 — `getBaseTheme` WeakMap cache in `ui/useTheme.js`. `tests/patternThemeCache.test.js` (4): output
      equals the pre-cache code for 5 pattern shapes, results independent, layout options copied, new
      registry recomputes.
- [x] Verify (2026-09-24):
      - **Real throttling** (same harness as P0, median of 3):

        | profile | hero request: before → after | LCP: before → after |
        |---|---|---|
        | unthrottled | 920 → 863 ms | 1,272 → 1,220 ms |
        | desktop-like (40 ms, 10 Mbps) | 2,201 → **1,781 ms** | 3,772 → **3,356 ms** |
        | mobile-like (150 ms, 1.6 Mbps, 4× CPU) | 9,199 → **7,758 ms** | 10,212 → **8,752 ms** |

        Chain now: JS + both theme chunks together → site row → site refs (one request) → page list →
        sections (one request) → hero. (Mobile: the site row starts ~300 ms later because the preloaded
        theme bytes share the pipe with the main JS; the theme hop it removes is worth more.)
      - **DOM diff** 14 MNY pages vs baseline build: 14/14 identical (301 rich-text instances).
      - **SPA crawl** 37 pages: canvas/svg/table counts identical to the baseline crawl.
      - **Logged-in datasets** list → source → table → create: no errors; source-page links identical to
        baseline (re-checked twice each after a one-off mid-render count).
      - **SSR** `/`, `/list`, `/cenrep`: same HTML size as before (`/` 67,149 B root), completed boundaries,
        0 render errors, 0 hydration messages.
      - **Tests** 497 pass; the same 3 pre-existing failures (`avlGraphThemeDefaults`, `syncDeltaConvergence` ×2).
      - **Lighthouse** (hero-swapped copies, 2 runs each): desktop LCP 2.7 → 2.8 s, mobile 15.3–15.5 → 15.3 s —
        flat, see below.

## Why Lighthouse didn't move

Lighthouse *simulates* throttling from an unthrottled trace. On MNY `/` its LCP estimate is bound by
**bandwidth**, not by round trips: **2.78 MB** of requests start before LCP (scripts 830 kB, **images
1,479 kB**, fonts 170 kB, CSS 156 kB), which at 1.6 Mbps is 13.6 s of the simulated 15.3 s. Removing
serial hops doesn't change that byte total, so the simulation can't credit it; real throttling does,
because there each round trip really waits. **The next Lighthouse lever is bytes before LCP:** four
hazard illustrations in `themes/images/` (Hurricane 428 kB, Snowstorm 324 kB, Ice Storm 157 kB, Flooding
100 kB — 1,010 kB) are offscreen on mobile and ~95% oversized for their display size on both presets
(Lighthouse `offscreen-images` / `uses-responsive-images`). Then fonts/CSS (`font-awesome all.min.css`).

## Files

- `src/dms/packages/dms/src/api/proecessNewData.js` (P1)
- `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` (P2)
- `dms-template/vite.config.js`, `dms-template/package.json` (P3)
- `src/dms/packages/dms/src/ui/useTheme.js` (P4)
- tests: `src/dms/packages/dms/tests/`

## Progress log

- 2026-09-24 — Task created.
- 2026-09-24 — P0–P4 implemented; unit tests green. Verification next.
- 2026-09-24 — Verified (see Verify). Real-throttle gains as expected; Lighthouse flat because its LCP
  estimate on `/` is bandwidth-bound (2.78 MB before LCP, 1.48 MB of it images). Plugin fix during
  verification: the theme chunk is found by the chunk that *contains* the theme module — the bundler merged
  `mny/theme.js` into a chunk shared with `mny/admin.theme.js`, so facade lookup missed `mnyv1`.
