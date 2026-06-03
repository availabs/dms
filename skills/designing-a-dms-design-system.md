# Designing a DMS-compatible design system (HTML + Tailwind)

How to produce a complete **design system** for a DMS site as a folder
of plain HTML + Tailwind CDN mockups. The output of this skill is the
visual / structural source-of-truth for a brand — it is **not** the
JS theme overlay. Pair this skill with its sibling,
[`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md),
which takes a completed design system and produces the runnable
`theme/theme.js` artifact.

> **Audience:** a designer (human or AI) producing v0.1 brand mockups
> that fit the DMS rendering contract. Pair this skill with a brand
> brief (e.g. `references/dms product/brand-tessera.md`) — this
> document is the structural grammar, the brief is the aesthetic
> decisions.
>
> **Worked examples:**
> - [`src/themes/transportny/TransportNY Design System/dms_design_system/`](../../../themes/transportny/TransportNY%20Design%20System/dms_design_system/)
> - [`src/themes/tessera/design_system_v2/`](../../../themes/tessera/design_system_v2/) — `design-system/` and `pages/` subfolders are the deliverable shape this skill produces.

---

## Outcome

You ship a folder shaped like this:

```
brand-output/
├── README.md
├── _shared.css                 # @font-face + brand surface utilities
├── design-system/              # FIVE pages documenting the brand
│   ├── theme.html                  · color, type, icons, spacing tokens
│   ├── layouts.html                · Layout + LayoutGroup variants (the page chrome)
│   ├── grid.html                   · the page-content column grid (sectionArray)
│   ├── components.html             · every UI primitive THIS theme uses
│   └── patterns.html               · composed multi-primitive patterns
└── pages/                      # one or more theme-chosen example pages
    └── <one or more>               · show this theme's intended use
```

Every `.html` file is a **plain HTML page** that loads Tailwind from
the CDN and the brand's surface utilities from `_shared.css`. No build
step. No JSX. No React, Vue, or any framework. No JavaScript bundler.

The point of this deliverable is to give a downstream engineer (or
the [translation skill](./translating-design-system-to-dms-theme.md))
everything needed to write the `theme/theme.js` overlay without going
back to the designer for clarifications: every primitive the brand
uses appears at least once in `components.html`; every multi-primitive
composition appears in `patterns.html`; every Layout / LayoutGroup
variant the brand ships appears in `layouts.html`; the page-content
column grid and the column-span vocabulary appear in `grid.html`;
every foundational token appears in `theme.html`.

**Note on naming (changed from earlier passes):** what is now
`layouts.html` was previously called `grid.html` in older versions of
this skill. The name was misleading — that page documents *page chrome
shapes* (Layout + LayoutGroup variants), not the column grid that
sections live on. The actual page-content grid (the `sectionArray`
column system that all sections render against inside any LayoutGroup)
now gets its own dedicated page named `grid.html`. Both pages are
required. If you are updating an older design system, rename the old
`grid.html` to `layouts.html` and add a new `grid.html` per §7.4.

---

## The five-step workflow

1. **Read the brand brief** for the aesthetic decisions
   (`brand-tessera.md` / `brand-lingua.md`).
2. **Read [§1–§9 below](#0-why-this-document-exists)** for the
   structural grammar — what surfaces exist, how they nest, what
   knobs the theme system exposes.
3. **Skim `src/dms/packages/dms/src/ui/components/`** to know the
   actual primitives that will need themed mockups. The component
   filenames are the catalogue (`Button.jsx`, `MultiSelect.jsx`,
   `Card.jsx`, `Tabs.jsx`, …); each ships a `.theme.{js,jsx}`
   sibling that the translation skill will consume — your mockups
   become the visual brief that drives those theme overlays.
4. **Produce `_shared.css`** — `@font-face` declarations and any
   brand surface utilities (`.tny-pane`, hover/press effects) that
   cannot be expressed as Tailwind utilities.
5. **Produce `design-system/`** — five DMS-shaped HTML pages
   (`theme`, `layouts`, `grid`, `components`, `patterns`).
6. **Produce `pages/`** — one or more theme-chosen example pages.
   **Every section on every example page must be laid out on the
   column grid documented in `grid.html`** — see §7.4.

[**Implementation rules** (§8)](#8-implementation-rules-for-mockup-pages)
are non-negotiable: **plain HTML + Tailwind CDN + the brand's
`_shared.css`, nothing else**. If you find yourself reaching for
React or a build step, stop — the constraint is the feature.

---

## 0. Why this document exists

DMS is not a blank canvas. It is a **constrained composition system**:
every UI in the product is built from a small set of themed primitives
arranged inside a fixed hierarchy. The constraint is the feature —
authors compose pages without writing code precisely because the
primitives and the hierarchy are fixed.

A designer given only a brand brief will inevitably produce designs
DMS can't render — custom heroes with absolutely-positioned art,
novel nav patterns, bespoke layouts per page. **Don't.**

The deliverable for a DMS design system is not "new components." It
is a brand's chosen styling for the existing primitives, shown
inside the platform's existing layout shapes, rendered against real
content.

**Each entry under `design-system/` and `pages/` is a *DMS-shaped
page***, not a flat HTML mockup. It is laid out as a Layout
containing LayoutGroups containing Sections — the same structure
the brand has to render in real DMS sites. This means the design
system **documents itself using the platform it documents**.

---

## 1. The five-layer hierarchy

Every DMS surface lives somewhere inside this nest:

```
Site
└── Layout                  ← every page is wrapped in one
    ├── (TopNav)            ← optional, configured per layout
    ├── (SideNav)           ← optional, configured per layout
    └── childWrapper
        └── LayoutGroup     ← one per "band" (header / content / footer)
            └── LayoutGroup wrapper
                └── Section ← one per content unit (the editable block)
                    └── Component (from the registry)
                        ├── Card / Spreadsheet / Graph / Map /
                        │   Lexical / Header / Footer / Filter / …
                        └── (inside data sections) UI primitives:
                            Table, Input, MultiSelect, Switch, Button,
                            Icon, Pill, Tabs, Modal, Drawer, Popup, …
```

The same hierarchy renders a marketing homepage, a dataset admin
page, an analytics dashboard, and a map viewer. The differences are
configuration of which Sections appear in which LayoutGroups under
which Layout — not different code paths, not custom layouts per use
case.

### The five layers, named and described

| Layer | Component | Owns | What the designer styles |
|---|---|---|---|
| **Site** | `DmsSite` | Routing, theme resolution, the `ThemeContext` | Nothing directly — supplies the theme that everything else reads. |
| **Layout** | `Layout.jsx` | Page chrome: outer wrapper, optional TopNav, optional SideNav, content area. | Wrapper class stack (5 keys); whether/how TopNav and SideNav render; widget slots in those navs. |
| **LayoutGroup** | `LayoutGroup.jsx` | A band of content within a page. Three positions: `header` / `content` / `footer`. | Wrapper class stack (3 keys); named variants per use case (default `"content"`, `"header"`, `"auth"`). |
| **Section** | `section.jsx` | A single editable block — title, group membership, the component instance it wraps. | Section chrome (titles, menus, group dividers — mostly via the pattern theme). |
| **Component / Primitive** | Component-registry entries (Card, Spreadsheet, Graph, Map, Lexical, etc.) + UI primitives (Button, Input, MultiSelect, …) | The actual content rendering. | Each primitive's design treatment. |

Two cross-cutting concerns:

- **textSettings** — the global type scale. Heading sizes, body
  sizes, named font roles. Consumed by Card, Lexical, Header, and
  any column type that renders text. The brand should document this
  on `theme.html`.
- **Icons** — a name → SVG-component map. Components reference icons
  by name, never by import. The brand ships an icon set and its
  registry of names; document on `theme.html`.

---

## 2. The primitives catalogue — `src/dms/packages/dms/src/ui/`

The primitive set is fixed by the codebase. The folder

```
src/dms/packages/dms/src/ui/components/
```

is the authoritative list. Each `<Foo>.jsx` file is a primitive your
mockups will need to depict at least once on `components.html`
(unless this theme is explicit about not supporting it). Each
`<Foo>.theme.{js,jsx}` sibling is the contract the translation skill
will fill in — your design decisions become that file's class
strings.

For this skill, the primitive list matters because **you can't
design what you don't show**. The translation skill can only fill in
keys for primitives whose visual treatment you committed to.

### Finding the canonical theme keys for any primitive

Every primitive ships a `.theme.{js,jsx}` sibling next to its
`.jsx` source. That sibling **is the contract** — its exported
default object lists every key the component reads. When you're
deciding what states / sub-elements / depths to depict in
`components.html`, open the matching `.theme.{js,jsx}` and let its
key set tell you what the primitive can be skinned on:

| Primitive | Source of truth |
|---|---|
| Layout | `src/dms/packages/dms/src/ui/components/Layout.theme.jsx` |
| LayoutGroup | `src/dms/packages/dms/src/ui/components/LayoutGroup.theme.jsx` |
| TopNav | `src/dms/packages/dms/src/ui/components/TopNav.theme.jsx` |
| SideNav | `src/dms/packages/dms/src/ui/components/SideNav.theme.jsx` |
| Button | `src/dms/packages/dms/src/ui/components/Button.theme.jsx` |
| Input | `src/dms/packages/dms/src/ui/components/Input.theme.js` |
| MultiSelect | `src/dms/packages/dms/src/ui/components/MultiSelect.theme.js` |
| Tabs | `src/dms/packages/dms/src/ui/components/Tabs.theme.jsx` |
| Switch | `src/dms/packages/dms/src/ui/components/Switch.theme.js` |
| FieldSet | `src/dms/packages/dms/src/ui/components/FieldSet.theme.js` |
| Dialog | `src/dms/packages/dms/src/ui/components/Dialog.theme.jsx` |
| Modal | `src/dms/packages/dms/src/ui/components/Modal.theme.jsx` |
| Drawer | `src/dms/packages/dms/src/ui/components/Drawer.theme.jsx` |
| DeleteModal | `src/dms/packages/dms/src/ui/components/DeleteModal.theme.js` |
| Card (data) | `src/dms/packages/dms/src/ui/components/card.theme.jsx` |
| Pill | `src/dms/packages/dms/src/ui/components/Pill.theme.js` |
| Icon | `src/dms/packages/dms/src/ui/components/Icon.theme.js` |
| Logo | `src/dms/packages/dms/src/ui/components/Logo.theme.js` |
| Table | `src/dms/packages/dms/src/ui/components/table/table.theme.js` |
| Lexical | `src/dms/packages/dms/src/ui/components/lexical/theme.js` |
| Graph | `src/dms/packages/dms/src/ui/components/graph/theme.js` |
| avlGraph | `src/dms/packages/dms/src/ui/components/graph_new/theme.js` |
| Map | `src/dms/packages/dms/src/ui/components/map/map.theme.js` |
| NavigableMenu | `src/dms/packages/dms/src/ui/components/navigableMenu/theme.js` |

The registry that pulls them all together is
`src/dms/packages/dms/src/ui/defaultTheme.js` — read it to see the
top-level key each primitive lives under (`topnav`, `sidenav`,
`button`, `dataCard`, …) and what pattern-level keys exist
(`pages.*`, `datasets.*`, `auth.*`).

**Why this matters for *this* skill:** a primitive whose theme
exposes `navitem_level_2` / `navitem_level_3` / `subMenuWrapper_2`
expects you to show level-2 navitems, level-3 navitems, and the
flyout submenu somewhere. If your mockup only depicts a flat menu,
the translation skill won't know what those keys should look like
and will have to invent (or worse, leave the platform default
showing through). **Mockup coverage drives theme completeness.**

### Navigation primitives

- **`TopNav.jsx`** — horizontal page chrome. Logo + menu + utility
  widgets. Multi-level (max-depth configurable). Has a mobile
  toggle and submenu flyouts.
- **`SideNav.jsx`** — vertical page chrome. Logo at top + menu
  + bottom widgets. Up to 4 nesting levels with `_level_N` styling.
- **`navigableMenu/`** — keyboard-navigable popover menu used
  inside other components (section menus, column-config toolbars).
- **`draggableNav.jsx`** — drag-to-nest lists used in the side-nav
  editor and page tree.

### Form & interaction primitives

- **`Button.jsx`** — the action primitive. Multiple named styles
  encouraged: `default`, `plain`, `active`, `danger`, `ghost`.
- **`Input.jsx`**, **`Textarea.jsx`** — text inputs.
- **`MultiSelect.jsx`** — the canonical selection primitive (also
  used as the single-select trigger via `singleSelectOnly: true`).
  ~25 theme keys — design its trigger, token chips, menu shell,
  search input, smart-menu mode, tabular mode, and error states.
- **`Tabs.jsx`** — horizontal tab strip.
- **`Switch.jsx`** — boolean toggle.
- **`FieldSet.jsx`** — container for form fields with label and
  help text.
- **`Label.jsx`** — plain text label primitive.

### Overlay primitives

- **`Dialog.jsx`** — modal with sized variants `xs`..`5xl`.
- **`Modal.jsx`** — larger persistent overlay.
- **`Drawer.jsx`** — slide-in panel.
- **`Popup.jsx`** — floating tooltip/popover base.
- **`DeleteModal.jsx`** — destructive-action confirmation.

### Container & atom primitives

- **`Card.jsx`** — the workhorse Card section. The single most
  important primitive in DMS: authors compose pages by picking
  columns from a data source, setting spans, choosing fonts,
  hiding/showing parts. Design its cards-grid, cells-grid, per-cell
  wrappers, header/value, image cells, link cells, and full-bleed
  variants. **Budget real time for this.** See
  [`src/themes/CLAUDE.md`](../../../themes/CLAUDE.md).
- **`card.theme.jsx`** is the source of truth for the Card's key
  set.
- **`Pill.jsx`** — inline status / badge / chip. Multiple colour
  variants matching the brand's accent system.
- **`Pagination.jsx`** — page nav for tables.
- **`Icon.jsx`** — icon wrapper that looks names up in the registry.
- **`Logo.jsx`** — the brand-mark widget.
- **`table/`** — the spreadsheet / data-grid. Header, sortable,
  alternating rows, paginated, editing state.

### Rich content primitives

- **`lexical/`** — rich-text editor. Headings, paragraph, lists,
  code, quote, link, image. Inherits headings from `textSettings`.
- **`graph/`**, **`graph_new/`** (`avlGraph`) — chart components.
  Container, title, axis, grid, tooltip + color palette.
- **`map/`** — MapLibre wrapper. Container, controls, legend,
  popover.

### Cross-cutting / less-common primitives

- **`attribution`**, **`filters`** — page-pattern chrome.
- **`DndList.jsx`**, **`DraggableList.jsx`** — drag handles,
  drop zones, ghost styles.
- **`ButtonSelect.jsx`**, **`Colorpicker.jsx`** — specialised
  inputs.

### Pattern-level components

These live in `src/dms/packages/dms/src/patterns/<pattern>/` rather
than `ui/components/` — they're tied to a specific pattern (page,
datasets, auth, admin):

- **`pages.attribution`** — data-source attribution chip.
- **`pages.complexFilters`** — filter-tree editor inside data
  sections.
- **`pages.sectionGroupsPane`** — group-layout editor (admin).
- **`pages.search*`** — site-wide search.
- **`datasets.datasetsList`** — dataset index page chrome.
- **`datasets.metadataComp`** — dataset column-config UI.
- **`auth.login`** / **`auth.signup`** — auth pages.

Show these on `patterns.html` so the translation skill knows their
intended treatment.

---

## 3. The Layout component

Every page is wrapped in a `<Layout>`. The Layout owns the page's
chrome: an outer wrapper, optional TopNav, optional SideNav, and
the content area where LayoutGroups live.

### 3.1 Markup tree

```jsx
<div className={theme.outerWrapper}>
  {headerChildren}                           // optional, e.g. a top banner
  <div className={theme.wrapper}>
    <div className={theme.wrapper2}>
      {topNav.size !== 'none' && <TopNav … />}
      <div className={theme.wrapper3}>
        {sideNav.size !== 'none' && <SideNav … />}
        <div className={theme.childWrapper}>
          {children}                         // ← LayoutGroups go here
        </div>
      </div>
    </div>
  </div>
  {footerChildren}                           // optional, e.g. a footer band
</div>
```

### 3.2 What the brand decides per Layout style

| Key | What it controls |
|---|---|
| `outerWrapper` | Page background fill, top-level isolation. |
| `wrapper` | Flex direction of the full page, min-height, responsive breakpoint behaviour for the nav row. |
| `wrapper2` | The column containing TopNav + content. Controls max-width, alignment, content stretching. |
| `wrapper3` | The row containing SideNav + content. Controls flex direction, alignment between nav and content. |
| `childWrapper` | The content area itself. Parent of LayoutGroups. |

### 3.3 Recommended Layout variants

A typical brand should ship at least three named Layout styles:

| Name | When | Characteristics |
|---|---|---|
| `default` | Marketing site, public-facing pages | Both navs may be absent; generous max-width content area; light background. |
| `app` | Authoring / admin / dashboard surfaces | SideNav visible (compact), narrower content gutters, denser. |
| `bare` | Auth pages, embedded views, print | No navs, no chrome, content fills the viewport. |

These names are conventions only — the system doesn't require them.
But shipping multiple Layout styles is a clear way to signal "the
system is themable per context."

`layouts.html` is where these variants get rendered — one per Card on
that page, with a mini-mockup of the chrome each variant produces.

---

## 4. The LayoutGroup component

A LayoutGroup is a **band of content** within a Layout's content
area. A page may have several — a `header` group, one or more
`content` groups, a `footer` group. Each group hosts one or more
Sections.

### 4.1 Markup tree

```jsx
<div className={theme.wrapper1}>           // outer band (full-width)
  {outerChildren}                          // optional band-prefix content
  <div className={theme.wrapper2}>         // inner container (often max-width + bg)
    <div className={theme.wrapper3}>       // content alignment (often unused)
      {children}                           // ← Sections render here
    </div>
  </div>
</div>
```

### 4.2 Recommended LayoutGroup variants

| Style | Use | Differentiating treatment |
|---|---|---|
| `content` (default) | Main page body | Boxed: shadow, rounded corners, surface card, generous padding. |
| `header` | Top of page (hero, title band) | Unboxed: no shadow, no rounded corners, content sits on the Layout background. |
| `auth` | Sign-in / sign-up pages | Boxed and centred vertically (`place-content-center`). |
| `footer` *(optional)* | Bottom band | Full-bleed, distinct contrast, no shadow. |
| `feature` *(optional)* | Highlight band | Brand's choice. |

`layouts.html` is where these get rendered — one Card per named style,
showing the surface recipe (boxed vs. unboxed, shadow vs. flat,
padding density).

---

## 5. Sections (briefly)

A Section is a single editable block on a page. From the designer's
perspective:

- Sections don't have a meaningfully designable wrapper of their
  own beyond what the pattern theme provides (titles, group
  dividers, edit-mode chrome).
- The interesting design surface is the **component the Section
  wraps**: Card, Spreadsheet, Graph, Map, Lexical, Header, Footer,
  Filter, etc. Style those.
- Section chrome (titles, drag handles, the section menu in edit
  mode) lives under the page-pattern theme — show it on
  `patterns.html` under "section toolbar" / "pattern-editor chrome."

The designer mostly does not need to design Section chrome
directly. Style the *components* sections wrap and the *LayoutGroup*
sections sit inside; the Section chrome will compose around them
coherently.

---

## 6. What "design" actually changes — and what it doesn't

DMS does not use CSS variables or design tokens in the modern sense.
Everything that the brand ships becomes Tailwind utility classes
inside the JS theme (handled by the translation skill). This means
the design has to be **expressible as Tailwind utility classes plus
a small amount of `@font-face` / brand surface CSS**.

### Tailwind-first, with the Play CDN

**Use Tailwind utilities for every styling decision you can.** That
includes spacing, layout, colour, type, borders, radii, shadows,
hover/focus/active states, responsive variants — anything Tailwind
covers. The mockups load Tailwind from the Play CDN
(`https://cdn.tailwindcss.com`) in `<head>`, which keeps the
deliverable build-step-free: a designer opens any `.html` file in a
browser and the styles just resolve.

If a styling need genuinely cannot be expressed as a Tailwind class
(custom `@font-face`, a complex multi-property hover transition, a
brand surface like `.tny-pane` that mixes blend modes with
gradients), drop it into `_shared.css` next to the mockups. Keep
`_shared.css` small — every rule in there is something the
translation skill will have to mirror into
`theme/index.css.additions` later.

**Don't reach for vanilla CSS just because it's a few characters
shorter.** The build-step-free constraint and the Tailwind-first
constraint pull in the same direction: a brand whose mockups are
98% Tailwind utility classes is a brand whose theme overlay is
99% Tailwind utility classes.

### In scope

- **Tailwind utilities** on every primitive's wrapper / child /
  state classes (via the Play CDN — no install, no build).
- **Brand-extended Tailwind config**, expressed inside the page's
  `<head>` via the Play CDN's inline config block (so the brand's
  named colours and font families work in arbitrary mockups):
  ```html
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: { bone: '#F4F1EA', slate: '#2A2F36', oxide: '#B5532C' },
          fontFamily: { display: ['Newsreader','serif'], sans: ['IBM Plex Sans','sans-serif'] },
        }
      }
    }
  </script>
  ```
