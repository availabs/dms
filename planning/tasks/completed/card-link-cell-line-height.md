# Card link cells ignore their font token's `leading` (inline `<a>` strut)

**Status:** SHIPPED 2026-08-14 · **Created:** 2026-08-14 · **Kind:** BC render-path fix (primitive)
**Found by:** the NPMRDS Home § 01/§ 02 vertical-rhythm work
(`planning/transportny/tasks/current/npmrds-home-page-build.md`, Escalations) — it was the root
cause of a whole band being 63–120px taller than its design.

## Objective

Make a Card **link** cell honour the `leading-*` in its `valueFontStyle` token, the way every
non-link cell already does — so a design's line height is reproducible on a cell that happens to
be a link.

## Current state (measured, not inferred)

`ui/components/Card.jsx` renders a link cell as **value div → inline `<a>`/`<Link>` → text**:

```jsx
// Card.jsx ~578 — the value div DELIBERATELY drops the token for a link cell…
`${theme.value} ${theme[valueTextJustifyClass]} ${(isLink && !(allowEdit || attr.allowEditInView)) ? '' : theme[…valueFontStyle…]} ${formatClass}`

// …because the token goes on the anchor instead (~585 external, ~608 internal)
<a  className={(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '')} target="_blank" … >
<Link className={(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '')} to={url}>
```

The move to the anchor was deliberate and is documented in the comment above it: putting a
**box-shaped** token (`chip`, `btnPrimary`) on both the div and the anchor painted a phantom second
box. That fix is correct and must be preserved.

**The bug:** `<a>` and `<Link>` are **inline** by default, and an inline box's `line-height` does
not size the line box it sits in — the **containing block's strut** does. So the anchor's
`leading-[1.55]` is inert and every line of a link cell costs whatever `theme.value` inherits
(**16px/24px** in `transportnyv2`), regardless of the token.

**Measured impact** (NPMRDS Home § 01, viewport 1480): a `12.5px/leading-[1.55]` description
should give a **19.4px** line; it rendered at **24px**. Rows 55.9px (design) → **69px** live, and
the § 01 band 264.5 → **328**. § 02 the same way (408 → 528). The symptom does not look like a line
-height bug — it looks like *"this other section has a lot of white space at the bottom"*, because
the taller sibling stretches the band and the shorter one shows the difference.

Non-link cells are unaffected: they keep the token on the value div, where its `leading` is the
strut.

## Proposed change (BC)

Make the anchor establish its own line box **without** re-introducing the double-box bug. Options,
in order of preference — settle by trying #1 first:

1. **`inline-block` on the anchor.** Smallest change; an inline-block's own `line-height` sizes its
   content. Risk: an inline-block is a *box*, so `text-align`/baseline behaviour can shift for cells
   that today rely on pure-inline flow. Must be checked against the existing link-cell corpus.
2. **Split the token**: keep the box/paint half on the anchor, apply only the *typographic* half
   (`text-[..]`, `leading-[..]`) to the value div as well. Most faithful, but requires classifying
   token classes — brittle unless the theme layer declares it.
3. **Have the value div carry the token's leading when the token is not box-shaped.** Effectively #2
   with a narrower rule (`valueFontStyle !== 'button'` already exists as precedent).

Whatever lands must keep: no phantom second box for `chip`/`btnPrimary`; `theme.linkColValue`
fallback when no token is set; and `allowEdit`/`allowEditInView` link cells (which render the edit
comp, not the anchor) unchanged.

## Files requiring changes

| File | Change |
|---|---|
| `src/dms/packages/dms/src/ui/components/Card.jsx` (~578, ~585, ~608) | the fix above, in both the `<a>` and `<Link>` branches |
| `src/dms/skills/card-layout.md` | update the note added 2026-08-13 (it currently records the bug; it should record the fix + any residual rule) |

---

## SHIPPED 2026-08-14 — option #1 was measured and REJECTED; the fix is a guarded blockify

### Option #1 (`inline-block`) does not work — measured, not reasoned

The task ranked `inline-block` first. It is **inert for this bug**: an inline-block is still an
*inline-level* box, so the containing block's strut still participates in the line box, and the
strut is the taller of the two. Runtime A/B on `/edit/home` (`exp_blocklink.mjs`), § 01 `labelSM`
cell: value div **24 → 24px**. Worse, it *broke* the cells that already worked — `line-clamp-*`
sets `display:-webkit-box`, so forcing `inline-block` unclamped the § 02 descriptions
(34.5 → 59.8px) and pushed both ready-made cards 441 → 476.3px.

What actually returns the line box to the token is **blockifying** the anchor: a block box's own
`line-height` is the strut of the line boxes it generates. That is precisely what a NON-link cell
already does, since there the token sits on the value div.

