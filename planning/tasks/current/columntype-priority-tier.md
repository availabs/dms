# New columnType: `priority_tier` — ranked, editable tier pill

**Status:** LIBRARY CODE COMPLETE — awaiting orchestrator live verification + page wiring
**Topic:** ui (columnTypes)
**Driver:** MitigateNY Action Prioritize redesign, Phase 3 #1
(dms-template task `planning/tasks/current/mny-action-prioritize-v2-live-build.md`).

## Objective

Add a new column type `priority_tier` that renders a **ranked tier pill**: a small rank **numeral
badge** + a **short label**, editable in view (pill in view, single-select dropdown on edit), with a
distinct **"Set priority" affordance for the empty/unset value** (so unset rows are still clickable —
the plain `status_pill` returns `null` for empty, which makes unset cells blank AND uneditable, and
its `rounded-full` wrapper turns long tier strings into blobs — see the reverted Phase-2 attempt).

This is the `Actions_Revised.county_priority` cell: values are the long strings
`"Tier 1 – Top Implementation Priority"` … `"Tier 4 – Long-Term/Opportunistic"`, plus unset
(`""` / `"Please Select..."`). The design shows: a filled numeral circle (1=amber → 4=pale steel) +
a short label (e.g. "Top Implementation Priority"), and a dashed "Set priority" chip when unset.

## Why a new columnType (not extend status_pill / not a component)

Per `src/themes/CLAUDE.md` decision ladder: the look **depends on the value** and needs a small,
focused renderer that maps value → rank + short label — rung-3 column type, exactly like
`statusPill.jsx`. It reads ONLY its own value. Not a section component (way too small); not a
`status_pill` extension (that type's contract is a dotted status pill and returns null when empty).

## Pattern to follow

Model on **`src/dms/packages/dms/src/ui/columnTypes/statusPill.jsx`**:
- `StatusPillEdit` reuses `MultiSelectEdit` with `singleSelectOnly` and renders each option via `meta`
  as a React element — copy this so the tier pill stays editable with pill-looking options.
- Registered in `ui/columnTypes/index.jsx` (add `import { PriorityTierEdit, PriorityTierView }` +
  `const priority_tier = { EditComp: PriorityTierEdit, ViewComp: PriorityTierView }` + a registry key
  `'priority_tier': priority_tier`).
- Fast-Refresh: the `.jsx` exports ONLY the two components (named). No non-component exports.
- Theme via `ThemeContext` — reuse the mny `theme.pill` `tier_1..tier_4` / `tier_unset` styles already
  defined in `src/themes/mny/theme.js` for the pill colours where possible; the numeral-badge +
  short-label LAYOUT is structural (rendered by the component). If a small theme namespace is cleaner,
  add `theme.priorityTier` with sensible library defaults (a `.theme.js` sibling registered in
  `ui/defaultTheme.js`), and let mny override — but do NOT hardcode brand colours in the component body.

## Column attributes (author-configurable)

- `options`: `[{label, value}]` — the tier values (already on the county_priority column).
- `rankFrom` / `tierRank`: map value → integer rank for the badge. Default: parse a leading
  `"Tier <N>"` out of the value; fall back to index in `options`.
- `shortLabel`: map value → short label for the pill text (e.g.
  `"Tier 1 – Top Implementation Priority"` → `"Top Implementation Priority"`). Default: strip a
  leading `"Tier N – "` / `"Tier N - "` prefix.
- `pillColors` / style map: value → a `theme.pill` style name (e.g. `tier_1`), OR derive from rank
  (rank 1→tier_1 … 4→tier_4). Unset → `tier_unset` styling as a dashed "Set priority" chip.
- `allowEditInView`: honour it exactly as `status_pill` does (view = pill / dropdown on click).

## Empty / unset handling (the key requirement)

- View: when the value is empty or the sentinel `"Please Select..."`, render the **dashed "Set
  priority" chip** (a clickable affordance), NOT `null`.
- Edit: the dropdown lists the tiers + a "Not Prioritized"/clear row; picking persists a clean scalar
  string (as `status_pill` does).

## Files

- **New:** `src/dms/packages/dms/src/ui/columnTypes/priorityTier.jsx` (exports `PriorityTierView`,
  `PriorityTierEdit`).
- Maybe **new:** `.../ui/columnTypes/priorityTier.theme.js` + register in `ui/defaultTheme.js` (only if
  a dedicated theme namespace is warranted; otherwise reuse `theme.pill`).
- **Edit:** `.../ui/columnTypes/index.jsx` (register the type).
- Optionally surface the new attrs in the Spreadsheet/Card column controls config if that's where
  column-type attributes are edited (check `spreadsheet/config.jsx` / `Card.config.jsx` for how
  `status_pill`'s `pillColors`/`options` are exposed; match that so authors can configure it).

## Backward compatibility

Purely additive: a new registry key + a new file. No existing type touched. Any column not set to
`type: 'priority_tier'` is unaffected.

## Testing checklist

Code-level (this task):
- [x] `priority_tier` registered in `ui/columnTypes/index.jsx` (key `'priority_tier'`); renderer built
      to draw a numeral badge (rank 1..N) + short label pill for a set value. Also surfaced in the
      Spreadsheet `Column Type` dropdown; Card's dropdown auto-derives from the registry.
- [x] Unset ("" / "Please Select...") renders a dashed `tier_unset` "Set priority" chip via UI.Pill
      with an `onClick` passthrough (clickable affordance, NOT null).
- [x] Edit reuses `MultiSelectEdit` with `singleSelectOnly` + per-option `meta` pills, mirroring
      `StatusPillEdit`; short label strips the leading `"Tier N – "/"Tier N - "` prefix and is
      rendered with `truncate` (whitespace-nowrap) so long tier strings never wrap into blobs.
- [x] Fast-Refresh clean: `priorityTier.jsx` exports ONLY `PriorityTierView` + `PriorityTierEdit`;
      helpers/defaults are non-exported module consts (matches `verdictDot.jsx`). No brand hex in the
      component — outer pill uses `theme.pill` `tier_*` styles; badge tints are neutral Tailwind
      defaults in `priorityTierDefault`, overridable via `theme.priority_tier`.
- [x] `eslint` on new/edited files: no new errors introduced. Only the repo-wide `react/prop-types`
      convention warnings that every sibling columnType (statusPill/verdictDot) already emits.

Live verification (ORCHESTRATOR, after wiring page 2262755 / section 2262760 column `county_priority`):
- [ ] Set value renders numeral badge + short label pill.
- [ ] Unset chip is clickable and opens the editor.
- [ ] `allowEditInView:true` → click opens single-select dropdown; picking a tier persists and
      re-renders the pill; picking the "Please Select..." row clears back to the "Set priority" chip.

## Notes

The consuming page is dms-template page **2262755**, Spreadsheet section **2262760**, column
`county_priority`. Wiring that column to `type:'priority_tier'` (+ the attr maps) is done by the
ORCHESTRATOR after this type ships — not part of this task. Do NOT publish anything; do NOT edit the
dms-template page here. This task is the library type only.
