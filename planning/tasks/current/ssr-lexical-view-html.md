# SSR: rich-text (Lexical) sections render empty in server HTML

**Initiatives:** [dms_page_load_performance](../../../../../planning/initiatives/dms_page_load_performance.md) · **Status:** built · **Release:** commit — `a0fb4047` has the first pass; the managed-line-break change and the MitigateNY sweep fixes (below) are uncommitted · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

A page served over SSR should arrive with its rich text in the HTML. Today every Lexical section reaches the
browser as an empty `<div contentEditable="false" role="textbox"></div>`, and its text only appears after the JS
loads, hydrates and mounts a live editor. That loses most of SSR's value for LCP and crawlers on content pages.

## Found

2026-11-16, on the hub (`.env-hub`, `localhost:5555`, dev-mode SSR), avail homepage (`hub` / `availabs` pattern
2931003, page 2931016):

- `GET /` returns the nav plus all 43 section wrappers, but the visible text in `#root` is only the nav links.
- The page's 43 published sections are all `lexical`; their content is in the router's hydration data
  (~175 KB), so it reaches the browser as JSON only.
- `preload_data: true` on the pattern is unrelated. It only preloads data-wrapper sections (Spreadsheet, Card,
  Graph), and this page has none.

## Cause

`LexicalView` (`ui/components/lexical/index.jsx`) mounts the real editor read-only. Lexical writes the DOM
from the client (the root element is attached in a ref callback), so `renderToString` emits an empty
content-editable. The HTML view that preceded it (`getHtml` in an effect, then a sync `getHtmlSync` version) was
commented out by `12a214bb` "temp lexical fix" (2026-02-06); the reason isn't recorded. Likely fidelity: the
exported HTML differs from the live editor (decorators such as buttons export as unstyled `<a>`), and buttons
with `setParam` actions / collapsibles need the live editor's handlers.

Feasibility check (scratchpad script, Vite `ssrLoadModule` + linkedom): `getHtmlSync` rendered 36 of the 43
homepage sections to real HTML (headings, styled paragraphs, buttons, layouts, images); the rest are probably
empty spacers.

## Approach: static first, live after hydration

In view mode (not editable, not collab), `Lexicals` (`editor/index.tsx`) renders in two steps:

1. **Static view** — the same wrapper divs and classes the live view renders
   (`editorShell` › `editorViewContainer` (bg) › `viewScroller` › `editor.base` › `contentEditable`), with the
   content as `dangerouslySetInnerHTML`:
   - **server** (`import.meta.env.SSR`): `getHtmlSync(value, …, { nestedTheme, dmsTheme })` with the exact
     nested theme the live editor uses (brand text styles, Icons), so classes match;
   - **client**: `__html: ''` with `suppressHydrationWarning`. React never patches `dangerouslySetInnerHTML` on
     hydration, so the server's HTML stays in place, and the client never pays for generating HTML.
2. **Live editor** — a layout effect flips to the existing editor right after mount/hydration (before paint), so
   button actions, navigation and collapsibles behave as today. On client-side navigation the static step is
   never painted.

**Buttons:** a view-only HTML export override for `ButtonNode` emits a `<button>` with the theme's resolved button
class (same lookup as `ButtonComponent`: `resolveButtonStyleName` + `getComponentTheme`) inside the node's
`createDOM` wrapper, so the swap doesn't shift the layout. The library's default `htmlConfig` (PDF/HTML export,
`lexicalToHtml`) is unchanged.

**Later (not this task):** keep the static HTML for sections with no interactive nodes and skip mounting an
editor at all (TBT/INP win); button icons in the static HTML.

## Files — DONE

- [x] `ui/components/lexical/editor/createHeadlessEditor.js` — accepts a prebuilt `nestedTheme` and an `html` config
- [x] `ui/components/lexical/ssr.ts` — `getHtmlSync(state, flatTheme, icons, opts)`; `opts.nestedTheme` / `opts.dmsTheme`
  switch to the view export. Without opts (`lexicalToHtml`, chat, PDF) nothing changes.
