# Card header alignment + casing controls

**Topic:** ui (the `Card` UI primitive — `ui/components/Card.jsx` + `card.theme.jsx`)
**Status:** A + B implemented and **verified live** — the interstate KPI card title
now renders sentence-case, left-aligned ("Interstate reliable") via the Playwright
loop. (The earlier "still uppercase" was a stale-theme race, not a wrong fix — see
the restart gotcha in Implementation notes.) Remaining: confirm old cards on a shared
page are unchanged (BC check for the metaSM-labelled headers — expected fine).

## Decisions (made 2026-05-29)
- **A — header alignment: BC.** New per-column `headerJustify`, default `''` → left
  (existing cards unchanged).
- **B — header casing: NON-BC (user opted in).** Drop the forced casing so the
  header renders as authored / per `headerFontStyle`; new `headerCase` control lets
  authors opt into capitalize/uppercase/lowercase.

## Implementation notes
- `card.theme.jsx`: `header` default `'w-full capitalize'` → `'w-full'`.
- `Card.jsx`: added `caseClass` map; `headerTextJustifyClass` now keys off
  `attr.headerJustify` (default left); applied `headerTextJustifyClass` +
  `caseClass[headerCase]` to the header **block** wrapper (so `text-*` alignment
  actually takes effect — previously the inline span made `justify` inert on the
  header); moved the justify class off the inline span.
- `Card.config.jsx`: `headerJustify` + `headerCase` selects; both added to the
  copy/paste-format payload.
- **Theme-side discovery:** the active **themev2** code theme *also* baked casing
  into its `dataCard.header` token (`font-display uppercase text-[12.5px] …`), which
  inherits to every header span and overrides the primitive default. Removed
  `uppercase` from `themev2.js` `dataCard.header` (line ~790) so `headerFontStyle`
  owns casing (labels keep their `uppercase` via the `metaSM` token; the
  `displayXS` title becomes sentence-case). This is the theme-side half of B.
- **Gotcha that cost debugging:** the dev server *served* the updated `themev2.js`
  (curl confirmed), but the running app kept rendering the old uppercase header.
  Card.jsx component edits and card-config (data) edits hot-reload; **code-theme
  edits are assembled at app boot and need a `npm run dev` restart** to take effect.
  Verify the title casing only after a restart.

## Objective

Give a Card author real control over the **column header** (the label above/beside a
value cell): its **alignment** and its **text casing**. Today both are effectively
fixed regardless of author settings. Surfaced while transcribing the MAP-21
interstate KPI card — the mockup needs a left-aligned, sentence-case heading
("Interstate reliable"), which the current primitive cannot express.

This is a **Card primitive change**, so per project policy it ships
**backward-compatible by default**; any visual change to existing cards is called
out below as an explicit BC question, not assumed.

## Root cause analysis

In `ui/components/Card.jsx`:

- `justify` is computed for both header and value (`headerTextJustifyClass`,
  `valueTextJustifyClass`, ~lines 389–390) and applied to the header span (~516)
  and the value div (~526).
- **It only takes effect on the value.** The value is a block `<div>`, so
  `text-center`/`text-end` work. The header label is an **inline `<span>` that is
  not full-width** (~512–519), so `text-*` alignment is inert on it — the header
  always sits left. Net: `justify` is effectively value-only.

In `ui/components/card.theme.jsx`:

- `header: 'w-full capitalize'` (~line 9) hardcodes `capitalize` on the header
  wrapper. `headerFontStyle` controls the label's size/weight/color (applied to the
  inner span, Card.jsx ~516) but the wrapper's `capitalize` still transforms the
  text, so an author cannot get true sentence-case or all-caps headers from the
  font token alone.

## Proposed fix (A + B), BC-by-default

### A — make header alignment controllable
- Render the header label inside a **justify-aware block** so a `text-*` class
  actually applies (give the label wrapper `block w-full` and apply the justify
  class there, or move `theme[headerTextJustifyClass]` onto the existing `w-full`
  outer header div).
- Add a per-column **`headerJustify`** control (Card.config `inHeader`: a select
  `''|left|center|right`), defaulting to **`''` → left** = today's behavior.
- **BC:** existing cards have no `headerJustify` → header renders left exactly as
  now. No retroactive change. ✓

### B — make header casing controllable
- Stop forcing casing from the wrapper; let it be author-selectable while keeping
  today's look as the default.
- Add a per-column **`headerCase`** control (`''|capitalize|uppercase|lowercase|normal`).
  Render maps it to a `text-transform` class on the header label.
- **Default = `capitalize`** (emit the same `capitalize` class when unset) so
  existing headers keep their current Title-Case transform. Setting `normal` gives
  sentence-case (what the mockup title needs); `uppercase` gives all-caps labels.
- Implementation detail: move the literal `capitalize` out of the hardcoded
  `card.theme.jsx` `header` key and into a default the new control supplies, so the
  control is authoritative. `header` keeps only layout (`w-full`).
- **BC:** unset → `capitalize` → identical to now. ✓

### Controls surface (Card.config.jsx `buildInHeader`)
- Add `headerJustify` and `headerCase` selects next to the existing `Justify`
  control; include both in the copy/paste-format payload (`handleCopy`/`handlePaste`)
  so cross-column paste keeps working.

## Files requiring changes
- `ui/components/Card.jsx` — header label render (block + justify class + casing class).
- `ui/components/card.theme.jsx` — drop literal `capitalize` from `header`; add the
  casing/justify token map if needed; bump justify map for header if split.
- `.../ComponentRegistry/Card.config.jsx` — `headerJustify` + `headerCase` controls
  in `buildInHeader`; add to copy/paste payload.
- `src/dms/skills/card-layout.md` — document both new column knobs.

## Open BC questions (ASK before implementing — do NOT assume)
1. **Header alignment default.** Ship BC (new `headerJustify`, default left; existing
   cards unchanged) — OR the more ergonomic **non-BC** option where the header
   simply follows the existing `justify` by default (one knob, but every existing
   card using `justify: center|right` would have its headers move)?
2. **Header casing default.** Ship BC (keep `capitalize` as the default via the new
   `headerCase` control) — OR the cleaner **non-BC** option of dropping the forced
   `capitalize` entirely (existing headers that relied on auto Title-Case — e.g.
   `median_income` → `Median Income` — would render lower/as-authored)?

## Testing checklist
- [ ] Existing cards on a shared page render **unchanged** with the BC defaults
      (per the "Card edits must be BC with old card formats" rule — verify against
      old cards on the same page).
- [ ] New `headerJustify` left/center/right visibly moves the header label.
- [ ] New `headerCase` normal/uppercase/capitalize changes the label casing.
- [ ] Copy/paste format carries both new keys across columns.
- [ ] MAP-21 interstate card title renders left-aligned, sentence-case via the loop
      (`scripts/card-shot.mjs`).
- [ ] `npm run lint` clean on the three touched files.
