# Managing a design system's icon set (capture · audit · sync)

**Outcome:** keep a brand's icon set complete and consistent across three layers — the design **pages**
use only **named** icons, the design-system **registry** holds every icon, and the **live theme** registry
is generated from it (never hand-edited). So an author building a DMS page can reference any icon the
design uses by name (`theme.Icons[name]` — the `Icon` component, the lexical `icon` node, sidenav glyphs,
card icon-chips), and nothing silently renders blank.

```
design PAGES (mockups)            design-system REGISTRY + CATALOG       live THEME registry
  <!-- icon: Road --><svg…>   →   theme/icons.js  (name→SVG component)   →  icons.jsx  (GENERATED)
  <!-- decorative --><svg…>       theme.html #icons  (the visual index)     read as theme.Icons
        ▲ audit checks every svg is named + in the registry        ▲ sync copies source → live
```

**Source of truth is the design system** (`theme/icons.js`). The live `icons.jsx` is a generated copy —
edit the source, then sync.

## The convention (keystone)
Every `<svg>` in a design page carries a classifying HTML comment immediately before it:
- `<!-- icon: Name -->` — this svg **is** the registry icon `Name` (must exist in `theme/icons.js`).
- `<!-- decorative -->` — intentionally inline art (a chart, a map thumbnail, the docs-widget) — **not**
  an icon; the audit ignores it.

No raw, unclassified `<svg>` in a page. This is what makes the set auditable and the design buildable.

## The two scripts
- **`node scripts/icons-audit.mjs [--brand transportny] [--pages glob]`** — scans the brand's
  `pages/*.html`; for every `<svg>` requires an `icon:`/`decorative` tag; reports **untagged** svgs and
  **unknown** icon names (tagged but not in the registry); exits non-zero on any gap (gates CI / the
  design→theme workflow).
- **`node scripts/icons-sync.mjs [--brand transportny] [--check]`** — generates the live `icons.jsx` from
  the design-system `theme/icons.js` (verbatim under a "GENERATED" banner). `--check` writes nothing and
  exits 1 if the live file is out of sync (CI guard against hand-edits / stale registry).

Both are brand-keyed (a `BRANDS` map at the top: `source`/`live`/`pages`/`catalog` paths). Add a brand
there when its design system formalizes an icon set.

## Add-an-icon recipe (capturing a page icon)
When the audit reports an unknown name (or you're adding a page icon):
1. **Extract** the icon's inner SVG from the mockup (`<path>`/`<rect>`/… — keep it on the 24×24 grid,
   `stroke="currentColor"`, hairline). Multi-element icons wrap in a fragment.
2. **Register** it in the design-system source `theme/icons.js`:
   ```js
   const Road = svg(<path d="M3 12h18M6 12V7m12 5V7M9 12v5m6-5v5"/>);
   const Rail = svg(<><rect x="4" y="4" width="16" height="12" rx="2"/><path d="M4 11h16M8 20l2-4m6 4-2-4"/></>);
   // …then add the name to the exported `icons = { … }` object under a sensible group.
   ```
3. **Catalog** it: add a tile to the design-system `theme.html` `#icons` grid (copy an existing tile,
   swap the `<!-- icon: Name -->`, the inner SVG, and the label).
4. **Tag** the page svg(s): `<!-- icon: Name --><svg…>`.
5. **Sync + audit:** `node scripts/icons-sync.mjs --brand <b>` then `node scripts/icons-audit.mjs --brand <b>`
   → green.

Naming: PascalCase registry name; depict the glyph (`Road`, `Atlas`, `Book`), not the use site. Reuse an
existing name when the glyph matches rather than adding a near-duplicate.

## Standalone `.svg` files (optional)
`theme/icons/README.md` describes per-icon kebab `.svg` files (`road.svg`) for non-React consumers
(emails, server PDFs, handing art to a designer). `icons-sync` can emit them; the runtime never reads them
(it always uses the inline React components in `icons.jsx`).

## Gotchas
- **A name not in the registry renders nothing** — `theme.Icons[name]` returns undefined; the `Icon`
  component renders empty. The audit's "unknown name" check exists to catch exactly this before it ships.
- **Don't hand-edit `icons.jsx`** — it's generated; edits are lost on the next sync and flagged by
  `--check`. Edit `theme/icons.js`.
- **Decorative ≠ icon** — charts, map thumbnails, and the docs floating-nav widget are inline art; tag
  them `<!-- decorative -->`, don't force them into the registry.
- **Tagging asserts identity** — `<!-- icon: Grid -->` says "this svg is the Grid icon." If the mockup's
  drawing differs from the registry's, either reuse the right existing name or register a new icon; don't
  mislabel (the live page renders the registry's art, not the mockup's).

## Worked example
TransportNY freight-atlas: the Home page used 8 unregistered glyphs (Road · Rail · Maritime · Air ·
Pipeline · House · Atlas · Book). Captured into `dms_design_system_v2/theme/icons.js` + the theme.html
catalog, tagged in `freight-atlas-home.html`, synced to `src/themes/transportny/icons.jsx`; the docs-widget
hamburger tagged `<!-- decorative -->`. `icons-audit --pages freight-atlas-home` → green.

## Source of truth (code)
- Scripts: `scripts/icons-audit.mjs`, `scripts/icons-sync.mjs`.
- Registry (source): `src/themes/<brand>/…/dms_design_system_v2/theme/icons.js`; (generated live):
  `src/themes/<brand>/icons.jsx`; wired as `theme.Icons` (themev2.js).
- Catalog: the design-system `theme.html` `#icons` section.
- Upstream skills: `designing-a-dms-design-system.md` (the set is a design-system deliverable),
  `translating-design-system-to-dms-theme.md` (the sync is part of theme translation).
