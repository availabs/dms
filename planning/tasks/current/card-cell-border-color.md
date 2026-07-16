# Card cell enrichment: `cellBorderColor` — per-cell accent (left) border

**Status:** NOT STARTED
**Topic:** patterns/page (Card)
**Driver:** MNY Action Prioritize Phase 3 #3.
**Sequencing:** shares `Card.jsx` / `Card.config.jsx` with `card-active-on-search-param.md` — the
orchestrator will run these two SEQUENTIALLY, not concurrently.

## Objective

Add a per-cell **accent border** knob so a Card cell can show a coloured left rule (the stat-strip
look: `border-l-4 border-<color>`). Today the only per-cell colour knob is `cellBgColor`
(background). Add `cellBorderColor` as its exact sibling.

## Change (additive, opt-in, BC)

- New per-column attribute **`cellBorderColor`** (a colour string, same shape/control as
  `cellBgColor`). When set, the cell renders a left accent border in that colour (default width ~4px;
  a companion `cellBorderWidth`/side is optional but keep it minimal — left accent is the need).
- Compose it in the same place `cellBgColor` is applied to the cell style. Follow `cellBgColor`
  exactly: it is parsed in `Card.config.jsx` (~line 63–100, accepted alongside `cellSpan`/
  `cellRowSpan`/`cellBgColor`/`wrapText`) and exposed via a `ColorControls` control
  (`Card.config.jsx:309` — `key:'cellBgColor'`, `title:'Background Color'`). Add an analogous
  `ColorControls` entry `key:'cellBorderColor'`, `title:'Accent Border Color'`.

## Files

- `.../ComponentRegistry/Card.jsx` — apply the left border colour in the cell style composition
  (wherever `cellBgColor` becomes the cell's background).
- `.../ComponentRegistry/Card.config.jsx` — parse the attr + add the `ColorControls` control.

## Investigate before coding

- Exactly how `cellBgColor` flows: parsed in `Card.config.jsx`, carried on the column, applied as the
  cell background in `Card.jsx`. Mirror that path for `cellBorderColor`.

## Backward compatibility

Opt-in; unset → no border → existing cards identical.

## Testing checklist

- [ ] Setting `cellBorderColor` on a column renders a coloured left accent on that cell.
- [ ] Unset → no border (existing cards unchanged). `cellBgColor` still works alongside it.
- [ ] Control appears in the column toolbar next to Background Color. Fast-Refresh clean; lint passes.

## Notes

Consuming page: dms-template 2262755, Card section 2262757 (stat cells get per-status accent
colours). Wiring is the orchestrator's job. Do not edit the page or publish here.
