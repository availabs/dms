# Design-system icon set — capture, audit, and sync to the live theme

> Brand-agnostic DMS design-system tooling + skill work. Origin: building the freight-atlas pages, whose
> mockups use many inline SVGs absent from the theme's named icon registry, so they can't be referenced by
> name when authoring DMS pages. First consumer/fill: the TransportNY (`transportnyv2`) icon set.

## Objective
A repeatable, checkable flow that keeps a brand's icon set complete and in sync across the three layers:

```
design PAGES (mockups)  →  design-system REGISTRY + CATALOG  →  live THEME registry
  inline <svg> tagged        theme/icons.js (name→path) +         icons.jsx (name→React)
  <!-- icon: Name -->        theme.html #icons grid               read as theme.Icons
```

Outcome: **every `<svg>` in a design page is a named icon that exists in the set**, and the live theme
registry is **generated/synced** from the design-system registry (no more manual copy).

## Current state (what exists — see assessment below)
- **Live registry** `src/themes/<brand>/icons.jsx` — name→React-component map, exported `theme.Icons`
  (themev2.js l.1861 for transportny: 48 icons). Resolved by the `Icon` component, the lexical **`icon`
  node**, sidenav glyphs, card `iconStyles` chips. A name not present renders nothing.
- **Design-system registry** `…/dms_design_system_v2/theme/icons.js` — **byte-identical** to the live
  `icons.jsx` today (diff = 0): the "sync" is currently a *manual copy*.
- **Catalog** theme.html `#icons` — names each icon with the `<!-- icon: Name --><svg>…` convention
  ("names are the API").
- **`theme/icons/README.md`** — states a *future* intent for standalone kebab `.svg` files; "not yet generated".
- **Existing skill coverage is informal:** `translating-design-system-to-dms-theme.md` §"Wire up the icons"
  (l.131) says "inline-pasted SVGs in the mockups become React components in `theme/icons/`, registered in
  `theme/icons.js`" — a hand process, no audit, no sync-to-live, no page-naming gate.
  `designing-a-dms-design-system.md` mentions the brand "ships an icon set" but not the capture/audit discipline.

## The gap
Mockup **pages draw icons as raw, unnamed inline `<svg>`** — freight-atlas Home 24 · Gallery 19 · About 19
(~32 distinct paths), many **not in the registry**: 5 mode glyphs (Road/Rail/Maritime/Air/Pipeline),
sidenav surface glyphs (home/atlas-layers/grid/chart/database/book), About/get-involved (file/people/
location-pin/plus/envelope). Unnamed → unusable by name + unauditable.

## Proposed changes

### 1. Convention (keystone)
Every `<svg>` in a design page (`…/pages/*.html`) and the catalog carries a `<!-- icon: Name -->` tag
(the convention the catalog already uses). No raw, unnamed SVGs in pages. This makes pages auditable and
gives the live page-build a name to reference.

### 2. Audit script — `scripts/icons-audit.mjs` (generic, brand arg)
Scan `pages/*.html` + the catalog for `<!-- icon: Name -->`; cross-check each against the brand's
`theme/icons.js`. Report (a) page SVGs missing a name tag (raw), (b) named-but-unregistered icons. Exit
non-zero on gaps so it can gate CI. This is the "the set covers the design" check.

### 3. Capture missing icons
For each gap: name it (PascalCase registry name + kebab file), add the `<path>` to `theme/icons.js` + a
tile in the theme.html `#icons` catalog, and replace the page's inline SVG with the canonical path under
`<!-- icon: Name -->`.

### 4. Sync script — `scripts/icons-sync.mjs` (generic, brand arg)
Generate the live `src/themes/<brand>/icons.jsx` from the design-system `theme/icons.js` (one command,
diffable; CI check "fail if `icons.jsx` ≠ generated"). Optionally also emit the standalone
`theme/icons/*.svg` files the README describes (extract each path → kebab `.svg`). **Source of truth:
design-system `icons.js` → live `icons.jsx` (generated).** ⟵ confirm direction before building.

### 5. First consumer — TransportNY freight-atlas (proves the flow)
Inventory `freight-atlas-{home,gallery,about,map,insights,data,dataset}.html`; map each icon to a registry
name or add it (modes ×5, sidenav surfaces, doorway/report/get-involved); annotate page SVGs; sync to
`transportnyv2`'s `icons.jsx`; then the live DMS pages can use the named icons (sidenav, card chips, lexical
`icon` node).

## Skills — create + integrate (explicit)
- **CREATE a new skill** `managing-design-system-icons.md` — the icon-set lifecycle end to end: the
  `<!-- icon: Name -->` convention, the registry (`theme/icons.js`) + catalog (theme.html `#icons`) +
  standalone `.svg` shape, the **audit** and **sync** scripts, the source-of-truth direction, and the
  add-an-icon recipe. Add to `skills/README.md` index (Theming section).
- **INTEGRATE into `designing-a-dms-design-system.md`** (the design-system authoring skill): elevate the
  icon set to a first-class deliverable — every page `<svg>` must be a named set icon (`<!-- icon: Name -->`),
  the set must cover all page icons (run the audit), the catalog is the index. Cross-link the new skill.
- **INTEGRATE into `translating-design-system-to-dms-theme.md`**: replace the informal §"Wire up the icons"
  hand-paste step with "run `icons-audit` (gaps → fill the design-system registry), then `icons-sync` to
  generate the live `icons.jsx`" — mechanical + CI-checkable. Cross-link the new skill.