- **Webfonts** loaded via `@font-face` in `_shared.css` (mirrored
  later into `theme/index.css.additions`).
- **Brand surface utilities** in `_shared.css` (e.g. `.tny-pane`,
  `.tny-card`) when an effect can't be expressed as a Tailwind
  utility.

### Out of scope

- **Custom DOM structure.** The components have fixed markup. If a
  design needs a different markup tree, that's a request to change
  a *component*, not a theme.
- **Custom JavaScript behaviour.** The mockups can't introduce
  interactions the live primitive doesn't have.
- **Per-page anything custom.** If a design idea only works for
  one page, it doesn't belong in a DMS theme.

---

## 7. The deliverable — folder structure and "pages as documentation"

```
brand-output/
├── README.md             # date, version, one-paragraph brand summary
├── _shared.css           # @font-face + surface utilities
├── design-system/        # FIVE pages that document the brand
│   ├── theme.html            # color, type, icons, spacing tokens
│   ├── layouts.html          # Layout + LayoutGroup variants (page chrome shapes)
│   ├── grid.html             # the page-content column grid (sectionArray)
│   ├── components.html       # every UI primitive
│   └── patterns.html         # composed multi-primitive patterns
└── pages/                # one or more theme-chosen example pages
    └── <descriptive-name>.html
```

