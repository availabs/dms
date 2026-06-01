# Theme UI.Pill (design-system contract) + dot support

**Topic:** ui (the `UI.Pill` primitive — `ui/components/Pill.{jsx,theme.js}`)
**Status:** DONE & verified. The interstate card status pill now renders the
card-design "● MEETS TARGET" (green bordered tint + dot + uppercase mono) via the
full pipeline. Page integrity intact (8 sections).

## What shipped (aligned to the EXISTING themev2 model)
themev2 already had a 15-variant `pill` theme (the design-system contract) using a
**named-style + `wrapper`** model (activeStyle selects a variant; status dot via
`[&::before]`). Conformed to it rather than inventing a competing colors-map:
- `Pill.jsx`: now theme-driven — `getComponentTheme(theme,'pill', activeStyle ?? color)`
  → renders the style's `wrapper`. Legacy `color` prop still works (color names
  double as style names), so all ~15 admin callers are unchanged in shape.
- `Pill.theme.js`: default named styles (`default/gray/orange/blue/green/red` +
  generic dotted `status_*`) reproducing the historical look → **BC** for any site
  without a `pill` override; `status_*` lets the built-in `status_pill` work anywhere.
- `defaultTheme.js`: registered `pill: pillTheme`.
- `themev2.js`: updated the existing `pill.status_good/warn/bad/na` variants to the
  **card design** (bordered tint + ::before dot + uppercase mono). (Removed an
  accidental duplicate `pill` key I'd added.)
- `statusPill.jsx`: selects `status_good/warn/bad/na` by value keyword (or
  `attribute.pillColors` override); dot comes from the variant, no separate prop.
- `components.html`: status pills updated to the card-design treatment.
- transportny admin chrome pills (color=blue/green/orange) map onto themev2's
  bordered variants (orange/gray fall back to default) — brand-consistent, no dot.

## Objective

Bring `UI.Pill` up to the contract the design system already documents but the code
never implemented — `theme.pill.styles · Pill.theme.js · 15 variants`
(components.html:744). Today `Pill.jsx` hardcodes its colors inline (orange/blue/
green/gray), `Pill.theme.js` only exports `docs`, and `pill` isn't registered in
`defaultTheme.js`. Make the pill **theme-driven**, add **dot** support, set the
transportny pill to the **card-design** look (bordered tint + leading dot + uppercase
mono, color-coded), and flow it through to the `status_pill` column type → the KPI
card. Also update the design-system `components.html` pill section to that look.

## The three pills (why this came up)
- **Current `UI.Pill`:** `bg-green-500/15 text-green-700` — plain tint, no border/dot.
- **components.html status variants:** dot + text only (no bg/border).
- **Card design (preferred):** `border border-[#10B981]/30 bg-[#10B981]/10
  text-[#065F46] font-mono text-[10px] uppercase tracking-[0.16em]` + a `size-1.5`
  dot — bordered, tinted, uppercase, color-coded.

## Backward compatibility
- **`Pill.jsx` themeable (dms-core): BC.** The default `Pill.theme.js` reproduces the
  *current* hardcoded look (orange/blue/green/gray + the `red` added earlier) as
  `styles[0]`, so every site without a `pill` theme override renders exactly as now.
  Adding the `dot` prop is opt-in (default off → no change).
- **themev2 `pill` = card design (transportny theme): intentional restyle.** This is
  the user's brand request ("theme pills all the way through"). Side effect: existing
  transportny **admin chrome pills** (toolbar move/copy/paste, ColumnManager
  Add/Remove/Duplicate, +Formula/+Calculated) adopt the brand pill (bordered tint +
  uppercase mono; **no dot** — they don't pass `dot`). Brand-consistent, not a
  regression. Flagged for the user; trivially scoped to a named style if unwanted.

## Implementation
- `ui/components/Pill.jsx`: read `getComponentTheme(theme,'pill',activeStyle)`; props
  `color` (→ variant), `text`, `dot` (bool), `activeStyle`. Render
  `wrapper > pill(+colors[color].pill) > [dot] + text`. Fallback to local
  `pillTheme.styles[0]` so it works outside a theme tree.
- `ui/components/Pill.theme.js`: export `pillTheme = {options,styles:[{name:'default',
  wrapper, pill, dot, colors:{orange,blue,green,red,gray}}]}` reproducing today's look.
- `ui/defaultTheme.js`: register `pill: pillTheme`.
- `themev2.js`: `pill` styles = card design (colors green/red/amber/blue/slate/gray;
  orange→amber map for admin pills; bordered + uppercase mono + dot classes).
- `ui/columnTypes/statusPill.jsx`: pass `dot` so the status pill shows its dot.
- `components.html`: update the `data-dms-section="pill"` status variants to the
  card-design bordered+dot+uppercase look.

## Testing checklist
- [ ] Default theme (catalyst/base): existing pills render unchanged (BC).
- [ ] transportny status_pill on the KPI card: bordered green "MEETS TARGET" + dot
      (loop); red for below.
- [ ] transportny admin pills still legible (brand bordered/uppercase, no dot).
- [ ] `npm run lint` clean; Fast-Refresh-safe (Pill.jsx components only, theme in .theme.js).
- [ ] dev restart noted (themev2 `pill` is a code-theme change → needs restart).
