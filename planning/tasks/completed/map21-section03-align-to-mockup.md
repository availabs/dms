# §03 "How MAP-21 targets work" — align the live page to the design mockup

**Topic:** patterns/page + themes (transportny) + MAP-21 page §03. **Status:** ✅ done & verified (2026-06-01).

## ✅ Implemented & verified
Rebuilt §03 from one flowing lexical block into the mockup's structure — **no theme or
component change needed** (build script `scratchpad/npmrdsv5-dev2/build_s03.mjs`):
- **Layout** via per-section fields in the existing `grid-cols-12` band: heading (`size 12`,
  repurposed 2173960), left two-prong card (`size 7, rowspan 3`), three right cards
  (`size 5`) — ids **2174048–2174051**, reordered contiguous in `draft_sections` before the
  MPO table.
- **Card chrome** via the section `border:"full"` (`= rounded + border + bg-white + shadow`
  in `theme.sectionArray.border.full`) + `padding:"p-6"/"p-5"`. Discovered this avoids the
  planned lexical-`card`-style enrichment entirely.
- **Colored prong/legend dots** via Lexical **text-node inline `style`** (`color:#10B981` /
  `#EAAD43` / `#EF4444`) — no icon node, no new primitive.
- **Content reconciled** to the mockup: h2 "Reading "met" the way FHWA does.", left card
  "two-prong test" with emerald *Meets or beats the target* + amber *Better than baseline
  (TTTR ≥0.01)*, the 3-dot legend (Met / Significant progress / Not meeting), and the three
  right cards incl. the **restored Performance-periods card** (P2·2022–2025 / P3·2026–2029).
- Verified live (`scratchpad/npmrdsv5-dev2/transcribe/s03_live_new.png`) — closely matches
  `s03_compare.mockup.png`.

**Remaining minor divergence (acceptable):** the A/B prongs use color-coded dots rather than
the mockup's lettered circular badges (no inline badge node exists; per the plan we
approximate). The left-card sub-heading uses `displayXS` (18px) vs the mockup's 13px uppercase.
Both are cosmetic; add an inline badge node only if exact parity is later required.