### 7.0 Every page must navigate to every other page

A reviewer (designer, engineer, prospective customer) opens any
single HTML file and needs to be able to **reach every other page
in the deliverable in one click**. The five `design-system/` pages
and every `pages/` example must include two navigation mechanisms:

#### 7.0.1 TopNav integration

The TopNav on `design-system/` pages doubles as the design system
navigation. Instead of showing placeholder product nav items, it
shows the brand logo, a "Design System" label, and direct links to
all five `design-system/` pages. The current page is highlighted
with the brand accent color. A subtle page counter (e.g. "3 / 5")
sits at the far right.

This keeps the TopNav functional rather than decorative, while
still demonstrating the brand's TopNav styling (floating, rounded,
shadow, etc.). The product-style TopNav with real site navigation
items is documented as a pattern on `layouts.html`.

On `pages/` examples the TopNav should show the product navigation
(not the design system links) — those pages demonstrate real
product surfaces.

#### 7.0.2 Floating navigation widget

Every page (`design-system/` and `pages/`) must include a
**floating navigation widget** — a small icon button fixed to the
**bottom-right** corner of the viewport. Clicking it opens a panel
listing all design system and example pages. The current page is
marked with the brand accent color. The widget:

- Defaults to a compact icon (40×40px rounded button, brand-dark
  background, white hamburger/menu icon)
- On click, toggles a white panel above it with the full page list
- Uses `position: fixed` so it stays visible while scrolling
- Animates open/close with opacity + transform transition
- Has high z-index (9999) so it floats above page content

**Use inline styles on the widget elements.** Do not rely on
external CSS classes — the widget must render correctly regardless
of stylesheet loading order or file-extension MIME-type issues.
The inline onclick handler toggles the panel via direct style
manipulation (opacity, transform, pointerEvents).

Widget HTML template (adapt colors/links per brand):

```html
<div id="dsWidget" style="position:fixed;bottom:24px;right:24px;z-index:9999;font-family:'Source Sans 3',system-ui,sans-serif;">
  <div id="dsPanel" style="position:absolute;bottom:52px;right:0;background:white;border-radius:10px;padding:12px 0;min-width:190px;box-shadow:0 4px 20px rgba(0,0,0,0.12);opacity:0;transform:translateY(8px) scale(0.95);pointer-events:none;transition:opacity 0.15s,transform 0.15s;">
    <div style="font-family:..brand-display..;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;color:..brand-muted..;padding:0 16px 8px;border-bottom:1px solid ..brand-border..;margin-bottom:4px;">Brand Design System</div>
    <a href="theme.html" style="display:flex;align-items:center;gap:8px;padding:6px 16px;font-size:13px;font-weight:600;color:..brand-accent..;text-decoration:none;">
      <span style="font-size:10px;font-weight:500;color:..brand-muted..;min-width:14px;">1</span> Theme</a>
    <!-- ...remaining links, active page gets brand-accent color, others get brand-text color... -->
  </div>
  <button onclick="var p=document.getElementById('dsPanel');var o=p.style.opacity==='1';p.style.opacity=o?'0':'1';p.style.transform=o?'translateY(8px) scale(0.95)':'translateY(0) scale(1)';p.style.pointerEvents=o?'none':'auto';"
          style="width:40px;height:40px;border-radius:10px;background:..brand-dark..;color:white;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.15);"
          aria-label="Design system navigation">
    <svg xmlns="http://www.w3.org/2000/svg" style="width:20px;height:20px;" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 10.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM2 10a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Z"/></svg>
  </button>
</div>
```

Place the widget just before `</body>` on every page.

#### 7.0.3 Footer link block

A **footer link block** repeating the page index at the bottom of
the page content, so a long-scroll page is navigable from the
bottom too.

#### Why two mechanisms?

The TopNav links are visible immediately but scroll out of view on
long pages. The floating widget stays accessible at all scroll
positions but is small and requires a click. Together they ensure
a reviewer can always navigate, whether they're at the top of a
page or deep into a 900-line components reference.

The widget is documentation scaffolding, not Layout chrome. It
never appears on a live DMS site. Keep its styling out of
`theme.js` — it ships inline in the mockup HTML only.

