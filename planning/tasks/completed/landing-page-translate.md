# Task: Translate the TransportNY landing page into the `landing` pattern (live DMS page)

**Topic:** patterns/page (content-page build via CLI) + themes (transportny)
**Status:** ✅ DONE 2026-06-03 — full page built as draft sections in the `landing`
pattern (page 2173051) and verified live; skill notes rolled into the skill.

## Outcome (2026-06-03)
Built **everything as sections** (user decision) into the existing **"Landing" page
2173051**, theme `transportnyv2` (user set the pattern theme). Seed script:
`scripts/seed-landing-page.mjs` (5 bands, 18 sections, draft-only).

| Band | position / layoutGroup theme | Sections |
|---|---|---|
| Top nav | top / `header` | 1 — brand + nav links + Sign-in/Get-started (lexical layout-container) |
| Hero | content / `hero` (tny-hero-topo) | hero-copy (size 8: kicker + displayHero h1 w/ amber period + proseLG + 2 CTAs + status row) + hero-stat (size 4, `border:full` card) |
| Products | content / `content` (#ECEEF2) | intro (size 12) + 5 cards (`border:full`; 4/4/4 then 6/6) |
| For whom | content / `content_tint` (#E4E8EE) | for-whom (size 7, **rowspan 3**) + 3 audience cards (size 5, `border:full`) |
| Footer | bottom / `footer` | brand(4) + products(2) + resources(2) + status(4) + colophon(12, hr) |

**Token mapping (transportnyv2 — strong coverage):** `kicker` (amber `// nn`), `displayHero`
(hero h1), `displayLG` (38px uppercase section headings — exact), `proseLG`/`prose`/`proseSM`
(body), `metaSM`/`metaXS` (mono meta), `displayXS` (card titles); buttons `default` (navy
press) / `secondary` (outline) / `plain`. Card chrome = `border:'full'` (rounded+border+bg+shadow).

**Verified live:** `http://localhost:5173/edit/landing` (see preview-routing note below),
full-page shot at `scratchpad/npmrdsv5-dev2/transcribe/landing_fullpage.png` — matches the
mockup across all five bands.

**Remaining minor fidelity gaps (all theme/chrome, not blocking; ask-first to close):**
- Product-card **icon boxes** (size-12 colored squares) + topnav **NY logo box** — no lexical
  node produces a *styled icon container*; `IconNode` is inline-only. Would need a small
  chrome treatment (a column-type-style mark or a theme token). Left out.
- Hero h1 renders `displayHero` 52px vs mockup 64px; stat "42,108" is `displayMD` (Oswald)
  vs mockup mono-40 tabular; hero-stat mini-grid (regions/counties/MPOs) is one line vs 3-col.
  All are missing-token gaps — would add a `displayMax` (64) + a `statNum` mono-tabular token.

**Follow-up enhancements — DONE 2026-06-03 (user-requested, all BC):**
- **Tokens added** to transportnyv2 `textSettings` (+ slashKeys): `displayMax` (64px hero h1),
  `statNum` (mono-40 tabular stat number), `cardTitle` (18px uppercase Oswald — product cards).
  Audience-card titles switched to the existing `nav` token; hero-stat mini-grid now a 3-col `layout()`.
- **Icon-box treatment.** Extended the shared `IconNode` (BC) with an optional `styleKey` →
  resolves `theme.iconStyles[styleKey]` = `{box, icon}` and wraps the SVG in a styled chip
  (else inline as before). Added transportnyv2 `iconStyles.productChip` (size-12 tinted square);
  product cards lead with `icon('Activity'|'MapLayers'|'Database'|'MapPin'|'Pages','productChip')`.
  The **NY brand box** (topnav + footer) is an inline-styled text run (`nyBox()`/`wordmark()`).
- **Topnav padding fixed** with a new `layoutGroup` style **`topbar`** (white, `border-b`,
  `h-[60px] flex items-center`, `mr-auto max-w-[1480px] pl-12 pr-8` to match the content
  bands); topnav band switched `header` → `topbar`.
- **Topnav alignment (after user added a compact sidenav to the pattern):** moved the topnav
  band from `position: 'top'` → `'content'`. A `top` band renders full-viewport-width *above*
  the Layout, so with a sidenav its left edge no longer lines up with the content column;
  as a `content` band it shares the sidenav offset and left-aligns with the hero/products.
- **Topnav full content width / right-aligned actions** — TWO stacked causes (both fixed):
  (1) the `topbar` `layoutGroup` `wrapper2` was `flex items-center` (a flex **row**), which
  **shrink-wrapped the section to content width** (band measured 629px while every other band
  was 1400px) → changed to `flex flex-col justify-center` (cross-axis stretch fills the band,
  justify-center keeps vertical centering); (2) the lexical layout-container then needed `w-full`
  (theme `layoutContainer` is `grid gap-3 mt-2`, no width) → topnav template is
  `layout('w-full !mt-0 items-center grid-cols-[max-content_1fr_max-content]', …)`. Verified via
  DOM: all 5 bands now 1400px, topnav grid 1368px, actions' right edge == grid right edge (1496).
  → both rolled into `creating-pages-from-a-design-pattern.md` §5.7.
- Re-verified full-page at `http://localhost:5173/edit/landing` (`landing_v2.png`/`landing_top.png`).
- **Footer left-gutter alignment** (user): footer band was `position:'bottom'` — same offset
  bug as the topnav (`bottom`/`top` render outside the Layout, missing the sidenav offset, so
  the gutter sat ~22px left of the content). Moved to `position:'content'` (last content band);
  columns still render. **General rule: with a sidenav, keep page bands at `position:'content'`
  — `top`/`bottom` bands won't align with the content column.**
- **Centered topnav nav links** (user): override the nav styled-paragraph `format:'center'`
  so it centers in the 1fr middle column (mirrors the mockup's justify-between middle group).
- **CURRENT COVERAGE card vertical spacing** (user): the stat card is a **lexical** card, which
  has no per-cell padding — inner padding is the global `richtext.contentPadding` and line
  spacing is the global lexical `paragraph` mb-1. Added vertical margin to the **exclusive**
  `statNum` token (`mt-2! mb-2.5!`) so the big number breathes from its label/sublabel without
  affecting shared tokens; the `hr` divider already has `my-4`. → documented the lexical-card
  vs Card-cell-padding distinction in `creating-pages-from-a-design-pattern.md` §5.6.10.
- **Hero topo/grid background** (user): the `hero` band wrapper1 already had `tny-hero-topo`,
  but that class (and `tny-press`) had **no CSS in the live app** — they only existed in the
  design system's `_shared.css`. Ported both into a new `type:'style'` entry in transportnyv2's
  `fonts` array (`id: transportny-surfaces`), so the stacked-gradient hero texture + the button
  `:active` press now render live. (Surface utilities can't be Tailwind class strings — stacked
  gradients / `:active` margin-shift — so they must be injected as raw CSS via `fonts`.)

**Goal:** make design→DMS as close to **one-shot** as the skills now allow. Treat skill
upkeep and primitive-gap discipline as first-class deliverables (see the two boxed rules).

## Objective

Build `…/dms_design_system_v2/pages/landing.html` as a live **draft** page in the
**`landing` pattern** of the `npmrdsv5` + `dev2` site, faithful to the mockup, using the
existing DMS section primitives — no new custom components unless explicitly approved (see
rule below).

- **Pattern:** `dev2|landing:pattern` (id **1700630**, `pattern_type: page`, `base_url: /`,
  `subdomain: *`). Pages here are `npmrdsv5+landing|page`; sections `landing|component`.
- **Host / CLI:** `DMS_HOST=http://localhost:3001 DMS_APP=npmrdsv5 DMS_TYPE=dev2`,
  run via `node src/dms/packages/dms/cli/bin/dms.js …`. **Always pass `--pattern 1700630`**
  on `section create` (without it the CLI defaults to the wrong pattern).
- **Draft-only discipline:** never `dms page publish`. Humans publish.

## ▶ Before doing anything — REQUIRED skill use

This is a content-page build. **Invoke these skills (via the Skill tool) BEFORE writing any
CLI command or code**, in this order:

1. **`creating-pages-from-a-design-pattern.md`** — the primary skill. The whole six-step
   workflow (inventory → pattern → page → section groups → sections → verify), the CLI
   surface, and the section recipes. **Pay special attention to:**
   - §5.6.6 brand text tokens / **eyebrow**, §5.6.x lexical seed helpers — the landing page
     is editorial-heavy (hero copy, product cards, audience list, footer columns).
   - §5.7 **side-by-side CTAs** (the hero's "Explore products" / "View docs" buttons).
   - §5.6.9 **rowspan**, §5.6.10 **card chrome is a section setting** (gap-0 + inner box).
   - **§5.2.1** (added 2026-06-03) — the `--set`-can't-reach-`element-data` trap + the
     **section ordering/insertion** reorder (`create` appends → reorder `draft_sections`
     via `page update --data`) + the clear-`title`/frame-with-lexicals pattern.
2. **`transcribing-a-design-card-to-dms.md`** — the **mockup-vs-live Playwright loop**
   (`scripts/card-shot.mjs`, `scripts/mint-token.mjs`, `scratchpad/npmrdsv5-dev2/auth.json`;
   token ~6h, dev creds `availabs@gmail.com` / `test123`). Use it to eyeball each band
   against the mockup as you build. The landing page renders at the pattern's `base_url: /`.
3. **`card-layout.md`** — only if a band needs a data-bound Card (the hero "current coverage"
   stat or a metrics strip); most of this page is static lexical/Card content.
4. **`translating-design-system-to-dms-theme.md`** — only if you hit a missing **theme
   token** (a font-style preset, a band tint, a button style). Don't invent inline Tailwind;
   add/realize the token through the theme.

If a skill turns out not to apply, you don't have to follow it — but you must have checked.

## Mockup inventory (`landing.html`, 231 lines)

| Band (`data-dms-group`) | Sections (`data-dms-section`) | DMS shape |
|---|---|---|
| `topnav` | brand + nav links | **Likely site/layout chrome, not page sections** — confirm whether the `landing` pattern renders a topnav via theme/layoutGroup before building it as sections. |
| `hero` (topo bg) | `hero-copy` (eyebrow + `h1` 64px + subcopy + 2 CTAs), `hero-stat` (CURRENT COVERAGE stat card, self-end) | lexical (copy + CTAs via §5.7) + a Card or lexical stat. 8/4 split. |
| `content` (`#ECEEF2`) | `products-intro` (h2 "Products"), 5 product cards (`product-1..5`; 4/4/4 then 6/6) | lexical intro + 5 Card/lexical product cards with the brand hairline chrome (§5.6.10). |
| `content_tint` (`#E4E8EE`) | `for-whom` (h2), `audiences` (3 labeled rows) | 7/5 split; lexical + a small list card. |
| `footer` | `footer-brand`, `footer-products`, `footer-resources`, `footer-contact` | footer band — confirm theme-chrome vs sections (mirror the §06/footer decision on map21). |

**Open layout decisions to settle in step 1 (don't guess — verify against the pattern):**
- Are `topnav` / `footer` rendered by the `landing` pattern's theme (layoutGroup / nav /
  footer chrome), or are they content bands of sections? Check the pattern + its theme.
- Band backgrounds (`#ECEEF2` / `#E4E8EE` / topo hero) → per-band `theme` (LayoutGroup style)
  or per-section `bg` (gap-0). Reuse whatever map21 used for tinted bands.

## Build approach (phased; keep the task updated as you go)

1. **Inventory + layout decisions** (topnav/footer chrome?, band tints, grid sizes per the
   mockup's `col-span-*`). Create the page in the `landing` pattern, seed `draft_section_groups`.
2. **Hero** — eyebrow + h1 + subcopy + CTAs (lexical + §5.7); hero-stat card. Shot vs mockup.
3. **Products** — intro h2 + 5 product cards (chrome via section setting). Shot vs mockup.
4. **For-whom + audiences** — tinted band, 7/5 split.
5. **Footer** — per the chrome decision.
6. **Full-page pass** — `card-shot` the whole page top-to-bottom vs the mockup; fix spacing,
   tints, type scale.

## 🔶 RULE — Ask before adding a new system primitive

**If you feel you need a new primitive to match the mockup — a new column type, `formatFn`,
`cardHint`, section setting, theme token, or (especially) a custom React component — STOP and
ASK the user first.** Per `CLAUDE.md` (author-empowerment) and the durable feedback memory
*"Primitive changes need a planning task, BC by default, ask before non-BC"*:
- First exhaust the existing surface (the four questions in `src/themes/CLAUDE.md`: formatFn?
  cardHint? theme token? small focused column type for chrome?).
- A genuine gap is fine — but it gets its **own** planning task, is **BC by default**, and
  **non-BC options are surfaced to the user as an explicit question**, not chosen unilaterally.
- Pixel-parity is **not** worth a developer-locked custom component. Author-extensible wins.

## 🔶 RULE — Keep the skills up to date (living mandate)

This page is also a test of "is design→DMS one-shot yet?" As you build:
- Keep a running **Skill notes** list in this task: anything that made a band non-obvious,
  any recipe you wished the skill had, any place the skill was wrong/stale.
- At the end, **roll those notes into the actual skills** (`creating-pages-from-a-design-pattern.md`
  first; `card-layout.md` / `translating-design-system-to-dms-theme.md` as relevant) — edits
  are deliverables, not afterthoughts. If you discover a brand-new reusable pattern, write it up.
- If a skill made the work *harder* (misleading/missing), fix the skill in the same pass.

### Skill notes (accumulate here)
- **Preview-routing gotcha (the big one).** The `landing` pattern is `base_url: /`,
  `subdomain: null` — and **many patterns share `base_url: /`** on this site (npmrds_sub,
  freightatlas2, transit, …). On `npmrds.localhost:5173`, `npmrds_sub` owns `/`, so
  `/edit/landing` resolved into npmrds_sub and showed a different page (map21). A
  `subdomain: null` pattern is the **default/fallback** — it resolves on the **bare host**:
  `http://localhost:5173/edit/landing` (mint a token for that origin:
  `mint-token.mjs --origin http://localhost:5173`). → rolled into the skill.
- **`selectedTheme` must be the v2 theme** (same as the login task): the pattern was on old
  `transportny` (no v2 bands); user switched it to `transportnyv2`. Already noted in
  `translating-design-system-to-dms-theme.md`.
- **`--pattern <id>` on `section create`** is required here (multiple `/` patterns) — type
  resolution picks the wrong one otherwise. Passed `--pattern 1700630` throughout.
- **Token coverage was excellent** for a marketing page (kicker/displayHero/displayLG/prose*/
  meta*/displayXS + button styles). Two real gaps worth a token each: a **64px display**
  (`displayHero` is 52) and a **mono-tabular stat number**. Card-title token is 18px but not
  uppercase (used `displayXS`). These are theme-token adds (ask-first) — logged, not done.
- **No lexical node for a styled icon *box*** (`IconNode` is inline, 1.5em, `theme.Icons[name]`).
  The mockup's colored size-12 icon squares + the NY brand box can't be expressed in lexical;
  they're card chrome. Noted as a gap, not forced.
- **rowspan (§5.6.9) worked** for the for-whom 7-col copy + 3 stacked size-5 audience cards.
- **Topnav/footer as sections worked** via `header`/`footer` layoutGroup bands at
  `position: top`/`bottom`, with a 3-col lexical `layout-container` for the nav row.

## Testing checklist
- [x] Page built in the `landing` pattern (`--pattern 1700630`), draft-only (page 2173051, 18 sections).
- [x] Full page shot vs the mockup; type scale + tints + grid match across all 5 bands (`landing_fullpage.png`).
- [x] No new custom component/primitive added (gaps logged for ask-first, not built).
- [x] Skill notes rolled into the skill (`creating-pages-from-a-design-pattern.md` preview-routing gotcha).
- [x] Renders in the editor (`http://localhost:5173/edit/landing` — bare host; see preview-routing note).
- [ ] _(follow-up, optional / ask-first)_ icon-box chrome (product cards + NY brand mark), `displayMax` 64px + mono-tabular stat tokens, hero-stat 3-col mini-grid.
