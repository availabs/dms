# MAP-21 KPI column types: status_pill, target_bar, delta

**Topic:** ui (built-in column types in `ui/columnTypes/`)
**Status:** DONE & verified — `status_pill`, `delta`, `target_bar` all shipped as
**built-in** column types (not theme-registered — the user chose built-in for reuse),
plus a `percent` formatFn. All four §01 KPI cards (interstate / non-interstate / truck
/ PHED) render and match the mockup via the loop; page integrity intact (8 sections).

## What shipped (built-in column types)
- **`status_pill`** (`ui/columnTypes/statusPill.jsx`) — renders the value as a
  `UI.Pill` status variant (good/bad/warn/na) by keyword or `pillColors` override.
  Themed via the now-themeable `UI.Pill` (see `theme-ui-pill.md`).
- **`delta`** (`delta.jsx`) — signed arrow + value, colored by `deltaGoodDirection`
  ('up'|'down'), with a "vs <year-1>" suffix from `deltaYearField`. Local default
  theme matches the mockup; overridable via `theme.delta`.
- **`target_bar`** (`targetBar.jsx`) — progress bar + target marker + "≥/≤ target"
  caption; range-scaled via `barMin`/`barMax` (ratio metrics like TTTR use 1.0–2.2),
  `barDirection` flips ≥/≤ and meets-color, `barUnit` for the caption.
- **`percent` formatFn** (utils.jsx + Card.config dropdown) — appends `%`.

## Key gotchas learned (fed into the skills)
- A **formula column can't just be retyped** to `delta` — the formula AST only
  computes when `type==='formula'`; switching its type leaves its UUID `name` as
  invalid SQL → query fails → blank card. Make delta a **calculated column** (raw SQL
  `round(metric − prior, N)`).
- **`origin:'static'` columns trigger "Error getting length"** here (no UDA request
  built). Use **SQL-literal calculated columns** (`'UZA measure' as x`) instead.
- **Hand-built column objects miss fields `createRequest` needs** → empty query.
  **Clone a working column** and override `name`/`type` (the PHED build does this).
- Per-card config: interstate (75, up, 0–100, %), non-int (70, up, 0–100, %), truck
  (2.0, down, 1.0–2.2, no unit, 2dp delta).

## PHED card (lexical → Card) — DONE
Section **2173922** converted from `lexical` to a data-bound **Card**: gray
"UZA measure" `status_pill` (SQL literal), "Peak-hour excessive delay" title,
`to_char(round(sum("phed"))…) || ' hr/yr'` value (374,711,700 hr/yr live), and a
SQL-literal note. Reuses the KPI scaffold (source 2001/3394 + year filter).
**Deferred polish:** the mockup's dashed/slate "context" card chrome + the
"Urban congestion below →" link (would be a named `dataCard` style + a `link` column).

## Objective

Add the three value-driven visual primitives the MAP-21 KPI card mockup needs and
the current Card grid can't express (transcription decision-ladder rung 3 — "the
look depends on the value"): a **status pill**, a **target progress bar**, and a
**signed/colored delta**. Built as **theme-registered column types** in transportny
(`theme.columnTypes.<name>`), following the wcdb `portrait_banner` / `stream_player`
/ `now_indicator` precedent.

> **Backward compatibility:** these are **purely additive** — new entries in
> `theme.columnTypes` + new theme namespaces. No existing column type, card, or
> theme key changes. Nothing renders differently unless an author explicitly sets a
> column's `type` to one of these. So BC by default with no non-BC fork. (Per the
> primitive-change policy, this task exists for traceability; there's nothing to ask.)
>
> Tracked as one task because the three are a cohesive KPI-chrome set sharing the
> same registration mechanism and the same card. Split later if any one grows.

## Pattern (each column type)
- `src/themes/transportny/columnTypes/<name>.jsx` — `…View` + `…Edit` (components only).
  **Edit must render the visual too** — the transcription loop screenshots `/edit/`,
  so a no-op Edit would show blank in our verification.
- `<name>.config.js` — `{ EditComp, ViewComp, cardHints }` (default export).
- `<name>.theme.js` — class-string tokens (no Tailwind in markup).
- Register in `themev2.js`: `columnTypes.<name> = config` + `<themeKey>: <name>Theme`.
- ViewComp receives `value` (= `row[attr.name]`), `...attribute`, `row`. Keep it to
  one/two fields (rung-3 rule).