### The diff

`ui/components/Card.layout.js` — new pure resolver (unit-tested):

```js
const DECLARES_DISPLAY =
    /(?:^|\s)(?:[^\s:]*:)*!?(?:inline-flex|inline-block|inline-grid|inline-table|inline|flex|grid|table|flow-root|contents|hidden|list-item|line-clamp-[^\s]+|\[display:[^\]]*\])!?(?=\s|$)/;

export function resolveLinkAnchorStyle(linkClass) {
    return DECLARES_DISPLAY.test(` ${linkClass || ''} `) ? undefined : { display: 'block' };
}
```

`ui/components/Card.jsx` — the anchor class was computed twice (once per branch); it is now hoisted
once and paired with the style:

```diff
+    const linkClass = (attr.valueFontStyle && attr.valueFontStyle !== 'button')
+        ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '');
+    const linkStyle = resolveLinkAnchorStyle(linkClass);
...
-    <a className={(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '')}
+    <a className={linkClass}
+       style={linkStyle}
        target="_blank" …>
-    <Link className={(attr.valueFontStyle && attr.valueFontStyle !== 'button') ? (theme[attr.valueFontStyle] || '') : (theme.linkColValue || '')} to={url}>
+    <Link className={linkClass} style={linkStyle} to={url}>
```

The value div is **unchanged** — the phantom-second-box fix stands exactly as it was. Nothing is
ever repeated onto both elements; the fix adds one inline property to one element.

### Why the guard is the whole design

`display:block` must never be forced onto a token that declares its own display, because that
display *is* the token:

| token shape | example | outcome |
|---|---|---|
| box | `btnPrimary`, `btnOutline`, `toggleOff` — `inline-flex … h-9` | untouched; `items-center` keeps centring the label in the 36px box |
| clamp | `proseXSClamp2` — `line-clamp-2` (⇒ `-webkit-box`) | untouched; clamping survives |
| theme fallback | MNY `linkColValue` — `flex-1 flex … rounded-full` | untouched (a box token that also carries `leading-[100%]`, so a leading-based trigger would have broken it) |
| text | `labelSM`, `metaMD`, `cardTitleSM`, `unitXS` | blockified — the bug is fixed |

A narrower trigger ("only when the token declares a `leading-*`") was also measured and **rejected**:
it leaves any token that sets a font-size but no leading (`unitXS`) stuck on the div's strut, so
§ 01's rows did not move at all (55 → 55). The rule that matches the objective — *behave like a
non-link cell* — is "the token owns the typography unless it owns the display".

### Acceptance measurements (`/edit/home`, page 2211341 DRAFT, 1480)

- **19.4px, not 24** — a `text-[12.5px]! leading-[1.55]!` token on a link cell now measures
  **19.4px** for one line and **38.8px** for two (`verify_lineheight.mjs`, which strips the clamp at
  runtime so the token is a plain text token). Before: 24 / 48.
- § 01 measure rows **55 → 50.4px** (cells 24 → 16.3 name, 24 → 13.5 unit).
- Box tokens: `toggleOff` 40, `btnOutline` 48, `btnPrimary` 48 — **identical before and after**.
- No-token cells (`theme.linkColValue`): CR ticket "Macro Tool" **33 → 33** — byte-identical.
- `<a>` and `<Link>` take the same `linkClass`/`linkStyle` — one code path, no divergence possible.
- `allowEdit`/`allowEditInView` still short-circuit before the anchor branch (untouched code).

### Regression pass — every link-cell literal, classified by ELEMENT TYPE

The 19-literal survey mixes two components. Only **Card** literals are in this fix's blast radius;
`Spreadsheet` link columns render through `TableCell`, which this change never touches.

| build script : line | element | token | verified |
|---|---|---|---|
| `build_cr_design` :68 / :72 | Card | `toggleOff` / `btnOutline` | box — unchanged (same cards as cr_page) |
| `build_cr_page` :95 / :98 | Card | `toggleOff` / `btnOutline` | live `/sitemgmt/page?key=npmrds:home` — 40 / 48 unchanged |
| `build_cr_tickets` :108 | Card | `btnPrimary` | live `/sitemgmt/tickets` — 48 unchanged |
| `build_cr_tickets` :302 / :305 | Card | `btnOutline` / *(none)* | live `/sitemgmt/ticket?id=2211536` — 48 / 33 unchanged |
| `build_cr_tickets` :358 / :362 | Card | `metaMD` / *(none)* | live ticket page — 12 / 33 unchanged |
| `build_fa_gallery_about` :124 | Card | `cardTitleSM` | not rendered on the live gallery; covered by unit test |
| `build_npmrds_home` :372 / :447 | Card | *(spread onto `labelSM`/`proseSMTrunc1`/`unitXS`, `proseRowSM`/`proseXSClamp2`)* | live — the fix's target |
| `build_tsmo2_corridor_view` :448, `build_tsmo2_incidents_v2` :648 | Card | *(none)* | card not reachable without a selection; `(none)` proved byte-identical on the CR ticket page |
| `build_cr_overview` :181/:184/:185, `build_cr_page` :157, `build_cr_tickets` :228, `build_tsmo2_congestion_v2` :466, `build_tsmo_incident_search` :198 | **Spreadsheet** | — | out of scope — different component |