### 7.1 The "pages as documentation" principle

Every file in `design-system/` and `pages/` is structured as a real
DMS page would be — a Layout containing one or more LayoutGroups
containing Sections. This is **non-negotiable** and is the single
most important constraint on the deliverable.

Why:

- **It dogfoods the platform.** The design system documents itself
  using the platform it documents. If the brand can't render its
  own design system as a DMS site, it can't render anything.
- **It enforces the constraint.** A "components" page that listed
  19 primitives in a flat HTML grid would inevitably use grid
  tricks DMS can't produce. A "components" page laid out as actual
  Sections inside actual LayoutGroups can only show what DMS can
  actually render.
- **It's portable.** Each mockup is one Layout + LayoutGroup +
  Section stack — the same data shape as a real DMS row. The
  mockups can be ported to live DMS pages later by an engineer (or
  a follow-up agent) by translating the mockup HTML into DMS row
  JSON.
- **It looks like the product.** A potential customer browsing the
  design system sees what the product actually produces.

**Which Layout do the design-system pages themselves use?** The
brand's *product* Layout — the one a real authored page would use.
For a theme whose product surfaces ship a persistent SideNav
(Layout `app`), the design-system pages should also render inside
Layout `app` with that SideNav. The brand documents itself **as the
brand**, not in a generic documentation chrome. If a reviewer can't
tell the design-system pages apart from product pages at a glance
(modulo content), you've got it right.

### 7.2 `design-system/theme.html` — the tokens page

A single DMS-shaped page that documents the **foundational tokens**
the rest of the system inherits from. Read it as: "here is the
brand's vocabulary, before it is composed into anything."

**Recommended page structure** (Layout: `default`):

| LayoutGroup | Section | Shows |
|---|---|---|
| `header` | Lexical | Brand title + one-line summary |
| `content` | Card | **Color tokens** — every brand colour as a swatch with its Tailwind class name and role label (surface / ink / accent / divider) |
| `content` | Card | **Type specimen** — every distinct font specification used anywhere in `pages/` or any `design-system/` page, grouped by role. See §7.2.1 — this is the hard rule. |
| `content` | Card | **Icon set** — every icon in the registry, rendered at 16 / 24 / 32px, with its name underneath. The icon names are the API; this is where they're documented. |
| `content` | Lexical | **Spacing & radius** — visual swatches showing the spacing scale and the radius scale, with token names labelled |
| `content` | Lexical | **Typography pairings** — the display / sans / mono families called out by name with a sample paragraph each |

**What this page proves:** the brand's foundational layer is
complete. If a token is missing here, it'll be missing everywhere
that consumes it.

#### 7.2.1 The Type section — every variation must be declared here, with balance

**Hard rule:** every text variation used anywhere in `pages/*.html`
or any `design-system/*.html` mockup must reference a token
declared in the Type section of `theme.html`. If a mockup needs a
treatment that isn't on the Type page, *either* add the token
there first *or* fold the variation into an existing one — the
type system is the contract between design and theme.

The two failure modes this rule is balanced between:

| Failure mode | What goes wrong | How it shows up |
|---|---|---|
| **Too few tokens** (4–6 specs) | Designers can't express the brand's voice within the system; pages cheat with one-off inline styles; the system feels cookie-cutter | "I had to override `text-3xl` everywhere because `h1` was too generic" |
| **Too many tokens** (30+ specs) | Authors can't navigate the `valueFontStyle` dropdown; near-duplicates drift apart; the brand loses coherence | "We have three 11px-uppercase-tracked mono variants and nobody remembers which to use" |

**Target: 12–18 tokens** for most brands. Smaller for stripped-down
brands; larger only if you can defend each one with the rule below.

##### Universal naming pattern

Use the same role + size-token vocabulary across every theme. New
designers reading any DMS theme see familiar names; cross-theme
moves don't require relearning the API.

```
{role}{Size}[{Variant}]
```

- **role** — small set, universal across themes:
  - `display` — the brand's display family for headlines
  - `displayItalic` — the italic variant if the brand uses italic display
    for distinct moments (pull quotes, essay heads)
  - `prose` — the brand's body family for paragraphs and captions
  - `meta` — the brand's mono (or condensed sans) for labels, eyebrows,
    chrome, codes
  - (rare) — a fourth role only if the brand has a genuinely fourth
    voice (e.g. a `condensed` for ultra-narrow KPI numbers)
- **Size** — t-shirt scale, anchored to brand-specific px values:
  `Hero · XL · LG · MD · SM · XS`
- **Variant** — optional, used sparingly: `Num` for an explicit tabular
  variant when used heavily (most tabular needs handle via the
  modifier axis below instead).

##### Modifier axes — orthogonal to the token, not new tokens

These vary across uses of the same token and should NOT spawn new
tokens:

| Axis | How it's applied | Example |
|---|---|---|
| **Color** | Brand color tokens (`color-primary` / `color-secondary` / `color-tertiary`) applied at the call site | `prose` in slate (default) vs `prose` in graphite (secondary) — both are `prose`, not `body` vs `body-card` |
| **Tabular numerals** | `font-variant-numeric: tabular-nums` applied where needed (tables, KPI rows) | `proseSM` cell with tabular-nums on the table; `displayMD` rendered as a tabular KPI value — no separate `proseSMNum` or `displayKPI` token |
| **Italic-on-prose** | A style attribute applied at the call site | A 20px italic proof quote is `prose` (or `proseLG`) + italic — not `prose-italic` |
| **Uppercase + tracking** | Only earns its own role (`meta`) when consistent across many uses; otherwise an inline modifier | Don't ship `display-uppercase`; do ship `metaSM` if the brand has a uniform 11px-uppercase-tracked label voice |
| **Surface / background** | A surface class applied at the call site | A bone-background code block is `metaMD` + `bg-bone`, not `mono-code` |

The principle: **type tokens encode shape; color and emphasis are
separate axes.** If two specimens differ only in color or
text-transform, they're the same token used in two contexts.

##### Earn-a-token rule

A potential new token must visibly differ from its closest
neighbor by at least one of:

- **≥ 2px size**
- **One weight step** (400 → 500, 500 → 600)
- **Family change** (display ↔ sans ↔ mono)
- **Style change** (roman ↔ italic ↔ small-caps)
- **Role change** (display → prose, prose → meta)

A 22px header next to a 24px header? Pick one. A `body-card` that
differs from `body` only in color? Use `body` + color-graphite.
Two 11px mono variants whose only difference is tracking by
0.02em? Pick one tracking value and use it for both.

##### Why this rule exists

