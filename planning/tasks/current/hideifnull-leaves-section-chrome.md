# "Hide if No Data" leaves the section's chrome (empty bordered/white box)

**Initiatives:** [dms_author_primitives](../../../../../planning/initiatives/dms_author_primitives.md) · **Status:** next (was: "NOT STARTED — scoped 2026-09-24") · **Created by:** rdubowsky@albany.edu · **Edited by:** —

> **Status:** NOT STARTED — scoped 2026-09-24. Surfaced by TransportNY ticket **#2225147**, where the
> owner chose option B instead (explain in place via `useBlankRowFallback`; resolved + published
> 2026-09-24), so nothing drives this now. It stays open as a standalone library defect; any fix
> needs an owner call because it changes live MitigateNY rendering.

## Symptom

A Card/Graph/Spreadsheet with `display.hideIfNull: true` and no data renders an EMPTY box rather
than disappearing whenever its chrome is section-level (the section row's `bg`/`border`/`radius`).
TSMO home, `?year=2026`: the two Map-21 reliability cards (2214591/2214592 — `bg:"white"` + radius)
would stay two empty white boxes even with the toggle on (no full-year 2026 PM3 data, by design).

## Mechanism

- `dataWrapper/index.jsx` (the "Hide section logic" effect) sets RUNTIME
  `state.display.hideSection` when every shown column of every row is empty (or there are no rows).
- Consumers of the runtime flag: `dataWrapper/index.jsx:486` swaps the ViewComp for an empty
  fragment (view mode only), and `section.jsx:417` suppresses the title row. `section.jsx:586`'s
  wrapper class is a no-op — `editPageMode && hideSection && !editPageMode` is always false.
- The chrome is drawn one level up by `sectionArray.jsx` (view branch): `div#<id>` (grid slot,
  padding) > `div.sectionChrome(v)` (border/radius/bg from the SAVED section row) > `SectionView`.
  `hideSectionCondition` there reads only the SAVED `element-data` `display.hideSection` /
  `hideInView`, never the runtime flag, so the chrome and the slot always render.

Net: component-level chrome (e.g. Card `cardBorder`) hides with the component, leaving an
invisible slot; section-level chrome does not.

## Census (prod content DB, every `dms_*` schema, 2026-09-24)

- 7,953 sections carry `hideIfNull: true` — **all** in `dms_mitigat_ny_prod` (7,887 Card, 64
  Spreadsheet, 2 Graph).
- 176 of them have a section-level `border` (0 have a section `bg`), across the MitigateNY county
  templates (`mitigateny_county_template_copy` 12, `putnamcsc` 10, `…_v3_copy` 7, `…nassau_v2_copy`
  7, …). Those would change from an empty bordered box to nothing.

## Options

1. **Drop the chrome, keep the slot** (recommended if accepted): SectionView reports its runtime
   hidden state up (callback prop); sectionArray's view branch renders the grid slot without
   `sectionChrome` classes / border style for a hidden section. No reflow anywhere; component-
   and section-chrome sections then behave the same. Visible only for the 176 bordered MNY
   sections above.
2. **Collapse the slot too**: also drop the grid cell. Truer to "hide", but reflows every
   `hideIfNull` layout (7,953 sections) — not BC.
3. **Opt-in knob** (e.g. `display.hideChrome`): BC by construction, at the cost of another toggle
   whose absence is the confusing default.

While here: fix or delete the dead `section.jsx:586` condition.

## Verification constraint

`hideIfNull` never hides in edit mode (by design), so this can only be checked in VIEW mode — on a
published page or a scratch page. The QA process forbids the agent from publishing QA pages.

## Testing checklist (when picked up)

- [ ] TSMO home `?year=2026` (after publish): 2214591/2214592 gone, no empty boxes; `?year=2025`
      they render normally; the hero row doesn't jump height between years.
- [ ] A MitigateNY county page with a bordered `hideIfNull` Card and no data: box gone, neighbours
      stay put.
- [ ] Edit mode unchanged (hidden sections still visible to authors).