**Insights captured to skills:** the `rowspan` "one tall card + stacked column" pattern and
"chrome via section/named styles, not Lexical content" → `creating-pages-from-a-design-pattern.md`
(§5.6.9–5.6.10); the Tailwind-v4 `/05` opacity gotcha → `translating-design-system-to-dms-theme.md`
(gotcha #5 + §3.1.57).

---
## Original plan ↓ (kept for reference)
**Live:** section **2173960** (a single `lexical` block) on page 2173915.
**Mockup:** `dms_design_system_v2/pages/map-21-system-performance.html`
`[data-dms-section="how-targets-work"]`.

## Overview — how they diverge
The live §03 is a faithful **text transcription** but drops all of the mockup's visual
structure. Side-by-side (`scratchpad/npmrdsv5-dev2/transcribe/s03_compare.compare.png`):

1. **Layout.** Live = one flowing single-column lexical block. Mockup = a **12-col grid**:
   a **left card (col-span-7)** + a **right column (col-span-5)** holding **three stacked
   mini-cards**.
2. **Card chrome.** Mockup wraps each block in a bordered white panel
   (`rounded-[8px] border border-zinc-950/10 bg-white p-5/6`). Live has no card chrome.
3. **Section h2.** Live: "Significant progress — the two-prong test". Mockup:
   **"Reading "met" the way FHWA does."** — the two-prong line is the *left card's* heading,
   not the section h2.
4. **Prongs.** Live: "Prong 1 — target / Prong 2 — trend" as plain paragraphs. Mockup:
   **A** (emerald lettered circle) "Meets or beats the target" + **B** (amber lettered
   circle) "Better than baseline (TTTR: by ≥ 0.01)". Different framing (live says "better
   than the 2-yr midpoint"; mockup/FHWA says "better than baseline") **and** the lettered
   badges.
5. **Legend.** Live: a plain mono line "States · Meets target · Below target · Diagnostic".
   Mockup: a card-footer rule with **three colored dots** — emerald **Met target**, amber
   **Significant progress**, rose **Not meeting**. (Different labels + dots.)
6. **Right-column content.** Mockup has three labeled mini-cards with amber mono labels:
   **Performance periods** (4-yr periods, 2-yr midpoint + 4-yr final check; P2·2022–2025,
   P3·2026–2029), **MPO adoption · 180 days**, **Urban congestion is UZA-only** (NY-Newark,
   Poughkeepsie-Newburgh). Live folds MPO + UZA into prose and **omits the Performance-
   periods card entirely**.

## Already expressible today (no new primitive)
- **The grid.** The page section container is `grid grid-cols-12 gap-6` (themev2 `sectionArray.container`)
  and every section carries `size` (col-span via `theme.sizes`) + `rowspan` (`theme.rowspans`).
  → left card `size:"7", rowspan:"3"`; three right cards `size:"5"`. CSS auto-flow places the
  left card in cols 1–7 (rows 1–3) and the right cards in cols 8–12 (rows 1–3) — the mockup
  layout, exactly. (Heading is a `size:"12"` section above them.)
- **Typography.** styleKeys `kicker` / `heading_h2` / `prose` / `metaSM` already match the mockup.
- **Legend dots.** The lexical `icon` node can render an inline colored circle before each
  label (approximates the emerald/amber/rose dots).

## Gaps (small, reusable enrichments)
1. **Card-panel chrome per section.** Add a **`card` named style** to `theme.lexical.styles[]`
   (2nd entry; wrapper `rounded-[8px] border border-zinc-950/10 bg-white p-6`) + a per-section
   **"Card style" picker** on the lexical section — mirrors the established `filterStyle` /
   `tableStyle` / `cardStyle` per-section style-picker pattern (`display.<x>Style || activeStyle`).
   Reusable for any panel/callout content block. **BC:** default style unchanged; opt-in.
2. **A/B lettered circular badges.** There is **no inline styled-text node** today — only the
   block-level `StyledParagraphNode` (`ui/components/lexical/editor/nodes/StyledParagraphNode.ts`).
   Options: **(a)** approximate with an `icon` colored dot + bold "A."/"B." inline (no new
   primitive); **(b)** add a small inline **badge** lexical node (new primitive — only if pixel
   parity is required). **Recommend (a) first.**

## Recommended approach (sequenced)
**Phase 1 — content + layout (no new code).** Replace the single §03 lexical with ~5 sections
on the §03 band: heading (`size 12`: kicker + "Reading "met" the way FHWA does."), left
two-prong card (`size 7, rowspan 3`), and three right cards (`size 5`): Performance periods /
MPO adoption / Urban congestion. Reconcile copy to the mockup (restore the **Performance-
periods** card + P2/P3; switch prong B to **"better than baseline"**).
**Phase 2 — card chrome.** Add the lexical `card` named style + per-section picker; apply to
the four cards.
**Phase 3 — badges + legend.** Legend = three `icon` dots + labels (Met / Significant progress
/ Not meeting). Prongs A/B = icon dot + bold letter (approx.); revisit an inline badge node
only if needed.

## BC / parity
Additive only — new lexical style + content; the grid layout (`size`/`rowspan`/12-col) already
ships. High parity for layout, cards, copy, and the dot legend. The one sub-parity risk is the
lettered circular A/B badges (approximated unless a badge node is added) — acceptable per the
author-empowerment trade-off (`themes/CLAUDE.md`).

## Files
- Page 2173915, §03 band — split section 2173960 into the heading + four card sections
  (`dms section create … --pattern npmrds_sub --element-type lexical`; set `size`/`rowspan`).
- `themes/transportny/themev2.js` `lexical` — add the `card` named style.
- `…/ComponentRegistry/richtext/config.js(x)` — add the "Card style" picker (mirror `tableStyle`).
- (optional) `ui/components/lexical/editor/nodes/` — an inline `badge` node, only if pixel
  parity on the A/B badges is required.

## Verify
`scripts/card-shot.mjs --name s03 --mockup-sel '[data-dms-section="how-targets-work"]'
--live-sel '[id="2173960…"]'` (each card) until aligned. Refresh auth via `scripts/mint-token.mjs`.