## Files requiring changes (anticipated)
- `scripts/icons-audit.mjs`, `scripts/icons-sync.mjs` (new, generic).
- `src/themes/transportny/TransportNY Design System/dms_design_system_v2/theme/icons.js` (+ catalog
  theme.html `#icons`) — add captured freight-atlas icons.
- `src/themes/transportny/icons.jsx` — generated by the sync (no longer hand-edited).
- `src/themes/transportny/.../pages/freight-atlas-*.html` — `<!-- icon: Name -->` annotations.
- `src/dms/skills/managing-design-system-icons.md` (new) + `skills/README.md` index;
  edits to `designing-a-dms-design-system.md` + `translating-design-system-to-dms-theme.md`.

## Testing checklist
- [ ] `icons-audit` reports 0 gaps for the freight-atlas pages after capture; fails (non-zero) when a raw/unregistered icon is introduced.
- [ ] `icons-sync` regenerates `transportnyv2` `icons.jsx` identical to a hand-verified expectation; CI check catches drift.
- [ ] Live freight-atlas pages render the new named icons (sidenav, card chips, lexical `icon` node) — no blank icons.
- [ ] New + updated skills land; `designing-a-dms-design-system.md` and `translating-…` reference the flow; index updated.
- [ ] BC: existing named icons unchanged; other brands (tessera/wcdb) unaffected until they opt into the audit.

## BC / scope
Purely additive — new registry entries + scripts + skills; no change to existing icons or runtime behavior.
Build the scripts brand-agnostic (tessera/wcdb want the same), even though transportny is the first fill.

## Resolved
- **Source of truth = the design system** (`theme/icons.js`); live `icons.jsx` is **generated**. (User.)
- Scripts built **generic** (brand-keyed `BRANDS` map), transportny first.

## Status — DONE (2026-06-09) for scope: mechanism + skills + all freight-atlas pages
`icons-audit --pages freight-atlas` → **7 pages · 109 icon refs (30 distinct) · 17 decorative · 0 untagged ·
registry 64 icons**. `icons-sync --check` green. Runtime verified (`/edit/home` 200).
- [x] `scripts/icons-sync.mjs` — generates live `icons.jsx` from design-system `theme/icons.js` under a
      "GENERATED" banner; `--check` CI guard. Verified: body identical to source; `--check` green.
- [x] `scripts/icons-audit.mjs` — `<!-- icon: Name -->` / `<!-- decorative -->` convention; reports
      untagged svgs + unknown names; non-zero on gaps. Brand-keyed.
- [x] **Skill `managing-design-system-icons.md`** written + indexed; **integrated** into
      `designing-a-dms-design-system.md` (icon set = first-class deliverable, run the audit) and
      `translating-design-system-to-dms-theme.md` (§"Wire up the icons" → audit+sync, generated `icons.jsx`).
- [x] **All 7 freight-atlas pages captured & green.** 15 new icons registered across the set:
      Road · Rail · Maritime · Air · Pipeline · House · Atlas · Book (home), then FileText · Users · Archive ·
      Mail · Locate · Maximize · Code (about/map/insights). All `freight-atlas-*.html` svgs tagged
      (icon/decorative); synced (registry 48→64).

## Legacy backfill — DONE (2026-06-09, transportny)
All 12 non-freight TransportNY design pages tagged (landing, login, docs-overview, work-zones, congestion,
floating-car, getting-started, map-21, map-21-system-performance, map-21-trend, employment-estimates,
employment-estimates-mpo). 3 more new icons registered — **Building · Map · Export** (registry 64→67).
**Full-repo `icons-audit --brand transportny` is GREEN**: 19 pages · 255 icon refs (43 distinct) ·
50 decorative · 0 untagged. `icons-sync --check` green; runtime 200. Ambiguous one-off glyphs (sparklines,
chart/map art, status dots, the docs widget, a couple of legend markers) tagged `<!-- decorative -->`.

## Optional follow-ups (out of scope; flow is built for them)
- [ ] Emit standalone `theme/icons/*.svg` from `icons-sync` (per `theme/icons/README.md`).
- [ ] Add `icons-sync --check` to CI / a precommit hook.
- [ ] Wire the *live* freight-atlas DMS pages to the named icons (sidenav glyphs / card icon-chips / lexical
      `icon` node) — the built pages use text/cards, so this is a rendering follow-on, not required by the audit.

## Assessment (background)
3-layer architecture + the gap, as investigated 2026-06-09: design-system `icons.js` ≡ live `icons.jsx`
(manual copy); pages use ~32 distinct unnamed inline SVGs; registry has 48 named icons. The fix is the
convention + audit + sync above, captured as a skill and wired into the design-system skills so every
future brand inherits the discipline.

## Progress log
- 2026-06-09 — Task created (full task; moved here from a transportny assessment stub). Skills to create/
  integrate identified.
- 2026-06-09 — Source of truth confirmed (design system). Built `icons-sync` + `icons-audit` (generic);
  wrote + indexed `managing-design-system-icons.md`; integrated into the designing + translating skills.
  Captured the Home page (8 new icons, tagged, synced, audit-green). Remaining: capture the other 6
  freight-atlas pages (same recipe) + optional CI/`.svg`-emit/live-page icon wiring.