- **Theme registration is a code-theme change → needs a `npm run dev` restart** to
  appear (the columnTypes map is assembled at boot). Note for verification.

## Primitives

### 1. status_pill  — `[x] DONE & verified`
Verified live: interstate card shows a green "Meets target" pill (tone green for
meets; red wired for below via keyword + the new Pill `red` variant). Page integrity
re-checked after the edit session (8 sections intact).
**Decision (user):** this one is a **main/built-in column type** (reused a lot) and
**integrates with `UI.Pill`** — NOT theme-registered. So it lives in dms-core, not
transportny.
- **Files:** `ui/columnTypes/statusPill.jsx` (`StatusPillView`/`StatusPillEdit`,
  both render `UI.Pill`); registered in `ui/columnTypes/index.jsx` as `status_pill`
  (auto-appears in the Card type dropdown, which lists `Object.keys(columnTypes)`).
- **UI.Pill enhancement:** added a `red` color variant (additive named variant — not
  a passthrough) for the "below/fail" tone; Pill had orange/blue/green/gray.
- **Reads:** only its own `value`. **Tone:** `attribute.pillColors[value]` →
  keyword heuristics (meets/above → green, below/miss/fail → red) → gray fallback.
- **Wire:** interstate card 2173919 col "Status" (`status_text` CASE) →
  `type: 'status_pill'`, `hideHeader: true`.
- **BC:** built-in column-type addition + a new Pill color = purely additive.
- **HMR note:** built-in (not theme-registered) so it hot-reloads — no dev restart
  needed (unlike a `theme.columnTypes` registration).
- **Known gap vs mockup:** `UI.Pill` is a plain tinted badge (no leading dot, no
  border, sentence text) — won't pixel-match the mockup's dotted/bordered/uppercase
  pill. Closing that means *theming* `UI.Pill` (it's currently hardcoded inline);
  logged as a follow-up, not done here.

### 2. target_bar  — `[ ] todo`
- **Reads:** `value` (metric) + a sibling target field (via `row` or an attr key) +
  direction (higher/lower is better). **Renders:** the `≥75%` inline label + a
  progress bar with a target marker (mockup). Decide target-source wiring (sibling
  column name on the attr, e.g. `targetColumn`/`targetValue`).

### 3. delta  — `[ ] todo`
- **Reads:** `value` (the signed delta) + optional comparison label (prior year).
- **Renders:** `↑ +1.3` / `↓ −1.7` with arrow + sign + conditional green/red, plus a
  muted `vs <year>` suffix. Could be a `formatFn` instead, but conditional color +
  arrow + suffix is cleaner as a column type.

## Files
- `src/themes/transportny/columnTypes/{statusPill,targetBar,delta}.{jsx,config.js,theme.js}`
- `src/themes/transportny/themev2.js` — register the three under `columnTypes` + theme keys.
- Card wiring: interstate card 2173919 columns (then clone to 2173920/21).
- `src/dms/skills/card-layout.md` + `transcribing-a-design-card-to-dms.md` — document
  the new types once stable.

## Testing checklist
- [ ] `status_pill` renders green for "Meets target", red for "Below target" (loop).
- [ ] `target_bar` fill + marker match the mockup at value/target.
- [ ] `delta` arrow/sign/color correct for + and − values.
- [ ] Edit mode renders each visual (loop screenshots `/edit/`).
- [ ] Existing cards unaffected (additive — no column sets these types unless wired).
- [ ] `npm run lint` clean; Fast-Refresh-safe file split (.jsx components only).
- [ ] Back up page 2173915 before any edit-mode screenshot session (page-nuke rule).

---

## Addendum — `stat_value` (2026-06-13, TSMO home build)

Fourth member of the KPI family: `stat_value` renders a figure with an inline
figure-size `prefix` and a smaller muted `unit` suffix on one baseline
("$6.2 billion", "310.9 M veh-hrs", "80 %") — the design system's universal
stat pattern, inexpressible by one `valueFontStyle` (one token = one size) or a
`formatFn` (strings can't change size mid-cell). Files:
`ui/columnTypes/statValue.{jsx,theme.js}`, registered in
`ui/columnTypes/index.jsx`; themeable via `theme.statValue`; documented in
`skills/card-layout.md`. BC: purely additive. First consumer: tsmo2 Home hero
KPIs + doorway stats (page 1431215).