- [x] `ui/components/lexical/editor/viewHtmlConfig.js` (new) — `htmlConfig` + themed `ButtonNode` export + the managed
  line break; from the MitigateNY sweep: `InlineImageNode` in the live markup (wrapper + `width/height: inherit`, the
  wrapper a `<span>` because parsed HTML can't hold a `<div>` in a `<p>`), and `IconNode` as an empty `<svg>` with the
  live icon's size classes (icons are React components, which can't render inside the server render); an image's
  **caption** (its own nested editor) under the image, in the live caption container and root classes with the
  parent's theme, block elements as `display: block` spans for the same `<p>` reason; **tables** in the theme's
  `tableScrollableWrapper` (the live TablePlugin runs with `hasHorizontalScroll`; Lexical's export strips the wrapper),
  so a wide table no longer widens its column, and **table cells** with their live inline style instead of the
  export's round-trip one (black 1px border, 75px width, `text-align: start`, grey header background)
- [x] `ui/components/lexical/editor/index.tsx` — static-first view mode (`staticFirst`, `live`, layout-effect swap); the
  static root carries Lexical's root style (`white-space: pre-wrap; word-break: break-word`), without which a long word
  widened a card column
- [x] `ui/components/MultiSelect.jsx` — (separate bug, found by the sweep) the compact menu was portaled to
  `document.body` whenever `document` existed; SSR defines a linkedom `document`, so every page with a multiselect
  filter threw "Portals are not currently supported by the server renderer" and fell back to the empty SPA shell. Now
  portals only after mount (server and first client render both leave it out)
- [x] `ui/components/lexical/editor/nodes/ButtonNode.tsx` — `resolveButtonStyleName` exported
- [x] `ui/components/lexical/editor/nodes/LayoutContainerNode.ts` — `exportDOM` now uses `createDOM` (template columns
  + the theme's `layoutContainer`), falling back to `grid gap-[10px]` with no theme class. This also changes PDF/HTML
  export, to match the page; import still keys on `data-lexical-layout-container`. It also carries the node's
  alignment (`text-align`), as the reconciler sets it live
- [x] `ui/components/lexical/editor/nodes/LayoutItemNode.ts` — `exportDOM` uses the theme's `layoutItem` class
  (MitigateNY: `px-2 py-4 …`; the old fixed `min-w-0 max-w-full` stays the fallback) and the node's alignment: a row
  of buttons in columns was 36 px static, 68 px live. `createDOM` no longer adds a stray `false` class when not editable
- `render/ssr2/handler.jsx` — not needed: the existing linkedom `document` is enough at render time.

**Design notes (found while matching static to live):**
- `LayoutContainerNode.exportDOM` hard-coded `grid gap-[10px]`; the live editor uses the theme's class (`gap-4 mt-2`
  on avail) — an 8 px shift per layout row.
- The live editor appends a **managed `<br>`** to any element whose last child is a line break or an inline decorator
  (Lexical reconciler, `setManagedLineBreak`). `$generateHtmlFromNodes` doesn't, so a paragraph ending in a button
  was 27 px shorter. The view export returns `[node, <br>]` as a fragment for those nodes.
- The static view never generates HTML in the browser: `__html: ''` + `suppressHydrationWarning`, and React keeps
  the server's HTML. Generation is gated on `import.meta.env.SSR`.

## Testing Checklist

Verified 2026-11-16 on the hub (`localhost:5555`, dev-mode SSR, logged out, headless Chrome via Playwright):

- [x] hub `/`: server HTML contains the homepage's rich text (4,070 chars of text in `#root`, was 124: nav only)
- [x] hub `/`: the 42 buttons in server HTML carry the theme's button class; brand text styles (`data-style-key`)
  resolve to their classes
- [x] no hydration errors logged out; 43 live editors mounted after hydration, no static views left
- [x] page height identical before JS (static) and after (live): 4,819 px; every section's height matches except
  the footer logo (see Follow-ups)
- [x] a Lexical button ("See our work") navigates client-side (no full load) after hydration
- [x] client-side navigation to `/platform` renders rich text in live editors, no errors
- [x] client + SSR builds succeed (built to scratchpad)
- [ ] collapsibles toggle after hydration — no collapsible on the tested pages
- [ ] `setParam` buttons after hydration — none on the tested pages
- [ ] edit mode unchanged — code path is gated on `!editable && !isCollab`; not checked live
- [ ] logged in: still fails hydration, but in the nav's user menu — the pre-existing issue in
  [ssr-logged-in-render-and-stale-cache.md](./ssr-logged-in-render-and-stale-cache.md) #1, not this change

### MitigateNY sweep (2026-11-17, `mny.localhost:5555`, pattern `MitigateNY_2025` 985070, logged out)

- 159 published pages. Before the MultiSelect fix most of them came back as the empty SPA shell; after it all 159
  server-render.
- **Only 7 are visible logged out on the hub** (the rest are `no-access` stubs in the server's page list), and SSR
  has no login (ssr-logged-in-render-and-stale-cache.md), so those 7 are all that can be compared: home, assess_risk,
  know_the_environment, plan_to_act, explore_progress, county_risk_profiles, pdf_cover.
- Result, static (JS blocked) vs live (hydrated, all editors live, images loaded): **every rich-text block matches in
  width, height and text** (80 blocks; pdf_cover has none), page heights identical, no hydration errors. Before the
  sweep fixes: heading icons +23 px (2 pages), image cards up to +125 px, a card column 15 px wider.
- Not rich text, recorded here so it isn't lost:
  - A page the visitor can't see (e.g. `/assess_risk/natural_hazards/extreme_heat` logged out) server-renders a
    *different* page ("Know the Environment") with status 200, then the client redirects to sign-in.
  - county_risk_profiles: the first server render took >30 s and the connection dropped (data preload); a retry worked.
    Its Card section 1395329 renders one row ("Extra Info") from the server's preload, but none on the client.
- Scripts: scratchpad `lexssr/sweep.mjs` (per-block diff + full-page screenshots), `cmp.mjs`, `mc.mjs`.

### Full MitigateNY sweep on a production build (2026-11-17)

After the auth fix (auth-field-read-row-shape.md) every page is readable logged out, so all 159 could be compared.
Dev-mode SSR was too slow under two parallel browsers (most pages timed out), so the hub was built
(`build_ssr.mjs --env .env-hub`, `VITE_API_HOST=http://api.localhost:5557`) and served on 5557 with
`NODE_ENV=production`; the pages that still differed were rechecked on 5555 (dev) after each fix.

- 146 of 159 pages compared, **0 hydration errors**. 13 not compared: every `…/risk_profile` page (12) and
  `built_environment/buildings`. Their server render took over 30 s **in production mode too** (`REQUEST_TIMEOUT`),
  so the browser got an empty response. Fixed below (*Risk profiles timed out*); all 20 risk-profile pages
  then compared on 5555: 0 hydration errors, every block matching (the 2 sweep differences were the caption
  `innerText` quirk and an image still loading).
- Before this round's fixes: 1,799 of 1,822 blocks matched. Fixed: captions (above), layout item padding (36 vs
  68 px), tables (a page's text column 549 vs 498 px wide, cell heights).
- What remains is not a static-HTML gap:
  - ~~**"Icon not found"**~~ — fixed below (*Missing snowstorm icon*).
  - Empty captions show the editor's **"Enter a caption..."** placeholder live, in view mode.
  - Blocks where live is shorter in the sweep were measured before the live editor's images loaded; with a
    longer wait they equal static (the image-swap follow-up below).
- Live JS errors seen in passing: React #185 (max update depth) on `explore_progress/resources/glossary`;
  "Cannot read properties of undefined (reading 'app')" on `actions_database_acquisitions_example` and
  `community_lifelines`.

### Missing snowstorm icon (fixed 2026-11-17)

9 rich-text blocks on 7 MitigateNY pages (snowstorm, snowstorm/mitigation_strategy, ice_storm, extreme_cold,
extreme_cold/mitigation_strategy, presidentially_declared_disasters, dr_4694) showed **"Icon not found"** to
visitors. Their icon nodes name `SnowStorm`, the spelling of the library's old icon set (`ui/icons2.jsx`,
`b3adc0b8`, since removed); the mny theme registers `Snowstorm` / `snowstorm`, and `IconNode.decorate` looks names
up exactly. No other name from the old set is missing from the theme.

- [x] `src/themes/mny/icons.jsx` (app repo) — `SnowStorm` added as an alias of `WindySnow`, beside the other
  hazard aliases. Verified on 5555: 0 "Icon not found" on all 7 pages, the icons draw.

### Risk profiles timed out (fixed 2026-11-17)

Every `…/risk_profile` page (and `built_environment/buildings`) took ~30 s to server-render, dev and production,
and hit dms-server's 30 s `REQUEST_TIMEOUT`: the visitor got an empty response.

**Cause.** The pattern has `preload_data: true`, so the page loader fetches every data section's rows before the
first render, and the render waits for the slowest. On lightning's risk profile three sections take 20–28 s
each: a Card and two Spreadsheets aggregating the AVAIL BILD 2026 buildings view (`hazmit_dama` view 2354),
grouped by county/place under a `CASE WHEN owner_type …` filter. The rest take < 3.5 s. The loader also preloaded
`draft_sections` on the view route, a second set of fetches nobody sees there.

**Fix** (`api/preloadSectionData.js`, `patterns/page/siteConfig.jsx`):
- [x] A per-section **preload budget** (`PRELOAD_BUDGET_MS`, 5 s; `opts.budgetMs`). A section still loading at
  the deadline renders without preloaded rows, exactly as with `preload_data` off (its saved rows, then its own
  fetch), and the page doesn't wait for it; a `[preload] … over 5000ms` warning names the section.
- [x] `draft_sections` preload only on the edit route (`opts.drafts`, from the `edit/` prefix).
- [x] The dev `[preload]` timing line names the section id.
- Result on 5555 (dev): all 20 pages 200 in 4–7 s (were cut at 30 s).

**The slow queries, fixed at the source (2026-11-17):** an expression index on the BILD table for the section's
`CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END`, added through the new source Indexes feature
([setindex-composite-covering-indexes.md](./setindex-composite-covering-indexes.md)). The query went from a 7.5 s
seq scan (~38 GB read) to ~190 ms (bitmap index scan, 24,881 rows). On 5555 the lightning risk profile now
server-renders in 3–4 s with every section preloaded (slowest 1.6 s, no budget warnings).

**Not fixed here:** these pages' HTML is 10–15 MB (the router's hydration data), worth its own look.

## Follow-ups

- **Images collapse briefly at the swap.** The live editor's `InlineImageNode` loads lazily, so right after hydration
  an image the server HTML already showed is gone until it loads again (the footer logo: 240 → 75 → 240 px). Fix by
  keeping static HTML for sections with no interactive nodes, or by making the live image render synchronously when
  the browser already has it.
- **Keep static HTML where nothing is interactive** (no buttons with actions, collapsibles): skip mounting an editor at
  all. That is the TBT/INP win; today every section still mounts an editor right after hydration.
- Button icons aren't in the static HTML (the `Icon` component is React). Lexical icon nodes reserve their box (empty
  `<svg>`) so nothing moves, but the icon only draws after hydration; buttons could do the same.