The translation skill maps every token in the Type section to one
key on
[`textSettings.styles[0]`](./translating-design-system-to-dms-theme.md#316-textsettings--the-global-type-scale).
A variation that lives in `pages/` but isn't in the Type section
becomes a one-off Tailwind class string inside a mockup — it
renders, but it has no name, no theme key, no Card
`valueFontStyle` option for authors, and no place to re-tune
across the brand. The next page re-invents a near-duplicate,
drift creeps in.

Conversely, a Type section with 37 ad-hoc rows where 14 would do
hides the brand's shape, overwhelms the `valueFontStyle`
dropdown, and lets near-duplicates drift across the catalog.

##### What each token row should have

- **A token name** in the universal pattern — `displayHero`,
  `displayItalicMD`, `proseSM`, `metaXS`. Maps 1:1 to a key on
  `textSettings.styles[0]`.
- **A spec line** — `Newsreader 76 / 1.04 · 500 · −0.02em`.
  Compact, scannable.
- **A rendered specimen** — real copy at the actual size, in the
  brand's primary ink. Lorem ipsum hides the spec.
- **(Below the role group) a one-paragraph note** listing any
  variations that *could* have become tokens but were folded back
  into the parent. Helps a future reader see what was considered
  and rejected (e.g. "Code blocks at 13px use `metaMD` at the
  inline scale with bone-surface modifier; not a separate
  `mono-code` token.").

##### Audit cadence

Every time you add or substantially edit a mockup in `pages/`,
grep its inline styles and `<style>` blocks for
`font-family|font-size|font-weight|font-style|letter-spacing|line-height|text-transform`. For each unique spec, decide: does
this match an existing token (with or without a modifier axis)?
If yes, normalise the mockup to use the token. If no, run the
earn-a-token rule — add the token or fold the variation.

Cheap if done every iteration; expensive if you save it for a
"type audit" at the end. The first Tessera pass shipped 9
declared rows while the 12 pages used 37 distinct specs (75%
undeclared); the second pass overcorrected to 37 declared rows;
the third pass landed at 14 with modifiers — the proper balance.

##### A page in `pages/` is "done" when:

Every visible piece of text on it references one of the tokens
in the Type section (possibly with a modifier axis applied).

##### Worked example

See [`src/themes/tessera/design_system_v2/design-system/theme.html`](../../../themes/tessera/design_system_v2/design-system/theme.html)
— Type section organised into 4 roles (display, displayItalic,
prose, meta) with 15 tokens total, each role followed by a short
note listing the variations that were folded in as modifier
applications rather than new tokens. The base body size drops the
size suffix: `prose` alone is the 16px default, matching
Tailwind's `text-base` convention.

### 7.3 `design-system/layouts.html` — the page-chrome specs page

> **Renamed from earlier passes:** older versions of this skill called
> this page `grid.html`. The name was misleading — this page is about
> *page chrome shapes* (which Layout variant a page uses, and how its
> bands of LayoutGroups stack), **not** about the column grid that
> sections lay on. The actual column grid now has its own page,
> `grid.html` (§7.4). If you are updating an older design system,
> rename the old `grid.html` to `layouts.html` and add a new
> `grid.html` per §7.4.

A single DMS-shaped page that documents Layout and LayoutGroup —
the structural primitives that don't have a "normal" component
gallery treatment because they're invisible chrome.

**Recommended page structure** (mixes Layout styles to demonstrate
them — see §3.3 for the recommended `default` / `app` / `bare` set):

| LayoutGroup | Section | Shows |
|---|---|---|
| `header` | Lexical | Title + explanation that this page demonstrates the structural layer |
| `header` | Lexical (annotated) | Visual diagram of the Site → Layout → LayoutGroup → Section → Component hierarchy from §1 |
| `content` | Card or Lexical | **Layout variants** — one Card per named Layout style (`default`, `app`, `bare`, plus any brand additions). Each card shows a mini-mockup of the layout chrome (outer wrapper, TopNav presence, SideNav presence, content area) annotated with which wrapper key drives which surface |
| `content` | Card | **LayoutGroup variants** — one Card per named LayoutGroup style (`content`, `header`, `auth`, plus any brand additions), showing the surface recipe (boxed vs. unboxed, shadow vs. flat, padding density) with annotations. **Required**, not optional — every brand-shipped variant needs a card here so a reviewer can scan the catalogue. |
| `content` | Card | **LayoutGroup wrapper class reference** — a literal table with one row per named variant, columns for `wrapper1` / `wrapper2` / **alignment**. The `wrapper2` column holds the class string verbatim; the alignment column states the intent (`left-aligned · cap`, `centred · cap`, `full-bleed · no cap`). **Required.** See §7.3.1. |
| `content` | Card | **Section width — regular vs full-width groups** — documents how `sectionArray.layouts.centered` / `layouts.fullwidth` nest inside the LayoutGroup wrapper, and how the `group.full_width: 'show'` editor flag picks between them. **Required.** See §7.3.2. |
| `content` | Lexical | **Nesting example** — a single visual showing Layout with multiple LayoutGroups stacked, illustrating band composition |
| `content` | Lexical | **Naming reference** — table listing which Layout / LayoutGroup variant should be used for which kind of page |

**What this page proves:** every page in `pages/` uses one of the
Layouts documented here and stacks LayoutGroups documented here,
with their wrapper class strings reading consistently across the
catalogue.

#### 7.3.1 The LayoutGroup wrapper class reference table (required)

The visual variant cards convey shape but not the actual class
strings on `wrapper1` / `wrapper2`. The brand's `mx-auto` /
`mr-auto` decisions hide inside those strings — without a literal
side-by-side reference, alignment drift slips in and stays
invisible until a reviewer notices on screenshots.

Ship a Card with this table on every `layouts.html`:

| Variant | wrapper1 | wrapper2 | Alignment |
|---|---|---|---|
| `content` | `w-full bg-<pane> py-12` | `mr-auto w-full max-w-[<cap>] pl-12 pr-8 …` | left-aligned · cap |
| `content_tint` | `w-full bg-<pane-tint> py-12` | `mr-auto w-full max-w-[<cap>] pl-12 pr-8 …` | left-aligned · cap |
| `header` | `w-full bg-white border-b` | `mr-auto w-full max-w-[<cap>] pl-12 pr-8 py-10` | left-aligned · cap |
| `hero` | `w-full <topo-bg> border-b` | `mr-auto w-full max-w-[<cap>] pl-12 pr-8 py-14` | left-aligned · cap |
| `tone_bar` | `w-full bg-<accent>` | `mr-auto w-full max-w-[<cap>] pl-12 pr-8 h-12` | left-aligned · cap |
| `footer` | `w-full bg-white border-t` | `mr-auto w-full max-w-[<cap>] pl-12 pr-8 py-4` | left-aligned · cap |
| `auth` | `w-full flex-1 flex p-6 bg-<pane>` | `mx-auto w-full max-w-md flex flex-col …` | centred (intentional) |
| `workbench` | `w-full bg-<pane> py-6` | `w-full px-0` | full-bleed · no cap |

The asymmetric `pl-12 pr-8` (48px left, 32px right) gives the band
breathing room from the SideNav's right edge without expanding the
right side — the right side already has unlimited viewport because
`mr-auto` consumes any excess width. Symmetric `px-8` looks cramped
on the left, especially on dense product pages where content butts
right up against the SideNav.

Under the table, add a callout rule: *Product LayoutGroups use
`mr-auto`, not `mx-auto`. The codebase default (sectionArray.theme.jsx
ships `max-w-[1020px] mx-auto`) centres content on wide monitors and
drifts it away from the sidebar's right edge — looks "marketing-y."
Use `mr-auto` so the band hugs the sidebar with `px-8` for breathing
room. Only `auth` keeps `mx-auto`; sign-in forms are the one
intentional centred surface.* See §10 done criteria #8.

#### 7.3.2 Section width — regular vs full-width groups (required)

Inside any LayoutGroup, the sectionArray applies one of two layout
classes to its grid container, picked by `group.full_width`. The
literal code (from `src/dms/packages/dms/src/patterns/page/components/sections/sectionArray.jsx`)
is:

```js
className={`
  ${theme.container}
  ${theme.layouts[group.full_width === 'show' ? 'fullwidth' : 'centered']}
`}
```

Ship a Card with this table:

| `group.full_width` | Class applied | Result |
|---|---|---|
| `'off'` (default) | `layouts.centered` (`'max-w-[<cap>] mr-auto'`) | Sections capped at brand width, left-aligned |
| `'show'` | `layouts.fullwidth` (`''`) | Sections fill the parent — for map workbenches, dense canvases |

The toggle lives in
`src/dms/packages/dms/src/patterns/page/pages/edit/editPane/sectionGroupsPane.jsx`
as a two-item menu (*Full Width: off / show*) the author flips
per-group. Developers don't intervene.

**Pair with the LayoutGroup variant.** Setting
`group.full_width: 'show'` on a `content` group still constrains
the section to the parent's max-width because `wrapper2` itself
caps at the brand width. For a true edge-to-edge map workbench, use
the `workbench` LayoutGroup variant (which drops `max-w` from
`wrapper2`) **and** set `group.full_width: 'show'` so the inner
sectionArray also drops its cap.

**When to use `workbench`:** any time a Section needs edge-to-edge
canvas — map workbenches, dense data tables that need horizontal
scroll, code editors, chart canvases that benefit from extra
width. Don't reach for it for ordinary content — the 1480-cap
content variant is correct for almost every band.

### 7.4 `design-system/grid.html` — the page-content column grid

A single DMS-shaped page that documents the **column grid every
section is laid out on** inside any LayoutGroup. This is the
`sectionArray` grid in
`src/dms/packages/dms/src/patterns/page/components/sections/sectionArray.jsx` —
the inner grid that holds individual Sections. It is **not** the same
thing as the page chrome (Layout / LayoutGroup, §7.3).

**Scope of "the grid":**

- The grid covers **the page content area only** — everything *inside*
  the LayoutGroup's wrapper. The TopNav, SideNav, and any
  layout-level chrome are excluded; the grid begins where Sections
  begin.
- Within a LayoutGroup, every Section picks a `size` from the grid's
  column-span vocabulary (e.g. `1` = full row, `1/2` = half,
  `1/3` = third, or in 12-col themes a raw `12`, `6`, `4`, `3`).
- **The grid is usually the same across every LayoutGroup on every
  page** in the system. Theming a *different* grid per page is rare;
  it makes the system harder to author against. Pick one grid for
  the brand and stick with it.

**The default vs. the modern recommendation:**

| Setting | Codebase default | Modern theme recommendation |
|---|---|---|
| `gridSize` | 6 | **12** |
| `sizes` keys | `1/3` `1/2` `2/3` `1` | `12` `8` `6` `4` `3` (and/or the fractional keys, freely composed) |
| `defaultSize` | `"1"` | `"12"` |
| `layouts.centered` max-width | `max-w-[1020px] mx-auto` | brand-specific (often `max-w-[1280px]`) |
| `sectionPadding` | `p-4` | brand-specific (often tighter, `p-2`/`p-3`, to give the LayoutGroup's wrapper padding room) |

The 12-column grid gives authors finer-grained span control (1/12 ≈
8.3% increments) and matches the contemporary web-design grid
vocabulary. New themes should default to 12 unless they have a
deliberate reason to stay on 6.

**The gap-0 / padding-gutter / inner-box-chrome model (mockups must follow this).**
The sectionArray grid is **`gap-0`**; the gutter between sections is **per-section
padding**, and a section's **border / radius / background render on an inner box** inside
that padding. This is what lets distinct sections either sit apart *or* fuse into one
visual card. So when authoring the HTML mockups in `pages/`:
- Build the section grid as `grid grid-cols-12 gap-0` (no grid `gap`); express the gutter as
  **padding on each section wrapper** (e.g. `p-3`). Component-internal flex gaps
  (`gap-2/3/4` inside a card) are fine — only the *section* grid is gap-0.
- A bordered "card" = a section whose **inner** element carries `border + rounded + bg`,
  with the section padding *outside* it as the gutter.
- A **compound card** (header + chart as one card, etc.) = two adjacent sections with the
  **shared-edge padding zeroed** and borders/corners coordinated (top piece: border
  top/sides + rounded-t; bottom piece: border sides/bottom + rounded-b). Author it that way
  so it maps 1:1 to two DMS sections.
- **Content padding inside a card is the component's**, not the section gutter — don't
  conflate them.

Document this on `grid.html` (the spec table should list `gap-0`, `defaultPaddingStep`, the
curated `paddings` steps, `borderSides`, `radiusCorners`, `backgrounds`) with a worked
compound-card example. See
[`translating-design-system-to-dms-theme.md` §3.1.58](./translating-design-system-to-dms-theme.md#3158-the-section-layout-model--gap-0-padding-gutters-inner-box-chrome).

**Themes that constrain the page differently** (the WCDB case):
some brands split the page into a *higher-level layout grid* via the
Layout's `childWrapper` (e.g. `md:grid md:grid-cols-2` to produce a
sticky-left / scrolling-right pair, with one LayoutGroup per column).
This is a Layout decision — it lives in `layouts.html` (§7.3) — but
the consequences for the sectionArray grid live here:

- Each LayoutGroup that sits inside the higher-level layout grid
  still hosts its **own** sectionArray grid for its sections.
- The sectionArray grid inside a narrower column may use a smaller
  `gridSize` (e.g. 4 instead of 12) or the same `gridSize` with
  authors sticking to small-span sections.
- Document both layers on `grid.html`: the layout-level split (with
  a small diagram), and the inner sectionArray grid inside each
  column.

**Recommended page structure** (Layout: `default`):

| LayoutGroup | Section | Shows |
|---|---|---|
| `header` | Lexical | Title + explanation: "this page documents the column grid every section sits on" |
| `content` | Lexical | **The grid spec** — one short table giving the brand's chosen `gridSize`, `defaultSize`, `sizes` map, `centered` max-width, `sectionPadding`, and `gridviewItem` (the "show grid" overlay style authors see in edit mode) |
| `content` | Card | **Column-span vocabulary** — render a faux grid (a row of N empty columns at the chosen `gridSize`) with the column ruler labelled `1 · 2 · 3 …`. Below it, show every named span as a labelled tile (e.g. a `12` tile spanning the full row; a `6 · 6` pair; a `4 · 4 · 4` trio; a `3 · 6 · 3` asymmetric). Use real content placeholders, not lorem boxes — a hero band, a two-column intro, a three-up feature grid |
| `content` | Card | **Per-section span examples** — small previews of `1/3`, `1/2`, `2/3`, `1` (or the brand's 12-col equivalents), each labelled with its `size` key so authors learn the vocabulary by sight |
| `content` | Card | **Row-span (`rowspan`) vocabulary** — if the brand uses row-spans (most do not), show the `rowspans` examples here with `1` / `2` / `3` / etc. blocks. Skip the section if the brand doesn't ship row-spans |
| `content` | Card | **Layout-level grid (advanced)** — only include if the brand uses a higher-level layout grid (WCDB-style sticky-left + scrolling-right, multi-column childWrapper). Show the layout-grid diagram and how the sectionArray grid nests inside each column |
| `content` | Lexical | **In-editor grid view** — a screenshot/mockup of what the `gridviewGrid` overlay looks like in the page editor when authors toggle "show grid". This is what authors see; document the styling treatment |
| `content` | Lexical | **Rules for picking spans** — short guidance for authors: "default to full-row", "favor 6+6 or 4+4+4 over asymmetric splits unless the data justifies it", "row-spans only for visual hierarchy moments, not as a default" |

**What this page proves:** every Section on every page in `pages/`
sits on this grid. There are no "freehand" sections that ignore the
column system. **This is enforced** — when laying out an example
page in `pages/`, every Section's CSS width should derive from a
column-span in this grid's vocabulary, not from an arbitrary `width`
declaration.

**Mockup rule for `pages/*.html` (new in this version):** every
content area on every example page must visibly align to the
documented grid. Use a wrapper element with the same grid class
(`grid grid-cols-12` or whatever the brand uses), and give every
Section inside it a span class drawn from the grid's vocabulary.
A reviewer should be able to imagine the column ruler under any
page and see that every Section snaps to it.

### 7.5 `design-system/components.html` — the primitive gallery page

A single DMS-shaped page that demonstrates every UI primitive
listed in §2. One LayoutGroup per primitive category; within each
LayoutGroup, one Section per primitive showing it in its default
style, every named-style variant, and every relevant state.

**Every primitive in §2 gets a brand-skinned treatment.** Don't ship
codebase defaults for primitives the brand brief doesn't explicitly
discuss — translate them as best as possible from the brand's
chosen tokens (palette, type ladder, spacing scale, surface
treatment). A Drawer, a Popup, a DeleteModal, a ButtonSelect — each
should appear in the brand's voice even when the brief is silent
about them, because an author will eventually drop one on a page
and the live render shouldn't look like Catalyst leaked through.
The brand README can still note primitives the theme isn't designed
*for* (e.g., a long-form magazine theme that doesn't expect Maps),
but those primitives should still be themed sensibly — not skipped.

**Recommended page structure** (Layout: `app`):

| LayoutGroup | Sections within |
|---|---|
| `header` | Page title + explanation |
| `content` (Navigation primitives) | **TopNav** (full), **SideNav** (compact + expanded, **including ≥2 nesting levels** with active and hover states), **NavigableMenu** (closed + open), Nestable list |
| `content` (Form & interaction) | Button (all named styles × default/hover/focus/active/disabled states), Input (single-line + textarea + edit-buttons), MultiSelect (closed trigger / open menu / single-select / multi-select with tokens / tabular mode), Switch (off/on/disabled), Tabs, FieldSet, Label |
| `content` (Overlays) | Dialog (every `sizes` variant), Modal, Drawer, Popup, DeleteModal — captured as static snapshots, since live overlays don't fit inline |
| `content` (Containers & atoms) | Card (generic), dataCard (the workhorse — cells in grid mode and row mode, with image / link / text / formatted-number / full-bleed columns), Pill (all colour variants), Pagination, Icon, Logo (all lockups) |
| `content` (Rich content) | Lexical (all heading levels, paragraph, bold/italic, list, code, blockquote, link, image), Table (header + sortable + alternating rows + empty + paginated), Graph (bar / line / pie / scatter / grid with brand palette), Map |

> **TopNav and SideNav are easy to underspecify.** Both are large
> primitives with many keys (mobile-toggle button, multi-level
> navitems, submenu flyouts, depth-specific styling). The
> translation skill maps every key from this page into the theme —
> if a nav state isn't shown here, the translation skill won't know
> to theme it and the live nav will fall back to the default
> Catalyst look in that state. Show **at minimum**: the wrapper +
> background, logo area, primary menu in level-1 default + active
> + hover states, level-2 indent or flyout, level-3 if your tree
> goes that deep, the indicator icon for expandable items, and any
> bottom-menu / utility-widget slot.

**What this page proves:** every primitive in §2 has been styled.
The page can be a long scroll; the LayoutGroup-per-category
structure makes it navigable. **This page is the contract for the
primitive layer** — an engineer comparing live primitive renders
against this page should see them match exactly.

### 7.6 `design-system/patterns.html` — the composed patterns page

A single DMS-shaped page demonstrating **multi-primitive
compositions** that recur across the product. Each Section is one
pattern composed of multiple primitives.

**Recommended page structure** (Layout: `app`):

| LayoutGroup | Section | Pattern |
|---|---|---|
| `header` | Lexical | Page title + explanation |
| `content` | Card | **Empty state** — a data section with no rows: icon, message, call-to-action |
| `content` | Card | **Loading state** — a data section mid-load: skeleton or spinner |
| `content` | Card | **Error state** — a data section that failed: error message, retry button |
| `content` | Card | **Data section with filters** — header, filter chrome, table, pagination, all themed together |
| `content` | Card | **Card-grid section** — a Card section rendering multiple cards in a grid layout |
| `content` | Card | **Form layout** — a multi-field form: FieldSets, Inputs, MultiSelects, Switch, Submit/Cancel buttons |
| `content` | Card | **Modal-with-form** — captured snapshot of a Modal containing a form-layout pattern |
| `content` | Card | **Dataset overview** — the `datasets.datasetsList` chrome: category nav + dataset cards |
| `content` | Card | **Auth login** — the `layoutgroup-auth` + form pattern as it would appear on the sign-in page |
| `content` | Card | **Section toolbar** — the in-edit-mode chrome around a section: title, drag handle, section menu, column toolbar |
| `content` | Card | **Pattern-editor chrome** — admin pattern-editor surfaces (the page tree, the section menu, the column-config toolbar) |

**What this page proves:** the primitives compose coherently. The
data-section pattern, the form pattern, the auth pattern — these
are the moments where individual themed primitives have to look
right together, not just individually.

#### 7.6.5 Brand-recurring patterns to transcribe from the handoff

When translating a handoff design system into the DMS deliverable,
watch for *recurring* patterns that appear across multiple pages.
These aren't covered by primitives in §2 or page archetypes in
§7.6 — they're brand conventions the handoff applies to every page
of a certain type, and they're easy to drop because they read as
"per-page decoration" until you notice they're on six pages.

Catalogue these recurring patterns explicitly during the handoff
read, before producing pages. **The simplest test:** if you see a
UI element on 3+ pages in the handoff, it's a pattern, not a
one-off. Common ones:

- **Sticky right-rail TOC** — anchored to section heads. Appears
  on documentation pages, multi-section catalogs, design-system
  reference pages, "getting started"-style catalogs. Implement as
  a `[1fr_240px]` two-column wrapper inside the content
  LayoutGroup with the right column `position: sticky`. The DMS
  contract doesn't ship a native TOC primitive, so this is
  documentation-time wrapping — note it on the design system's
  `patterns.html` so it's discoverable.
- **Breadcrumbs** — almost always present on product pages above
  the page header. Note the separator character (slash, chevron,
  pipe) and whether it sits above or beside the page-header
  metadata.
- **Metadata strip** (refresh timestamp, status dot, data
  currency). Appears on dashboards near the page header. Easy to
  drop because it looks like one-off chrome but is the brand's
  consistent "freshness signal."
- **Page-header actions** — the right-aligned primary + secondary
  button pair next to the page title. Document the button styles
  used.

Add to §10 done criteria: *every recurring pattern depicted on 3+
handoff pages is preserved on every page that should have it.*

### 7.7 `pages/` — optional example pages (theme's choice)

One or more DMS-shaped pages that demonstrate **what this theme is
for** — chosen by the brand, not mandated by the platform.

Themes are deliberate choices, not universal renderers. A theme is
allowed to:

- **Have exclusive functionality.** A theme can ship column types,
  page components, or named-style variants that only make sense in
  its context.
- **Decline to render contexts it isn't for.** A theme designed
  for long-form magazine-style content doesn't need to prove it
  also works as a heavy analytics dashboard.
- **Ship zero, one, or many example pages.** Pick the number that
  honestly demonstrates the theme's intent. One well-chosen example
  beats four perfunctory ones.

**No new primitives or patterns are allowed here.** Anything the
example pages render must also appear in `components.html` or
`patterns.html`. The example pages exercise the system; they don't
extend it.

**File naming:** descriptive, kebab-case, no fixed list —
`radio-station-home.html`, `county-overview.html`, etc.

### 7.7.1 Transcription discipline — when a handoff exists

If the brand ships a high-fidelity handoff (HTML/JSX prototypes,
Figma frames, a rendered prototype site), your `pages/` mockups are
**transcriptions** of those designs, not redesigns. Specifically:

- **Content** — every visible element on the handoff page appears in
  your transcription. Same eyebrows, same h2 titles, same chips,
  same KPI metric cards, same charts. No "improvements" that drop
  content the handoff includes.
- **Structure** — same sections in the same order, with the same
  relative widths and the same primitives in the same roles. The
  handoff is the layout contract.
- **Primitives** — pick the closest theme primitive for each
  handoff element. The *role* matches even if a single class string
  or weight value has to change to use the theme's tokens. The
  theme's primitives are the building blocks; the handoff is the
  spec for what to assemble out of them.
- **Tokens** — every text class on every transcribed page resolves
  to a `textSettings` token. See §8 MUST list.

**Two specific deviation traps:**

1. **Token-first invention.** When the brand brief says one thing
   and the handoff does another, **follow the handoff**. The brief
   documents intent; the handoff is the contract. (E.g. the brief
   may say "status is a dot, never a background" but the handoff's
   compliance KPI cards use bordered colored-bg pills. The pills
   win; reconcile the brief later.) Note the disagreement in the
   brand README so the brief can be updated, but don't redesign the
   page to follow the brief.

2. **Class-string copying.** When the handoff uses
   `font-oswald font-semibold text-[22px]` and the theme ships
   `displaySM` (`font-display font-medium text-[22px]`), use
   `displaySM` even if the weight differs. The token represents the
   brand's intended size+family role across the catalogue; tweaking
   600 → 500 may feel like a regression on that one element but
   keeps the brand consistent everywhere.

The discipline is: **handoff for content + structure + primitive
selection; theme tokens for implementation.** Both halves matter —
verbatim handoff transcription drifts from the brand's tokens; pure
token-first translation drifts from the design.

---

## 8. Implementation rules for mockup pages

The four `design-system/` pages and every `pages/` page are
**plain HTML files**. The rules are tight and intentional:

**MUST:**

- ✅ **Plain HTML5.** `<!doctype html>`, `<html>`, `<head>`,
  `<body>`. No JSX. No templating engine.
- ✅ **Tailwind via CDN.** `<script src="https://cdn.tailwindcss.com"></script>`
  in `<head>`. No PostCSS, no `tailwindcss` npm install, no
  build pipeline. The CDN script is the toolchain.
- ✅ **Brand surface utilities in `_shared.css`.** `@font-face`
  declarations, brand surface classes, any hover/press effects
  that can't be Tailwind-expressed. Each page links it:
  `<link rel="stylesheet" href="../_shared.css"/>`.
- ✅ **Brand font-family classes defined as plain CSS in
  `_shared.css`.** Every brand font-family class referenced by
  mockups (`.font-display`, `.font-proxima`, `.font-oswald`, etc.)
  must be a literal CSS rule, not relied on from an inline
  `tailwind.config` block:
  ```css
  .font-display, .font-oswald { font-family: "Oswald", "Bebas Neue", sans-serif; }
  .font-proxima               { font-family: "Proxima Nova", "Source Sans 3", system-ui, sans-serif; }
  ```
  The inline `tailwind.config` block is per-page and easy to forget
  on the N-th page; the CSS rule covers every mockup that links the
  stylesheet. (The inline config is for the *production runtime*
  via Tailwind v4 `@theme`, not for the static mockups — see the
  translation skill's `fonts` array entry.)
- ✅ **Every text class string on every mockup page resolves to a
  `textSettings` token.** Orthogonal modifier axes — color
  (`text-emerald-700`), family (`font-display` / `font-proxima` /
  `font-mono`), `italic`, `tabular-nums`, `uppercase`,
  `tracking-…` — are applied at the call site as additional
  classes; that's not "inventing a token", that's using the token
  correctly. But `text-[19px]`, `font-medium text-[37px]`, inline
  `style="font-family: …"`, and any other invented size/weight
  combination are out — pick the nearest token or earn a new one
  in `theme.html`'s Type section first (§7.2.1 earn-a-token rule).
  This is what populates the live DMS Card section's
  `valueFontStyle` dropdown — invented inline classes are
  unreachable to authors.
- ✅ **Brand typefaces via Google Fonts CDN** in every mockup's
  `<head>`, not local woff2 files:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap">
  ```
  Don't bundle local woff2 into the mockup folders. `_shared.css`
  lives in multiple subdirectories and relative `./fonts/` paths
  drift; `file://` previewing has woff2 CORS quirks; and copies
  duplicate every kilobyte. Local fonts belong in the *production*
  theme (`theme/fonts/`) consumed by `theme.js`'s `fonts` array —
  that's an orthogonal concern.
- ✅ **DMS hierarchy in HTML.** Each page is a real
  `<div class="…outerWrapper…">` (Layout) containing
  `<div class="…wrapper1…">` (LayoutGroup) containing
  `<div data-section …>` (Section) containing the actual primitive
  markup. The class strings on each wrapper match what the brand
  intends to ship as Layout / LayoutGroup theme values.
- ✅ **Inline icons as raw `<svg>`.** Each icon SVG is pasted
  inline. Add an HTML comment with the registry name
  (`<!-- icon: CaretDown -->`) so a reader can trace back.
- ✅ **Real content.** Real names, real numbers, real copy.

**MUST NOT:**

- ❌ **No JavaScript framework.** No React, no Vue, no Svelte,
  no Alpine.
- ❌ **No JSX, no Babel.** Mockups must be readable to a designer
  who does not know JavaScript.
- ❌ **No build step.** No Vite, no Webpack, no esbuild, no
  bundler. The page loads in a browser served by
  `python -m http.server` from the project root.
- ❌ **No vanilla JavaScript either,** except a single optional
  `<script>` block per page that flips static "open" / "closed"
  states of popovers if absolutely needed.
- ❌ **No inline `style="…"`** unless the value can't be expressed
  as a Tailwind class (e.g. `style="background:#1F3F8F"` for a
  swatch is fine; `style="margin-top: 12px"` is not — use `mt-3`).

**Why this constraint matters:**

- A designer who knows HTML and Tailwind can open any mockup,
  edit it directly in a text editor, and see the change on reload.
- The mockup HTML is the same shape the live DMS render produces.
- The constraint forces honesty: if a primitive needs a build step
  to demo, it can't be themed by Tailwind classes — and the theme
  system is Tailwind classes, full stop.

### 8.0.5 `_shared.css` — one canonical source

`theme/index.css.additions` is the canonical source. Earlier
versions of this skill suggested copying it into
`design-system/_shared.css` and `pages/_shared.css`. **Don't** —
the copies drift the moment a token changes and the
documentation-vs-production rules disagree.

Both `design-system/*.html` and `pages/*.html` should link the
canonical file via relative path:

```html
<!-- from design-system/*.html -->
<link rel="stylesheet" href="../theme/index.css.additions"/>

<!-- from pages/*.html -->
<link rel="stylesheet" href="../theme/index.css.additions"/>
```

The Play CDN doesn't care about the `.additions` extension; it's
plain CSS. If your editor needs `.css` for syntax highlighting,
make `_shared.css` a one-line `@import "../theme/index.css.additions";`
shim rather than a content copy.

### 8.1 Annotation overlay (optional)

A small CSS rule on `_shared.css` can reveal structural badges
(`LAYOUT · GROUP · SECTION`) when `<body class="dms-annotated">` is
set. Useful on `layouts.html`, `grid.html`, and `theme.html`. Default
off on `pages/` so example pages look like the real product.

---

## 9. What NOT to design

A list of things you'll be tempted to produce that don't fit:

- ❌ **Custom layouts per page.** Every page goes through Layout →
  LayoutGroup → Section.
- ❌ **Absolutely-positioned hero art.** Heroes live inside a
  `header`-style LayoutGroup with Sections inside.
- ❌ **Carousels, marquees, scroll-jacked sections.** Not in the
  Component Registry.
- ❌ **Per-page navigation patterns.** Nav is at the Layout level.
- ❌ **New top-level UI primitives.** If a design needs a primitive
  not in §2 (an audio player, a video player, a calendar), that's
  a developer task — extending the Component Registry — not a
  theme decision.
- ❌ **Breaking the markup tree of an existing primitive.** If the
  Layout's markup is `outerWrapper > wrapper > wrapper2 > wrapper3 >
  childWrapper`, the design has to fit that.

---

## 10. Done criteria

A design system is **done** when:

1. The brand brief's aesthetic decisions are reflected in every
   `design-system/` page.
2. All five pages in `design-system/` render correctly, each shaped
   as a real DMS page.
3. Any example pages in `pages/` render correctly, demonstrating
   the theme's primary use case.
4. Every primitive that appears in `pages/` also appears in
   `design-system/components.html`; every pattern that appears in
   `pages/` also appears in `design-system/patterns.html`. No
   smuggling.
5. TopNav and SideNav are shown with **at least one active
   sub-level and the indicator-icon state** — see §7.5 callout.
   Translating navs is where every previous pass underspecified.
6. **Every Section on every page in `pages/` is laid out on the
   column grid documented in `grid.html`** — same `gridSize`, spans
   drawn from the documented `sizes` vocabulary, no freehand widths.
   See §7.4.
7. The brand README states which primitives the theme is and
   isn't designed for, and which example pages prove it.
8. **Product LayoutGroups use `mr-auto`, not `mx-auto`** on
   `wrapper2`, and `sectionArray.styles[0].layouts.centered` is
   `'max-w-[<cap>] mr-auto'`. Only the `auth` variant retains
   `mx-auto`. See §7.3.1.
9. **`layouts.html` ships the LayoutGroup variants Card AND the
   wrapper-class reference table AND the section-width section.**
   All three are required — variants alone don't surface the
   `mx-auto` / `mr-auto` decision. See §7.3.
10. **Every recurring pattern depicted on 3+ handoff pages is
    preserved on every page that should have it.** Sticky right-rail
    TOCs, breadcrumbs, metadata strips, page-header action pairs —
    see §7.6.5.
11. **Every primitive in §2 has a brand-skinned treatment in
    `components.html`** (best-effort from brand tokens, even when
    the brief is silent about that primitive). No codebase-default
    Catalyst chrome leaking through.

What the design system is **not** required to do:

- Render every possible kind of site the platform supports.
- Match what other themes do.

---

## 11. Hand-off to the translation skill

The output of this skill is the **input** to
[`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md).
That skill's job is to take your completed `design-system/` and
`pages/` and produce a `theme/theme.js` overlay that, when dropped
into a DMS site, renders pages that match your mockups.

For that hand-off to work cleanly:

- Every primitive the brand uses must appear at least once in
  `design-system/components.html` with all its visible states.
- The Layout and LayoutGroup variants the brand ships must each
  have a mini-mockup in `design-system/layouts.html`.
- The page-content column grid (sectionArray) must be documented
  fully in `design-system/grid.html` — `gridSize`, `defaultSize`,
  the `sizes` vocabulary, the `centered` max-width, `sectionPadding`,
  and any layout-level higher grid (WCDB-style).
- Multi-primitive compositions belong in `design-system/patterns.html`.
- TopNav and SideNav must be shown with **multi-level
  navigation, active states, hover states, and indicator
  icons** — the live `TopNav.jsx` / `SideNav.jsx` consume many
  more theme keys than a single static mockup conveys; the more
  states you show, the fewer keys the translation skill has to
  invent.

---

## 12. Reading list

Before designing for DMS, read in order:

1. **The handoff design** if one exists (HTML/JSX prototypes,
   Figma frames, rendered prototype site) — the canonical
   approved design you'll be transcribing. **This is the
   contract**, not the brief. When transcribing a brand that ships
   a handoff, the handoff is read first because every transcription
   decision flows from it.
2. **The chosen brand brief** (`references/dms product/brand-tessera.md`
   / `brand-lingua.md`) — documentation of the aesthetic intent
   the handoff implements. Read second; useful when reconciling
   the handoff against tokens.
3. **This document** — the structural grammar.
3. **`src/dms/packages/dms/src/ui/components/`** — the authoritative
   primitives catalogue. Skim the filenames; you don't need to read
   the components themselves, just know what exists.
4. **`src/themes/CLAUDE.md`** — the "configure the Card, don't write
   a new component" philosophy. Important for understanding why the
   Card primitive is the workhorse and gets the most design attention.
5. **[`card-layout.md`](./card-layout.md)** — the full surface of
   Card-section authoring knobs (cellsGridSize, cellSpan, formatFn,
   cardHints, etc.). Read before deciding how a dataCard variant is
   themed — the Card is the workhorse primitive and most of its
   visual personality is configurable, not themed.
6. **`src/themes/avail/theme.js`** and **`src/themes/wcdb/`** — two
   existing themes, very different in tone, that demonstrate how
   the platform supports a wide visual range.
7. **`src/themes/transportny/TransportNY Design System/dms_design_system_v2/`**
   and **`src/themes/tessera/design_system_v2/`** — two completed
   design systems shaped by this skill.
8. **[`creating-page-section-components.md`](./creating-page-section-components.md)**
   — when a primitive genuinely doesn't exist and a new page-section
   component is justified. Bar is high; read this skill before
   reaching for it.
9. **[`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md)**
   — the next step: how your output becomes a runnable theme.

---

## Appendix — quick reference cheat sheet

```
Hierarchy:    Site → Layout → LayoutGroup → Section → Component/Primitive
Primitives:   listed in src/dms/packages/dms/src/ui/components/
Deliverable:  brand-output/
              ├── README.md
              ├── _shared.css
              ├── design-system/   5 DMS-shaped docs pages
              │     theme · layouts · grid · components · patterns
              └── pages/           one or more theme-chosen example page(s)

Each entry in design-system/ and pages/ is structured as a real
DMS page (Layout > LayoutGroup > Section), built as plain HTML +
Tailwind CDN, no JSX, no JS framework, no build step.

Every Section on every page in pages/ sits on the column grid
documented in grid.html (typically 12 columns). No freehand widths.

The biggest single primitive to get right:  dataCard (Card)
The most far-reaching single artifact:      textSettings
The primitive that's hardest to do well:    TopNav / SideNav
                                            (many keys; show all states)
The thing that breaks if you don't ship it: icons + names
The constraint that keeps it honest:        plain HTML + Tailwind, nothing else
The honest difference between layouts & grid:
  layouts.html → page chrome shapes (Layout + LayoutGroup variants)
  grid.html    → column grid sections lay on (sectionArray, typ. 12-col)
Themes are choices:  may have exclusive features; need not be
                     cross-compatible with other themes.
```