Whole-page proof (`exp_blocklink.mjs`, base grid heights before vs after the core edit):

| page | cards-grid heights | document |
|---|---|---|
| `/sitemgmt/page?key=npmrds:home` | 6 grids, **no change** | 2830 → 2830 |
| `/sitemgmt/ticket?id=2211536` | 5 grids, **no change** | 2600 → 2600 |
| `/edit/home` | 7 grids, **no change** (the cells shrink inside `height:'fill'` sections) | 3081 → 3081 |
| `freightatlas2/maps_gallery` | **all 22 tiles 214.8 → 196.8** | 3185 → 3023 |

**The freight-atlas gallery is the one page that visibly changes**, and it changes the way the fix
intends: its `open in Freight Atlas →` CTA is a 10px mono token that wraps to two lines and was
getting 24px line boxes; it now gets its own 15px (48 → 30px), the text stays flush right, and the
tile is 18px shorter. Screenshots: `BEFORE_fa_gallery_1480_crop.png` / `AFTER_…`.

### The clamp tokens — measured recommendation: KEEP them

`proseSMClamp1`/`proseSMTrunc1`/`proseXSClamp2` were doing **two** jobs. The vertical one is gone —
proven by unclamping at runtime with the fix in place: one line is exactly 19.4px, two are 38.8px,
i.e. the token's own leading, no compensation. The horizontal one is still real: unclamped, **4 of
the 8** § 01 descriptions wrap to a second line at 1480 (19.4 → 38.8), which would put the rows back
to ~68.8px. The clamp is the mockup's `truncate`, an authored horizontal decision, so it stays.
What changed is that it is no longer load-bearing for the rhythm, and the comments in
`build_npmrds_home.mjs` that credited it with the vertical fix are now wrong (updated).

### Consequence found while measuring (fixed on the page, logged as a primitive gap)

The accidental 24px strut was also, accidentally, **aligning the three parts of a § 01 row**
(name/description/unit). With each part now on its own leading (16.25 / 19.4 / 13.5) and cells
top-anchored in their row, the 9px unit label rode ~3px high. Corrected in `build_npmrds_home.mjs`
with two top-padding bumps (+1.5 name, +3 unit — half the line-box difference each); the row's
natural height is unchanged. The general fix is a "centre the content inside a stretched cell" knob,
filed as [`card-cell-content-valign.md`](./card-cell-content-valign.md).

### Testing checklist

- [x] A link cell with a `leading-[1.55] text-[12.5px]` token measures a **19.4px** line box, not 24px.
- [x] A **box** token (`chip`, `btnPrimary`) on a link cell still paints exactly ONE box.
- [x] A link cell with **no** `valueFontStyle` still gets `theme.linkColValue` (and measures identically).
- [x] `isLinkExternal` (`<a target=_blank>`) and internal (`<Link>`) behave identically — one shared
      `linkClass`/`linkStyle`.
- [x] `allowEditInView` link cell still renders its edit comp unchanged.
- [x] **Regression sweep across existing link cells** — table above; live pass over the control room
      (`/sitemgmt/overview`, `/sitemgmt/tickets`, `/sitemgmt/page`, `/sitemgmt/design`,
      `/sitemgmt/ticket`), tsmo2 (`incidents_v2`, `corridor_view`, `incident_view`) and
      freightatlas2 (`maps_gallery`).
- [x] Re-measured NPMRDS Home § 01/§ 02; clamp tokens re-evaluated (above).
- [x] Unit tests: 6 new cases in `packages/dms/tests/cardLayout.test.js`.

### Notes

- Evidence: `scratchpad/npmrdsv5-dev2/npmrds_home/linkline/` — `exp_blocklink.mjs` (the three-rule
  runtime A/B), `verify_lineheight.mjs` (the acceptance measurement), `probe_links.mjs`,
  `BEFORE_*`/`AFTER_*`/`FINAL_*` screenshots and the per-page JSON.
- Related, separate gap: [`card-cell-row-slack-absorption.md`](./card-cell-row-slack-absorption.md).
  Doing this one FIRST was right: it freed 18.4px of slack in § 01 at 1480 (0.7 → 19.1) and 63px at
  1280, which is what Phase 2 then had to absorb.
