# DMS Skills

Self-contained how-to documents for common authoring tasks in the DMS. Each skill is a short, action-oriented recipe — read it once, do the thing, link out for deeper context.

Skills sit alongside `planning/` (work tracking) and `documentation/` (reference material) but with a different purpose: **skills tell you how to accomplish a specific outcome**, end-to-end, in the project's idioms.

## Reading order for a new contributor

If you're new to DMS and want to design or theme a brand, read in this order — the topical index below is good for lookup, but new readers fumble without a sequence:

1. **[`designing-a-dms-design-system.md`](./designing-a-dms-design-system.md)** — the structural grammar (Site → Layout → LayoutGroup → Section → Component), the deliverable shape (`design-system/` + `pages/` + `_shared.css`), and the implementation rules (plain HTML + Tailwind CDN, no build step). Start here.
2. **[`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md)** — how the completed HTML/CSS design system becomes the runnable `theme.js` overlay. Has a top-of-file "if you take nothing else" callout with the 3 gotchas every translation hits.
3. **[`card-layout.md`](./card-layout.md)** — the workhorse primitive's full surface. Read before configuring any non-trivial Card section.
4. **[`creating-page-section-components.md`](./creating-page-section-components.md)** — when a primitive genuinely doesn't exist and you need a new one. Bar is high; this skill exists to keep it high.
5. **[`creating-pages-from-a-design-pattern.md`](./creating-pages-from-a-design-pattern.md)** — taking a completed design system and instantiating real pages in a live DMS pattern via the CLI.
6. The **recipes** below (now-airing card, audio-player upload) — read when the use case comes up.

## Index

### Building components

- [Creating a page-section component](./creating-page-section-components.md) — when you need a new section type (Card, Spreadsheet, Header, etc. are page-section components). Walks through the file split (`Foo.jsx` + `Foo.config.{js,jsx}` + `Foo.theme.js`), the registry entry shape, the EditComp/ViewComp contract, theme wiring, and Fast-Refresh rules.
- [Transcribing a design card into a DMS card](./transcribing-a-design-card-to-dms.md) — the disciplined loop for matching a live `Card` to a single design mockup: (1) inventory the mockup into atoms, (2) map each atom with the **decision ladder** (static text → `valueFontStyle`; numeric → `formatFn`; **look depends on the value → a small column type**; arrangement → Card `display`; only a layout the grid can't express → a new section), (3) build authorable atoms first then ledger primitives, (4) **verify with Playwright** — includes a from-zero Playwright primer and the `scripts/card-shot.mjs` mockup-vs-live screenshot helper. Has the crisp column-type-vs-extend-the-component test.

### Theming

- [Designing a DMS-compatible design system (HTML + Tailwind)](./designing-a-dms-design-system.md) — the structural grammar (Site → Layout → LayoutGroup → Section → Component) and the visual deliverable: `design-system/` (four docs pages) + `pages/` (theme-chosen examples) + `_shared.css`. Mockup pages must be **plain HTML + Tailwind Play CDN, no JSX, no build step**. Lookup table for finding each primitive's source-of-truth `.theme.{js,jsx}` file. Worked examples in `src/themes/transportny/.../dms_design_system/` and `src/themes/tessera/design_system_v2/`.
- [Managing a design system's icon set (capture · audit · sync)](./managing-design-system-icons.md) — keep a brand's icon set complete across the three layers: design **pages** use only **named** icons (the `<!-- icon: Name -->` / `<!-- decorative -->` convention), the design-system **registry** (`theme/icons.js`) is the source of truth + the **catalog** (theme.html `#icons`) is the index, and the **live theme** `icons.jsx` is **generated** from the source. Two brand-keyed scripts: **`icons-audit.mjs`** (every page svg is named + in the registry; CI gate) and **`icons-sync.mjs`** (source → live, `--check` for CI). Add-an-icon recipe + the "name not in registry renders nothing" gotcha. Worked example: the freight-atlas mode/surface glyphs.
- [Translating a design system into a DMS theme](./translating-design-system-to-dms-theme.md) — taking a completed design-system folder and producing the runnable `theme/theme.js` overlay (plus `icons.js`, `tailwind.additions.js`, `index.css.additions`). Covers the `options/styles` conventions, sparse overrides, theme merging, and a per-primitive key checklist sourced from `src/dms/packages/dms/src/ui/components/*.theme.{js,jsx}`. Includes the TopNav/SideNav-keys gap that the first Tessera pass tripped on, as a worked example of why invented keys silently no-op.

### Layout reference

- [Card section layout](./card-layout.md) — every layout knob on the `Card` section: the two grids (cards-grid + cells-grid), `cellSpan`/`cellRowSpan`, image/link/format cells, `cardHints` (`fullBleed`, `spanFullColumns`), the `row` prop available to composite column types, and recipes for stat strips / 3-up record cards / composite "owns its own layout" cells. Read before configuring any non-trivial card.

- [Authoring graphs (avlGraph / graph2)](./authoring-graphs.md) — building/styling chart sections: the `avlGraph` data model (`target: xAxis|yAxis|categorize`, multi-series), the **theme-vs-settings** split (`theme.avlGraph.chartDefaults` brand defaults merged under per-section `display`), and the recurring patterns — a **target/reference line is just a second `yAxis` series with `step` interpolation from a joined target column** (not a bespoke feature), and the **header + hero-stat** card above a chart. Notes the open avlGraph calc-column binding gotcha + the planned theme-token/interpolation work.

### Authoring at the pattern level

- [Adding an in-page-nav rail ("on this page" sidebar)](./adding-an-in-page-nav-rail.md) — give a page a sticky, themeable rail that lists its sections as scroll-spy jump links and can host authored "related" content. Covers the four moving parts (`item.sidebar` toggle, per-section `navLabel`/`anchorId` opt-in decoupled from title/level, a `sidebar` section group for custom content, the `pages.sectionGroup` theme keys), the CLI recipe, the data-model note (`navLabel` lives on the hydrated component row; draft-only → shows in edit mode), band-gating, and the **content↔rail column layout lives in the pages theme, not the shared `layoutGroup`** (with the `items-stretch`-or-sticky-breaks gotcha).
- [Authenticating the DMS CLI (and Playwright)](./authenticating-the-dms-cli.md) — mint a session token so the CLI can do `site tree` / `page list` / writes (these return `no-access` unauthenticated, though a bare `raw get <id>` works tokenless on local dev). Login is a plain `POST {API_HOST}/login {email,password,project}` → `{user:{token}}`; export it as `DMS_AUTH_TOKEN` for the CLI, or write a Playwright `storageState` via `scripts/mint-token.mjs` for screenshot scripts. Tokens expire ~6h; dev creds `availabs@gmail.com`/`test123`. Read this first if any CLI command says `no-access`.
- [Implementing an auth login (sign-in) page from a design system](./implementing-an-auth-login-page.md) — the login/signup page is the **auth pattern** (a fixed `authLogin.jsx` component styled via theme), **not** a CLI section build. Covers the surface the component actually reads (`theme.auth.authPages.sectionGroup.default.*` — not any drafted `auth.login.*`), how inputs/labels come from the global `field`/`input` themes, the `className`-replaces-style submit-button quirk, the AuthLayout + LayoutGroup `auth` frame (and avoiding a double-card), the fact that the compact sidenav rail is **pattern config not theme**, the Playwright verify loop, and the #1 gotcha (form renders base defaults until the pattern's `selectedTheme` points at your brand theme). Ends with the theme-vs-component boundary and a worked TransportNY example.
- [Creating pages from a design pattern via the DMS CLI](./creating-pages-from-a-design-pattern.md) — taking a completed design system (or a set of design mockups) and instantiating the corresponding pages + draft sections inside a live DMS pattern. Covers `dms page create` / `dms section create --data`, the `element-data` JSON-string gotcha, the Lexical state shape, when a `Card` placeholder is the right call vs a real data binding, and the **draft-only discipline** (this skill never publishes — humans run `dms page publish`). Worked example: `scripts/seed-tessera-pages.mjs` seeds the 12 Tessera design-system pages into `app=tessera, pattern=main|main:pattern`.

### Recipes — configured sections (no new component needed)

- [Creating interactive DMS pages](./creating-interactive-pages.md) — page variables (URL search params via `PageContext`) + the dataWrapper filter system: a `Filter` control writes a `searchParamKey`; data sections react via `usePageFilters` leaves (`applyPageFilters`); `includePriorPeriod` + GROUP BY/`lag()`/formula for year-over-year deltas; how to make a section ignore the variable. Worked refs: pages 2173049 and 2173915 (MAP-21 single-page report).
- [Using a dataWrapper-backed Card section](./using-a-datawrapper-card.md) — how to create a Card (or any other `dataWrapper`-consuming section: Spreadsheet, Graph, FilterComponent, …) that's bound to a real Source. Two recipes: (A) reuse an existing card's `externalSource` verbatim and only swap `columns`/`filters`/`display`; (B) bind to a Source from scratch, with the **always-confirm-source-and-version-with-the-user** rule for pgEnvs and dmsEnvs. Inline element-data shape, parent-string + JSON-string gotchas, draft-only discipline.
- [Live cross-view joined section](./live-cross-view-joined-section.md) — bind a section to **two views joined in-engine** (a value/filter/sort column that spans two sources), staying a live `fetchMode:'smart'` binding (no seeding). The element-data top-level `join` shape (`sources`/`joinColumns`/`sourceInfo`), alias-prefixed columns (`ds.col`/`meta.col`), and the four load-bearing gotchas: **both views must be the same query engine** (no CH↔PG join), **`sourceInfo.columns` is required or `/edit` crashes the page**, **pin the metadata version column** or the join fans out, and **engine-correct SQL** (CH `intDiv`/`leftPad` vs PG `lpad`/`::numeric`). Worked example: the TSMO Corridor View live time-space speed grid (npmrds 982 ⋈ meta 983).
- [Currently-active row card (WCDB schedule "Now Airing")](./now-airing-card.md) — render the row whose `[start_at, end_at]` interval contains `now()`. Per-pattern data shape with day-of-week + time-of-day columns, calc-column projection to absolute timestamptz, `op:'time'` `kind:'instant'` filter with `compareEnd`. The pattern works for any "currently happening" feed (event calendars, live indicators, on-call rotations).
- [Uploading GIS & tabular datasets to a pgEnv (headless)](./uploading-gis-and-tabular-datasets.md) — ingest a GeoPackage/Shapefile/GeoJSON (`gis_dataset`) or CSV (`csv_dataset`) into a DaMa `pgEnv` as a real **source + view + table** over HTTP (no UI), so Card/Spreadsheet/Graph/Map sections can bind to it. The full `dama-admin` sequence (new-context-id → `gis-dataset/upload` → layerNames → layerAnalysis → tableDescriptor → `{gis,csv}-dataset/publish` → poll `events/query`), the upload + publish payloads, a dependency-free node script skeleton, and the **never-hand-write-`data_manager.*`** (orphan-table) rule. Worked example: the employment_estimates v4 datasets → `npmrds2`.
- [Uploading a song file and adding an Audio Player section](./uploading-a-song-and-audio-player.md) — end-to-end: `POST /dms-admin/:app/file_upload` to append a new view (file_upload source), then `dms section create` an `Audio Player` section bound to the returned `dl_url`. Covers resolving `owner_id`/`owner_instance` from the dmsEnv, the section's stringified-JSON `element-data` shape `{title, audioUrl}`, and the section_group / parent-ref gotchas. Worked example: `asm+nhomb` Songs source → demos page.

## How skills are organized

- **One skill per file.** The skill should answer one specific question ("how do I add a new section type?", "how do I make a 'currently active' card?").
- **Self-contained.** A reader shouldn't have to chase three other docs to follow along. Inline the load-bearing snippets; cross-link the rest.
- **Actionable.** Lead with the steps. Background and "why" come after, not before.
- **Examples from the repo.** Skills should reference real files, not invented ones — that way they stay verifiable.

## When NOT to write a skill

- The task is too narrow to recur (one-off migration script).
- The information already lives in `CLAUDE.md` (project conventions) or `documentation/` (reference). Skills layer on top of those, they don't duplicate them.
- The pattern hasn't been used yet — skills capture proven patterns. New patterns start as task documents in `planning/tasks/current/` and graduate to skills after a real use case ships.

## Adding a new skill

1. Pick a clear outcome-oriented title ("Creating X", "Configuring Y", "Migrating Z").
2. Write the file in `src/dms/skills/<kebab-case-title>.md`.
3. Add an entry to the Index above with a one-line hook.
4. Cross-link from any task documents that motivated the skill (and from `CLAUDE.md` / `documentation/` where relevant).
