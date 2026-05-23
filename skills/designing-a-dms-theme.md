# Designing a theme and design system for DMS

How to produce a complete theme and design-system folder for a DMS site
or for the DMS product itself — the right folder shape, what each file
contains, and the implementation rules (plain HTML + Tailwind, **no
build step, no JSX/React/JS framework**) the mockups must follow.

> **Audience:** a designer (human or AI) producing v0.1 design tokens,
> components, and templates. Pair this skill with a brand brief
> (e.g. `references/dms product/brand-tessera.md` or
> `references/dms product/brand-lingua.md`) — this document is the
> structural grammar, the brief is the aesthetic decisions.
>
> **Worked example:**
> [`src/themes/transportny/TransportNY Design System/dms_design_system/`](../../../themes/transportny/TransportNY%20Design%20System/dms_design_system/) —
> the TransportNY brand in the exact format this skill prescribes.
> [`src/themes/tessera/design_system_v2/`](../../../themes/tessera/design_system_v2/) —
> the Tessera brand, second pass.

---

## Outcome

You ship a folder shaped like this, and an engineer can drop `theme/`
into a DMS site without writing new components:

```
brand-output/
├── README.md
├── theme/                  # the shipped code artifact (JS, icons, Tailwind)
├── design-system/          # FOUR pages documenting this theme
│   ├── theme.html              · color, type, icons, spacing tokens
│   ├── grid.html               · Layout + LayoutGroup variants
│   ├── components.html         · every UI primitive THIS theme uses
│   └── patterns.html           · composed multi-primitive patterns
└── pages/                  # OPTIONAL example pages — theme's choice
    └── <one or more>           · show this theme's intended use
```

Every `.html` file is a **plain HTML page** that loads Tailwind from
the CDN and the brand's surface utilities from `_shared.css`. No build
step. No JSX. No React, Vue, or any framework. No JavaScript bundler.

---

## The five-step workflow

1. **Read the brand brief** for the aesthetic decisions
   (`brand-tessera.md` / `brand-lingua.md`).
2. **Read [§1–§11 below](#0-why-this-document-exists)** for the
   structural grammar — what surfaces exist, how they nest, what
   knobs the theme system exposes.
3. **Produce `theme/`** — `theme.js`, `icons.js`, `tailwind.additions.js`,
   `index.css.additions`, `README.md`. See [§12.1](#121-theme--the-shipped-code-artifact).
4. **Produce `design-system/`** — four DMS-shaped HTML pages.
   See [§12.2–§12.5](#122-design-systemthemehtml--the-tokens-page).
5. **Produce `pages/`** — one or more theme-chosen example pages.
   See [§12.6](#126-pages--optional-example-pages-themes-choice).

[**Implementation rules** (§12.8)](#128-implementation-rules-for-mockup-pages) are
non-negotiable: **plain HTML + Tailwind CDN + the brand's
`_shared.css`, nothing else**. If you find yourself reaching for
React or a build step, stop — the constraint is the feature.

---

## 0. Why this document exists

DMS is not a blank canvas. It is a **constrained composition system**:
every UI in the product is built from a small set of themed primitives
arranged inside a fixed hierarchy. The constraint is the feature —
authors compose pages without writing code precisely because the
primitives and the hierarchy are fixed.

A design agent given only a brand brief will inevitably produce designs
DMS can't render — custom heroes with absolutely-positioned art, novel
nav patterns, bespoke layouts per page. **Don't.**

The deliverable for a DMS design system is not "new components." It is:

1. **Theme tokens** (Tailwind class strings) for the existing primitives.
2. **Named style variants** for primitives that need more than one look.
3. **Templates** that demonstrate how the brand inhabits the existing
   structure, rendered against real content.

All of these ship inside a **fixed folder structure**. Every DMS
design system the agent produces has three top-level entries (see [§12](#12-the-deliverable--folder-structure-and-pages-as-documentation)).

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

The same hierarchy renders a marketing homepage, a dataset admin page,
an analytics dashboard, and a map viewer. The differences are
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
| **Component / Primitive** | Component-registry entries (Card, Spreadsheet, Graph, Map, Lexical, etc.) + UI primitives (Button, Input, MultiSelect, …) | The actual content rendering. | Each primitive's theme keys (see §6). |

There is one piece *adjacent* to the hierarchy that the designer must
also style:

- **textSettings** — the global type scale. Heading sizes, body sizes,
  named font roles. Sourced once on the theme; consumed by Card,
  Lexical, Header, and any column type that renders text. See §7.

And one cross-cutting registry:

- **Icons** — a name → SVG-component map registered on the theme.
  Components reference icons by name, never by import. See §8.

---

## 2. Theme grammar (the most important section to read)

DMS does not use CSS variables or design tokens in the modern sense.
**A theme is a plain JavaScript object whose values are Tailwind class
strings.** That object is provided via React context; every primitive
reads it via a single helper.

Don't fight this. The whole authoring story depends on themes being
serialisable to JSON and editable through an admin UI; CSS variables
and runtime style objects would break that.

### 2.1 The shape of a primitive's theme

Most primitive themes follow this shape:

```js
export const fooTheme = {
  options: { activeStyle: 0 },
  styles: [
    {
      name: "default",
      wrapper:   "flex flex-col p-4 bg-white",
      title:     "text-lg font-semibold text-zinc-900",
      content:   "mt-2 text-sm text-zinc-600",
      button:    "px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600",
      icon:      "Menu",   // ← icon NAME, not classes
    },
    {
      name: "dark",
      wrapper: "flex flex-col p-4 bg-zinc-900",
      title:   "text-lg font-semibold text-white",
      // 'content' and 'button' inherit from styles[0]
    },
  ],
};
```

Key facts:

- **`styles[0]` is the complete default.** Every renderable key the
  component needs must exist here. The design system's main deliverable
  is the contents of this default style for every primitive.
- **`styles[1..n]` are sparse overrides.** They only specify keys that
  differ from the default. Missing keys are filled in from `styles[0]`
  automatically. Use these for named variants (e.g. a "dark" Card, a
  "compact" Table, a "ghost" Button).
- **`options.activeStyle`** selects which style is active by default.
  Components also accept an `activeStyle` prop that wins over this.

Some older themes are **flat** — no `options`/`styles`, just keys
directly:

```js
export const inputTheme = {
  input:          "relative w-full block …",
  inputContainer: "group flex relative …",
  textarea:       "relative block h-full …",
};
```

Both shapes are supported. **Prefer the `options/styles` shape for new
or rebuilt themes** — it's the format the theme editor knows about and
it supports named variants. Flat themes work but can't be re-skinned
from the admin UI.

### 2.2 How a component reads its theme

A themed component always has the same three lines at the top:

```jsx
const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
const t = {
  ...fooTheme.styles[0],                            // local default fallback
  ...getComponentTheme(themeFromContext, 'foo', activeStyle),
};
// Then: <div className={t.wrapper}>…
```

What the design agent needs to know:

- **`getComponentTheme(theme, 'foo', activeStyle?)`** resolves the named
  style. It handles the default fill-in (so sparse overrides work),
  honours `activeStyle` passed in or `options.activeStyle` on the
  theme, and falls back gracefully for the flat shape.
- The component spreads its **local default first** as belt-and-braces
  — this is so the component still renders something if it's mounted
  outside a ThemeContext. The merged-in context theme overrides the
  local default on any key it provides.
- **The keys are the API.** When a design agent says "the Card's
  header text should be larger," the answer is to change
  `dataCard.styles[0].headerText` (or whatever the key is named) — not
  to write CSS or to wrap the component.

### 2.3 What "theming" actually changes

Everything that can be expressed as Tailwind utility classes is in
scope. Things that are *not* in scope for the theme system:

- **Custom CSS.** There is no CSS file the design agent ships beyond
  `index.css.additions` (small, well-scoped — `@font-face`, brand
  surface utilities like `.tny-pane`, hover/press effects that aren't
  expressible as Tailwind variants). Everything else is Tailwind
  utilities composed into class strings on the theme.
- **Custom DOM structure.** The components have fixed markup. If a
  design needs a different markup tree, that's a request to change a
  *component*, not a theme.
- **Custom fonts loaded at runtime.** Fonts come from Tailwind's
  `fontFamily` config or from CSS injected at the site level (via
  `index.css.additions`). The theme references them by Tailwind class
  (`font-sans`, `font-display`, `font-mono`) — never by URL.
- **Color tokens as variables.** Colors are Tailwind color strings
  (`bg-zinc-50`, `text-blue-700`, `border-amber-500/30`). If a site
  needs a custom palette, it goes through Tailwind's color config and
  the theme uses the Tailwind class names.

### 2.4 Theme merging across sites

A downstream site provides a partial theme that merges into the DMS
default theme via `mergeTheme()`:

- **`styles[0]` is deep-merged** across themes. A site can override
  individual default keys without re-specifying the entire default.
- **`styles[1..n]` come from whichever theme defines them.** No index
  collisions across themes. A site's "Dark" style at index 1 does
  *not* inherit from the base theme's "Dark" style at index 1 — it
  just inherits from the base theme's `styles[0]`.

For the design agent: produce a **complete** theme overlay that
specifies every key the design depends on. Don't rely on inherited
keys from the DMS default theme unless you've verified they match the
brand.

### 2.5 Why class-string themes (and not CSS-in-JS, CSS vars, etc.)

This isn't a design choice that's up for debate; it's a load-bearing
property of the platform:

- Themes are **serialisable to JSON**, edited from the admin UI by
  non-technical users, persisted in the same `data_items` table as
  pages and sections. CSS-in-JS would defeat this.
- Tailwind utilities give the design agent the entire Tailwind design
  system (spacing scale, color palette, responsive variants,
  state variants) for free. CSS vars would re-invent half of that.
- Class strings can be diffed, copy/pasted between sites, version-
  controlled, and code-reviewed like any other text.

Design accordingly. Think in Tailwind utility classes from the start.

---

## 3. The Layout component

Every page is wrapped in a `<Layout>`. The Layout owns the page's
chrome: an outer wrapper, optional TopNav, optional SideNav, and the
content area where LayoutGroups live.

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

### 3.2 Theme keys

The Layout theme uses the `options`/`styles` shape:

```js
{
  options: {
    activeStyle: 0,
    sideNav: { size: 'compact' | 'none', nav: 'main' | 'secondary' | 'none', activeStyle: null, topMenu: [...], bottomMenu: [...] },
    topNav:  { size: 'compact' | 'none', nav: 'main' | 'secondary' | 'none', activeStyle: null, leftMenu: [...], rightMenu: [...] },
  },
  styles: [
    {
      name: "default",
      outerWrapper: "bg-slate-100",
      wrapper:      "relative isolate flex min-h-svh w-full max-lg:flex-col bg-white lg:bg-zinc-100",
      wrapper2:     "flex-1 flex items-start flex-col items-stretch max-w-full min-h-screen",
      wrapper3:     "flex flex-1 items-start",
      childWrapper: "flex-1 flex flex-col h-full",
    },
  ],
}
```

What the design agent decides per Layout style:

| Key | What it controls |
|---|---|
| `outerWrapper` | Page background fill, top-level isolation. |
| `wrapper` | Flex direction of the full page, min-height, responsive breakpoint behaviour for the nav row. |
| `wrapper2` | The column containing TopNav + content (when sideNav is on the left). Controls max-width, alignment, content stretching. |
| `wrapper3` | The row containing SideNav + content. Controls flex direction, alignment between nav and content. |
| `childWrapper` | The content area itself. Controls how content fills the available space (`flex-1`, `h-full`, etc.) and is the parent of LayoutGroups. |

### 3.3 Nav configuration

The `options.sideNav` and `options.topNav` objects control whether
each nav renders, what menu it draws (primary nav from the site, a
named secondary nav, or none), and what widgets bracket the menu
(logo, user menu, search button, etc.).

The design agent **does not** style nav contents at the Layout level —
those have their own themes (`sidenav`, `topnav`). The Layout only
decides:

- Is the side nav visible? (`size: 'compact' | 'none'`)
- Is the top nav visible? (`size: 'compact' | 'none'`)
- Which named-style variant of each nav to use (`activeStyle: number | null`)
- What widgets sit in the nav's top/bottom or left/right slots

### 3.4 Recommended Layout variants

A typical brand should ship at least three named Layout styles:

| Name | When | Characteristics |
|---|---|---|
| `default` | Marketing site, public-facing pages | Both navs may be absent; generous max-width content area; light background. |
| `app` | Authoring / admin / dashboard surfaces | SideNav visible (compact), narrower content gutters, denser. |
| `bare` | Auth pages, embedded views, print | No navs, no chrome, content fills the viewport. |

These names are conventions only — the system doesn't require them.
But shipping multiple Layout styles signals "the system is themable per
context," which is part of the platform's value proposition.

---

## 4. The LayoutGroup component

A LayoutGroup is a **band of content** within a Layout's content area.
A page may have several — a `header` group, one or more `content`
groups, a `footer` group. Each group hosts one or more Sections.

The LayoutGroup defines the *grid the Sections live inside* — the
inner container that determines whether content is full-width or
boxed, what padding it has, what background it sits on, whether it
casts a shadow.

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

### 4.2 Theme keys and named styles

The default theme ships three named LayoutGroup styles:

```js
{
  options: { activeStyle: 0 },
  styles: [
    {
      name: "content",
      wrapper1: "w-full flex-1 flex flex-row p-2",
      wrapper2: "flex flex-1 w-full flex-col shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 min-h-[200px]",
      wrapper3: "",
    },
    {
      name: "header",
      wrapper1: "w-full flex-1 flex flex-row",
      wrapper2: "flex flex-1 w-full flex-col relative min-h-[200px]",
      wrapper3: "",
    },
    {
      name: "auth",
      wrapper1: "w-full flex-1 flex flex-row p-2",
      wrapper2: "flex flex-1 w-full flex-col shadow-md bg-white rounded-lg relative text-md font-light leading-7 p-4 place-content-center",
      wrapper3: "",
    },
  ],
}
```

What the design agent decides per LayoutGroup style:

| Style | Use | Differentiating treatment |
|---|---|---|
| `content` (default) | Main page body | Boxed: shadow, rounded corners, white card surface, generous padding. |
| `header` | Top of page (hero, title band) | Unboxed: no shadow, no rounded corners, content sits directly on the Layout background. |
| `auth` | Sign-in / sign-up pages | Boxed and centred vertically (`place-content-center`). |

A brand may add additional named styles (e.g. `footer`, `feature`,
`testimonial`) for different bands. The Section authoring UI lets
page editors choose which style each LayoutGroup uses, so any styles
the design agent ships will appear in the editor's dropdown.

### 4.3 What the LayoutGroup *is* and *isn't*

- **It is** the layered surface that contains Sections. Think of it as
  the "page card" in dashboard design.
- **It isn't** the grid that lays Sections out *within* it. Sections
  arrange themselves (and their internal columns) via their own
  config; the LayoutGroup just provides the surface they sit on.

For the designer: treat each named LayoutGroup style as a **surface
recipe** — what kind of page band is this? Hero? Boxed content? Auth
form? Footer? Each recipe is one entry in `styles[]`.

---

## 5. Sections (briefly)

A Section is a single editable block on a page. From the design
agent's perspective:

- Sections don't have a meaningfully themable wrapper of their own
  beyond what the pattern theme provides (titles, group dividers,
  edit-mode chrome).
- The interesting design surface is the **component the Section
  wraps**: Card, Spreadsheet, Graph, Map, Lexical, Header, Footer,
  Filter, etc. These are listed in the Component Registry and each
  one has its own theme key (see §6).
- Section chrome (titles, drag handles, the section menu in edit
  mode) lives under the **pages pattern theme** (`pages.*`) — see §9
  for pattern-level themes.

The designer mostly does not need to design Section chrome directly.
Style the *components* sections wrap and the *LayoutGroup* sections
sit inside; the Section chrome will compose around them coherently.

---

## 6. UI primitives catalogue

These are the components every DMS surface is built from. Each one
has a theme key registered in `ui/defaultTheme.js` and a
`.theme.{js,jsx}` sibling next to the component file.

**The deliverable for the design system is the contents of `styles[0]`
for each of these.**

### 6.1 Navigation primitives

#### `topnav` — TopNav
A horizontal bar at the top of the Layout. Variable widgets in the
left and right slots; main or secondary menu in the centre.
Theme keys (typical): `wrapper`, `inner`, `menu`, `menuItem`,
`menuItemActive`, `leftMenu`, `rightMenu`, `mobileToggle`.

#### `sidenav` — SideNav
A vertical column at the left of the Layout. Top and bottom widget
slots; main or secondary menu in between. Supports compact and
expanded modes.
Theme keys (typical): `wrapper`, `inner`, `topMenu`, `bottomMenu`,
`menuItem`, `menuItemActive`, `subItem`, `subItemActive`,
`item_level_1`, `item_level_2`, `item_level_3`, icons.

#### `navigableMenu` — NavigableMenu / Dropdown
A keyboard-navigable popover menu used inside other components
(section menus, column-config toolbars).
Theme keys: `button`, `icon`, `iconWrapper`, `menuWrapper`,
`menuItem`, `menuItemHover`, `menuItemIconLabelWrapper`,
`menuItemIconWrapper`, `menuItemLabel`, `subMenuIcon`,
`valueWrapper`, `separator`.

#### `nestable`, `nestableInHouse` — Nestable lists (drag-to-nest)
Used in the side-nav editor and page tree. Theme keys: wrapper,
item, dropZone, handle, etc.

### 6.2 Form & interaction primitives

#### `button` — Button
The action primitive. Multiple named styles encouraged:
`default`, `plain`, `active`, `danger`, `ghost`.
Theme keys per style: `button` (full class string for the button).
Add: `icon`, `iconLeft`, `iconRight` if the design includes them.

#### `input` — Input
Single-line text input. Currently flat theme:
`input`, `inputContainer`, `textarea`, `confirmButtonContainer`,
`editButton`, `cancelButton`, `confirmButton`.

#### `multiselect` — MultiSelect
The canonical selection primitive (replaces former Select / Listbox /
ComboBox). Used as the single-select trigger too via
`singleSelectOnly: true`. Theme keys: many — see
`MultiSelect.theme.js` for the full set. Key ones:
`view`, `mainWrapper`, `inputWrapper`, `caretWrapper`, `caretIcon`,
`input`, `statusWrapper`, `singleValue`, `singlePlaceholder`,
`tokenWrapper`, `removeIcon`, `removeIconName`, `removeIconClass`,
`menuWrapper`, `alwaysOpenMenuWrapper`, `tabularMenuWrapper`,
`optionsWrapper`, `menuItem`, `smartMenuWrapper`, `smartMenuItem`,
`error`, `selectedValueIconName`, `selectedValueIcon`.

#### `tabs` — Tabs
Theme keys: `wrapper`, `tabList`, `tab`, `tabActive`, `tabPanel`.

#### `switch` — Switch
Boolean toggle. Theme keys: `wrapper`, `track`, `trackChecked`,
`thumb`, `thumbChecked`, `label`.

#### `field` — FieldSet
Container for form fields with label and help text. Theme keys:
`wrapper`, `label`, `description`, `error`.

#### `label` — Label
Plain text label primitive. Theme keys: `label`.

### 6.3 Overlay primitives

#### `dialog` — Dialog (currently flat theme)
Theme keys: `dialogContainer`, `backdrop`, `dialogContainer2`,
`dialogPanel`, `sizes` (sub-object keyed by size: `xs`, `sm`, `md`,
`lg`, `xl`, `2xl`, `3xl`, `4xl`, `5xl`).

#### `modal` — Modal
Larger / persistent overlay. Theme keys similar to Dialog.

#### Drawer — slide-in panel
Theme keys: wrapper, panel, backdrop, header, body, footer.

#### Popup — small floating element (tooltip / popover base)
Theme keys: wrapper, arrow, content.

#### DeleteModal — confirmation modal for destructive actions
Theme keys: wrapper, message, confirmButton, cancelButton.

### 6.4 Container & atom primitives

#### `dataCard` — Card section component
This is the **most important single primitive to get right.** The
Card is the workhorse of DMS pages (see `src/themes/CLAUDE.md`).
Authors compose pages by picking columns from a data source, setting
cell spans, choosing fonts, hiding/showing parts.
Theme keys (selected): `wrapper`, `cardsGrid`, `cellsGrid`,
`headerValueWrapper`, `headerValueWrapperFullBleed`, `header`,
`value`, `image*`, `link*`, plus many cell-layout knobs.
The Card theme is the largest in the system; budget time accordingly.

#### Card (UI primitive, generic) — `card`
A simple container card. Less rich than `dataCard`.
Theme keys: `wrapper`, `header`, `body`, `footer`.

#### `pill` — Pill / badge / chip
Inline status / token element. Theme keys: `wrapper` + per-colour
variants (`zinc`, `blue`, `green`, `amber`, `red`, …).

#### Pagination
Theme keys: wrapper, page, pageActive, prev, next, ellipsis.

#### `icon` — Icon
The icon-rendering primitive. Theme is mostly the **icon registry**
(see §8).

#### `logo` — Logo
The logo widget. Theme keys: `wrapper`, `image`, `text`, with named
styles for compact / full / mark-only variants.

#### `table` — Table (the data-grid)
Used by the Spreadsheet section and elsewhere. Theme keys (typical):
`wrapper`, `table`, `thead`, `th`, `tr`, `trAlt`, `td`, `tdEdit`,
`cellEditing`, `headerCell`, `headerCellSortable`, `pagination`.

### 6.5 Rich content primitives

#### `lexical` — Lexical rich-text editor
Theme keys: many — headings, paragraphs, lists, code, quote, links,
images. Inherits text-style keys from `textSettings`.

#### `graph`, `avlGraph` — Chart components
Theme keys: container, title, axis, grid, tooltip, plus color
palette config (the graph-color-scheme task discusses this in detail).

#### `map` — MapLibre wrapper
Theme keys: container, controls, legend, popover.

### 6.6 Cross-cutting / less-common primitives

- `attribution` — small "data source" attribution chip on data
  sections.
- `filters` — the data-section filter editor chrome.
- DndList, DraggableList, draggableNav — drag handles, drop zones,
  ghost styles.
- ButtonSelect, Colorpicker — specialised inputs.

The design agent should produce themes for these but they're lower
visibility; treat them as a second-pass after the primary primitives
ship.

---

## 7. textSettings — the global type scale

`textSettings` is a top-level theme entry holding **named text styles**
that every primitive that renders text can reference. It's what makes
"change all body text" a one-line edit instead of a grep.

### Shape

```js
{
  options: { activeStyle: 0 },
  styles: [{
    name: "default",

    // Heading roles (used by Lexical, Card, Header)
    h1: "font-semibold text-3xl scroll-mt-36 font-display",
    h2: "font-medium text-xl scroll-mt-36 font-display",
    h3: "font-medium text-lg scroll-mt-36 font-display",
    h4: "font-medium scroll-mt-36 font-display",
    h5: "scroll-mt-36 font-display",
    h6: "scroll-mt-36 font-display",

    // Size + weight scale (used by Card cells via valueFontStyle dropdown)
    textXS: "text-xs font-medium",
    textXSReg: "text-xs font-normal",
    textXSBold: "text-xs font-bold",
    textSM: "text-sm font-medium",
    textSMReg: "text-sm font-normal",
    // … through text8XL

    // Semantic aliases (used by misc primitives)
    body:      "text-base font-normal",
    bodySmall: "text-sm font-normal",
    caption:   "text-xs font-normal text-gray-500",
    label:     "text-sm font-medium",
  }],
}
```

### What the design agent ships

For each brand, produce:

1. **A `font-display` and `font-sans` Tailwind config** (in
   `tailwind.config` / `index.css`) wiring the brand's display and UI
   typefaces.
2. **A complete `textSettings.styles[0]`** that uses those Tailwind
   classes for every key in the schema above. Keys may be re-tuned
   per brand (e.g. one brand might set `h1` at `text-5xl`, another at
   `text-3xl`) — but every key must exist.
3. **Tabular-figures variants** for any text key likely to render
   numbers (`textXS`, `textSM`, `textBase`, table cells). The
   typography section of the brand brief specifies this.

Authors then choose per-cell which named text style to use from a
dropdown — the dropdown is populated from `textSettings`'s keys, so
adding a new key (e.g. `pullQuote`) automatically appears as an
option without touching code.

---

## 8. Icons — the registry

Icons are referenced **by name**, never by import. The theme provides
the registry:

```js
import icons from './icons'  // map: { Menu: <MenuIcon />, ChevronDown: …, … }

const theme = {
  // … other component themes
  Icons: icons,
}
```

Components store icon names in their theme:

```js
{
  navigableMenu: {
    styles: [{
      // …
      icon: "Menu",                  // ← name, not class
      subMenuIcon: "ArrowRight",
    }]
  }
}
```

And render via the `Icon` component, which looks up the name in
`theme.Icons`:

```jsx
<Icon className={t.iconWrapper} icon={t.icon} />
```

What the design agent ships per brand:

- A **complete icon set** matching the brand's icon style (see brand
  brief §4.6 for stroke weight, fill philosophy, etc.).
- A **mapping** from existing icon names (Menu, ChevronDown,
  ChevronRight, ArrowRight, ArrowLeft, XMark, Plus, Pencil, Trash,
  Check, CircleCheck, Search, Settings, User, Logo, …) to the
  brand's drawn versions. The names are the API; don't rename them.
- Optionally, **additional named icons** for brand-specific contexts
  (e.g. domain icons for civic / radio / transportation sites).

The icon set should be designed on a 24px grid with consistent
stroke weight. Use [Phosphor](https://phosphoricons.com),
[Lucide](https://lucide.dev), or a custom drawn set — but provide one
coherent style throughout.

For the **HTML mockup pages** (see §12.8): inline the icons as raw
`<svg>` elements with the icon name as a comment, so each mockup is
fully self-contained and a reader can trace from a sidebar glyph to
the registry name without reading any JavaScript.

---

## 9. Pattern-level themes (the `pages.*` etc. namespace)

A few components live inside specific patterns (page / datasets / auth)
rather than as global UI primitives. Their themes namespace under the
pattern key:

```js
{
  pages: { searchButton: {…}, attribution: {…}, complexFilters: {…}, sectionGroupsPane: {…}, … },
  datasets: { datasetsList: {…}, metadataComp: {…}, … },
  auth: { login: {…}, signup: {…}, … },
}
```

For most design work, these are styled the same way as primitives —
just with dot-pathed keys when reading via `getComponentTheme`:

```jsx
const t = getComponentTheme(themeFromContext, 'pages.searchButton', activeStyle);
```

The brand should at minimum theme:

- `pages.attribution` — the data-source chip on data sections
- `pages.complexFilters` — filter-tree editor inside data sections
- `pages.sectionGroupsPane` — the group-layout editor (admin-only)
- `pages.search*` — site-wide search
- `datasets.datasetsList` — the dataset index page chrome
- `datasets.metadataComp` — dataset column-config UI
- `auth.login` / `auth.signup` — auth pages

The design system docs / theme editor will surface these in their own
sections in the admin UI; they should feel coherent with the
primitives.

---

## 10. Mapping a brand to a theme — a recommended workflow

When given a brand brief and this design contract, the design agent
should produce its tokens in this order:

### Phase 1 — Foundation
1. **Tailwind config.** Set the brand's color palette in
   `tailwind.config` (extend existing zinc/blue/etc. ramps with brand-
   specific colors). Set `fontFamily.display`, `fontFamily.sans`, and
   `fontFamily.mono` to the brand's chosen typefaces.
2. **`textSettings.styles[0]`** — the global type scale (see §7).
   This is the most far-reaching single artifact; many other components
   inherit from it.
3. **Icons.** Choose / draw the icon set; register it as the theme's
   `Icons` map (see §8).
4. **Color philosophy.** Resolve which Tailwind classes serve as
   primary / secondary / accent / surface / divider for the brand.
   Document these as a small reference table that other component
   themes reference.

### Phase 2 — Composition
5. **`layout.styles[]`** — at least `default`, `app`, `bare` named
   styles (see §3.4).
6. **`layoutGroup.styles[]`** — at minimum `content`, `header`, `auth`;
   optionally `feature`, `footer`, etc.
7. **`topnav.styles[0]`** and **`sidenav.styles[0]`** — the two nav
   primitives in their default styles.
8. **`logo.styles[]`** — the brand mark in horizontal, stacked, and
   mark-only lockups.

### Phase 3 — Interaction
9. **`button.styles[]`** — at minimum `default`, `plain`, `active`;
   add `danger`, `ghost` as needed.
10. **`input` theme** (flat) — input, inputContainer, textarea, edit
    buttons.
11. **`multiselect.styles[0]`** — the largest single interaction theme;
    accounts for all the trigger / token / menu / pill states.
12. **`tabs`, `switch`, `field`, `label`** — the smaller form
    primitives.

### Phase 4 — Overlays & containers
13. **`dialog`, `modal`** (flat) — overlay primitives.
14. **`navigableMenu.styles[0]`** — used inside section toolbars.
15. **`pill.styles[]`** — at minimum default + color variants matching
    the brand's accent system.

### Phase 5 — Data surfaces
16. **`dataCard.styles[]`** — the Card section primitive. **Budget
    real time for this**; it's the workhorse of every DMS page.
17. **`table` theme** — the spreadsheet / data-grid look.
18. **`lexical` theme** — rich text styling; should inherit headings
    from `textSettings`.
19. **`graph` / `avlGraph` themes** — chart container, axis, tooltip,
    palette.
20. **`map` theme** — map controls, legend, popover.

### Phase 6 — Pattern-level
21. **`pages.attribution`**, **`pages.complexFilters`**,
    **`pages.sectionGroupsPane`**, **`pages.search*`** — page-pattern
    chrome (see §9).
22. **`datasets.datasetsList`**, **`datasets.metadataComp`** —
    dataset-pattern chrome.
23. **`auth.login`**, **`auth.signup`** — auth pages.

### Phase 7 — Example pages (theme-chosen, optional)

Render one or more example pages that demonstrate what *this theme*
is for. These are not validation against a universal set — they're
the brand's chosen showcase of its own intent.

The brand brief should already have identified the theme's primary
audience and use case (a radio station, a civic dashboard, a docs
site, a marketing site, …). Pick one or two real-content example
pages that put the theme in front of that audience.

- A theme that's "for radio stations" might ship a show-page mockup
  and a homepage mockup.
- A theme that's "for civic dashboards" might ship a county-overview
  mockup and an open-data list mockup.
- A theme that's "for technical docs" might ship a chapter mockup
  and a navigation-tree mockup.

These pages go in `pages/` (see §12.6). **One example page is a
fine deliverable; zero is acceptable for an early v0.x; many is
overkill.** The platform supports a wide range of site shapes;
individual themes don't have to.

If a token or component fails on the chosen example page(s), the
design agent returns to Phase 1 with that failure as input. The
test for the design system is whether it works for the brand's own
target — not whether it works for every possible target.

---

## 11. What NOT to design

A list of things a design agent will be tempted to produce that don't
fit:

- ❌ **Custom layouts per page.** Every page goes through Layout →
  LayoutGroup → Section. Bespoke per-page layouts can't be authored
  through the admin UI and so don't exist.
- ❌ **Absolutely-positioned hero art.** Heroes live inside a
  `header`-style LayoutGroup with Sections inside. The hero is a
  composition of Sections, not a custom block.
- ❌ **Carousels, marquees, scroll-jacked sections.** Not in the
  Component Registry; authors can't add them.
- ❌ **Per-page navigation patterns.** Nav is at the Layout level. A
  page can hide its nav (`size: 'none'` Layout style) but can't
  invent its own.
- ❌ **Inline CSS / `style={{...}}` props.** The theme system is the
  styling API. Inline style props leak past it.
- ❌ **CSS modules, styled-components, vanilla-extract.** None of
  these are in the codebase; introducing them defeats the
  serialisable-theme property.
- ❌ **New top-level UI primitives.** If a design needs a new kind of
  primitive (e.g. an audio player, a video player, a calendar), that's
  a request to extend the Component Registry — a developer task, not
  a theme decision.
- ❌ **Breaking the markup tree of an existing primitive.** If the
  Layout's markup is `outerWrapper > wrapper > wrapper2 > wrapper3 >
  childWrapper`, the design has to fit that. Don't ask for a different
  nesting; theme the existing one.
- ❌ **Renaming theme keys.** The keys are the API consumed by the
  components. Rename them and the theme stops applying.
- ❌ **Inventing new icon names without registering them.** Icons are
  looked up by name; an icon referenced in a theme that doesn't exist
  in the `Icons` map silently no-renders.

---

## 12. The deliverable — folder structure and "pages as documentation"

Every DMS design pass produces three top-level entries:

```
brand-output/
├── README.md
├── theme/                  # the shipped code artifact
│   ├── theme.js
│   ├── icons.js
│   ├── icons/                  # SVG sources
│   ├── tailwind.additions.js
│   └── index.css.additions
├── design-system/          # FOUR pages that document the theme
│   ├── theme.html              # color, type, icons, spacing tokens
│   ├── grid.html               # Layout + LayoutGroup variants
│   ├── components.html         # every UI primitive
│   └── patterns.html           # composed multi-primitive patterns
└── pages/                  # one or more theme-chosen example pages
    └── <descriptive-name>.html
```

`design-system/` and `pages/` are **siblings**, not nested. They
contain the same shape of artifact — a *DMS-shaped page* — and
differ only in what each page is for. Inside `design-system/`, each
of the four pages documents one slice of the system; inside `pages/`,
each page renders a real-world template to stress-test the system.

### The "pages as documentation" principle

Every file in `design-system/` and `pages/` is structured as a real
DMS page would be — a Layout containing one or more LayoutGroups
containing Sections. This is **non-negotiable** and is the single
most important constraint on the deliverable.

Why:

- **It dogfoods the platform.** The design system documents itself
  using the platform it documents. If the brand can't render its own
  design system as a DMS site, it can't render anything.
- **It enforces the constraint.** A "components" page that listed 19
  primitives in a flat HTML grid would inevitably use grid tricks
  DMS can't produce. A "components" page laid out as actual Sections
  inside actual LayoutGroups can only show what DMS can actually
  render.
- **It's portable.** Each mockup is one Layout + LayoutGroup +
  Section stack — the same data shape as a real DMS row. The
  mockups can be ported to live DMS pages later by an engineer (or
  a follow-up agent) by translating the mockup HTML into DMS row
  JSON.
- **It looks like the product.** A potential customer browsing the
  design system sees what the product actually produces, not what a
  designer wished it produced.

### 12.1 `theme/` — the shipped code artifact

This is the folder that gets dropped into `src/themes/<brand>/` and
shipped with the site. Everything else in the design system folder
exists to *validate* what's in here.

**Contents:**

- [ ] **`theme.js`** — the complete theme overlay. See skeleton
      below. This is one file because the existing avail and wcdb
      themes are one file each, and downstream code expects a single
      default export.
- [ ] **`icons.js`** — exports a map of `{ Name: <Component /> }`.
      Every icon name referenced anywhere in the theme must appear
      here.
- [ ] **`icons/`** — SVG sources (24px grid, consistent stroke
      weight) for every icon in the map.
- [ ] **`tailwind.additions.js`** — the snippets that need to be
      merged into the consuming project's `tailwind.config.js`:
      brand color ramps, `fontFamily.display` / `.sans` / `.mono`,
      any extended spacing or fontSize scales.
- [ ] **`index.css.additions`** — @font-face declarations (or font-
      provider imports), brand surface utilities (`.tny-pane`,
      `.tny-card`, etc.) the theme references by classname, and any
      minimal global resets the brand requires.
- [ ] **`README.md`** — one paragraph summary: the brand identity at
      a glance, which named variants exist for each themable
      primitive and when to use each, and any brand-specific column
      types or page components shipped alongside the theme.

**Skeleton for `theme.js`:**

```js
// design-system/theme/theme.js
import icons from "./icons";
import pageComponents from "./components";  // any custom column types

const brandTheme = {
  // Foundation
  textSettings: { … },
  Icons: icons,

  // Composition
  layout: { options: { … }, styles: [ … ] },
  layoutGroup: { options: { … }, styles: [ … ] },

  // Navigation
  topnav: { options: { … }, styles: [ … ] },
  sidenav: { options: { … }, styles: [ … ] },
  navigableMenu: { options: { … }, styles: [ … ] },
  nestable: { … },
  logo: { options: { … }, styles: [ … ] },

  // Interaction
  button: { options: { … }, styles: [ … ] },
  input: { … },
  multiselect: { options: { … }, styles: [ … ] },
  tabs: { … },
  field: { … },
  label: { … },

  // Overlays
  dialog: { … },
  modal: { … },

  // Containers / atoms
  dataCard: { options: { … }, styles: [ … ] },
  card: { … },
  pill: { options: { … }, styles: [ … ] },
  icon: { … },

  // Rich content
  lexical: { … },
  graph: { … },
  avlGraph: { … },
  map: { … },
  table: { … },

  // Pattern-level
  pages: {
    attribution: { … },
    complexFilters: { … },
    searchButton: { … },
    searchPallet: { … },
    sectionGroupsPane: { … },
  },
  datasets: {
    datasetsList: { … },
    metadataComp: { … },
  },
  auth: { … },

  // Theme-registered column types (optional)
  columnTypes: { … },

  // Page components registered via the theme (optional)
  pageComponents: pageComponents,
};

export default brandTheme;
```

### 12.2 `design-system/theme.html` — the tokens page

A single DMS-shaped page that documents the **foundational tokens**
the rest of the system inherits from. Read it as: "here is the
brand's vocabulary, before it is composed into anything."

**Recommended page structure** (Layout: `default`):

| LayoutGroup | Section | Shows |
|---|---|---|
| `header` | Lexical | Brand title + one-line summary ("Tessera v0.1, mineral / civic / durable") |
| `content` | Card | **Color tokens** — every brand colour as a swatch with its Tailwind class name and role label (surface / ink / accent / divider) |
| `content` | Card | **Type specimen** — every `textSettings` style rendered with real copy at its actual size: h1–h6, textXS through text8XL, body, caption, label. Tabular numerals demoed. |
| `content` | Card | **Icon set** — every icon in the registry, rendered at 16 / 24 / 32px, with its name underneath. The icon names are the API; this is where they're documented. |
| `content` | Lexical | **Spacing & radius** — visual swatches showing the spacing scale and the radius scale, with token names labelled |
| `content` | Lexical | **Typography pairings** — the display / sans / mono families called out by name with a sample paragraph each |

**What this page proves:** the theme's foundational layer is
complete. If a token is missing here, it'll be missing everywhere
that consumes it.

### 12.3 `design-system/grid.html` — the structural specs page

A single DMS-shaped page that documents Layout and LayoutGroup —
the structural primitives that don't have a "normal" component
gallery treatment because they're invisible chrome.

**Recommended page structure** (Layout: deliberately uses different
named styles in sections of the page to demonstrate them — see §3.4
for the recommended `default` / `app` / `bare` set):

| LayoutGroup | Section | Shows |
|---|---|---|
| `header` | Lexical | Title + explanation that this page demonstrates the structural layer |
| `header` | Lexical (annotated) | Visual diagram of the Site → Layout → LayoutGroup → Section → Component hierarchy from §1 |
| `content` | Card or Lexical | **Layout variants** — one Card per named Layout style (`default`, `app`, `bare`, plus any brand additions). Each card shows a mini-mockup of the layout chrome (outer wrapper, TopNav presence, SideNav presence, content area) annotated with which wrapper key drives which surface |
| `content` | Card | **LayoutGroup variants** — one Card per named LayoutGroup style (`content`, `header`, `auth`, plus any brand additions), showing the surface recipe (boxed vs. unboxed, shadow vs. flat, padding density) with annotations |
| `content` | Lexical | **Nesting example** — a single visual showing Layout with multiple LayoutGroups stacked (e.g. `header` → `content` → `content` → `footer`), illustrating band composition |
| `content` | Lexical | **Naming reference** — table listing which Layout / LayoutGroup variant should be used for which kind of page (marketing, app, auth, etc.) |

**What this page proves:** every page in `pages/` uses one of the
Layouts documented here and stacks LayoutGroups documented here.
Nothing in the rest of the system is allowed to invent its own
structural primitives.

### 12.4 `design-system/components.html` — the primitive gallery page

A single DMS-shaped page that demonstrates every UI primitive
listed in §6. One LayoutGroup per primitive category; within each
LayoutGroup, one Section per primitive showing it in its default
style, every named-style variant, and every relevant state.

**Recommended page structure** (Layout: `app`):

| LayoutGroup | Sections within |
|---|---|
| `header` | Page title + explanation |
| `content` (Navigation primitives) | TopNav (full), SideNav (compact + expanded), NavigableMenu (closed + open), Nestable list |
| `content` (Form & interaction) | Button (all named styles × default/hover/focus/active/disabled states), Input (single-line + textarea + edit-buttons), MultiSelect (closed trigger / open menu / single-select / multi-select with tokens / tabular mode), Switch (off/on/disabled), Tabs, FieldSet, Label |
| `content` (Overlays) | Dialog (every `sizes` variant), Modal, Drawer, Popup, DeleteModal — captured as static snapshots, since live overlays don't fit inline |
| `content` (Containers & atoms) | Card (generic), dataCard (the workhorse — cells in grid mode and row mode, with image / link / text / formatted-number / full-bleed columns), Pill (all colour variants), Pagination, Icon, Logo (all lockups) |
| `content` (Rich content) | Lexical (all heading levels, paragraph, bold/italic, list, code, blockquote, link, image), Table (header + sortable + alternating rows + empty + paginated), Graph (bar / line / pie / scatter / grid with brand palette), Map |

**What this page proves:** every primitive in §6 has been themed.
The page can be a long scroll; the LayoutGroup-per-category
structure makes it navigable. **This page is the contract for the
primitive layer** — an engineer comparing live primitive renders
against this page should see them match exactly.

### 12.5 `design-system/patterns.html` — the composed patterns page

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
right together, not just individually. If something's off (chart
colours fight the table, button padding doesn't match input
padding, modal background reads wrong against page background),
this page is where it shows up first.

Patterns differ from components by **always being more than one
primitive composed together**, and from `pages/` by **never being a
full page** — each pattern is one Section on this page, not a
standalone deliverable.

### 12.6 `pages/` — optional example pages (theme's choice)

One or more DMS-shaped pages that demonstrate **what this theme is
for** — chosen by the brand, not mandated by the platform.

Themes are deliberate choices, not universal renderers. A theme is
allowed to:

- **Have exclusive functionality.** A theme can ship column types,
  page components, or named-style variants that only make sense in
  its context. A radio-station theme might ship a `now_playing`
  column type; a docs theme might ship a `code_block` named style
  on the Card primitive. These are part of the theme — not every
  theme needs to support them.
- **Decline to render contexts it isn't for.** A theme designed for
  long-form magazine-style content doesn't need to prove it also
  works as a heavy analytics dashboard. The platform supports the
  full range; this *theme* doesn't have to.
- **Ship zero, one, or many example pages.** Pick the number that
  honestly demonstrates the theme's intent. One well-chosen example
  beats four perfunctory ones.

**Recommended contents** (one or more, brand's choice):

- An example page showing the **primary use case** the theme is for
  (a radio station's home, a civic county overview, a documentation
  chapter, a marketing homepage).
- An example page showing a **secondary use case** if there is one.
- Real content where possible — real names, real numbers, real
  copy. The visual signature emerges from how the theme handles
  real content, not lorem ipsum.

**No new primitives or patterns are allowed here.** Anything the
example pages render must also appear in
`design-system/components.html` or `design-system/patterns.html`.
The example pages exercise the system; they don't extend it.

**File naming:** descriptive, kebab-case, no fixed list — `radio-
station-home.html`, `county-overview.html`, `chapter-page.html`,
`marketing-homepage.html`, etc. Whatever describes what the example
is.

### 12.7 How the three top-level entries relate

```
theme/          →   the code that gets shipped
                    (JS theme overlay, icons, Tailwind additions)

design-system/  →   four pages that document this theme
  ├ theme           introspects: brand foundation tokens
  ├ grid            introspects: structural primitives
  ├ components      introspects: every UI primitive this theme uses
  └ patterns        introspects: multi-primitive compositions

pages/          →   one or more example page(s) — theme's choice
  └ <theme picks>   demonstrates: what THIS theme is for
```

The relationship in plain words:

- **`theme/`** answers: *what gets shipped?*
- **`design-system/theme.html`** validates: *did every foundational
  token get a value?*
- **`design-system/grid.html`** validates: *do the structural
  primitives have named variants for the page kinds this theme
  cares about?*
- **`design-system/components.html`** validates: *did every UI
  primitive used by this theme get themed?*
- **`design-system/patterns.html`** validates: *do primitives
  compose coherently?*
- **`pages/`** demonstrates: *what is this theme actually for?*

A design system is **done** when:

1. `theme/theme.js` is complete for the primitives this theme
   actually uses (every used primitive has `styles[0]` populated).
2. All four pages in `design-system/` render correctly, each shaped
   as a real DMS page.
3. Any example pages in `pages/` render correctly, demonstrating
   the theme's primary use case.
4. Every primitive that appears in `pages/` also appears in
   `design-system/components.html`; every pattern that appears in
   `pages/` also appears in `design-system/patterns.html`. No
   smuggling.
5. The class strings inside the mockup HTML match the corresponding
   keys in `theme/theme.js` exactly. Changing a value in `theme.js`
   means manually mirroring the change in any mockup that demos
   that primitive (see §12.8 for why this trade-off is the right
   one).

**What a design system is *not* required to do:**

- Render every possible kind of site the platform supports.
- Theme primitives the brand doesn't actually use (a long-form-
  reading theme can leave `map`, `graph` un-themed if it never
  shows maps or charts; it just needs to say so in the README).
- Match what other themes do. Two themes can take wildly different
  positions on the same primitive (one boxed and shadowed, one
  hairline-ruled and flat) — that's the point of named-style
  variants and per-theme `activeStyle` selection.

### 12.8 Implementation rules for mockup pages

The four `design-system/` pages and every `pages/` page are
**plain HTML files**. The rules are tight and intentional:

**MUST:**

- ✅ **Plain HTML5.** `<!doctype html>`, `<html>`, `<head>`,
  `<body>`. No JSX. No templating engine.
- ✅ **Tailwind via CDN.** `<script src="https://cdn.tailwindcss.com"></script>`
  in `<head>`. No PostCSS, no `tailwindcss` npm install, no
  build pipeline. The CDN script is the toolchain.
- ✅ **Brand surface utilities in `_shared.css`.** Mirror the
  contents of `theme/index.css.additions` into a sibling
  `_shared.css` next to the mockup pages — `@font-face`,
  `.tny-pane`-style surface classes, any hover/press effects that
  can't be Tailwind-expressed. Each page links it:
  `<link rel="stylesheet" href="_shared.css"/>`.
- ✅ **DMS hierarchy in HTML.** Each page is a real
  `<div class="…outerWrapper…">` (Layout) containing
  `<div class="…wrapper1…">` (LayoutGroup) containing
  `<div data-section …>` (Section) containing the actual primitive
  markup. The class strings on each wrapper come from `theme.js`'s
  corresponding `layout.styles[…]` / `layoutGroup.styles[…]` entries.
- ✅ **Mirror class strings from `theme.js` by hand.** When a page
  renders a Button in its `default` style, the page hard-codes
  the same class string that lives in `theme.js`'s
  `button.styles[0].button`. A reader can grep across the two
  files to confirm they match.
- ✅ **Inline icons as raw `<svg>`.** Each icon SVG is pasted
  inline from `theme/icons.js`. Add an HTML comment with the
  registry name (`<!-- icon: CaretDown -->`) so the reader can trace
  back.
- ✅ **Real content.** Real names, real numbers, real copy.

**MUST NOT:**

- ❌ **No JavaScript framework.** No React, no Vue, no Svelte,
  no Alpine.
- ❌ **No JSX, no Babel.** A previous version of this skill
  allowed `<script type="text/babel">` blocks that consumed a
  `window.TNYTheme` shim; that's now banned. Mockups must be
  readable to a designer who does not know JavaScript.
- ❌ **No build step.** No Vite, no Webpack, no esbuild, no
  bundler, no preprocessor, no Node-based asset pipeline. The page
  loads in a browser served by `python -m http.server` from the
  project root.
- ❌ **No imports of `theme/theme.js` from the HTML pages.**
  `theme.js` is a JS module; the mockups can't import it without
  a bundler or `<script type="module">`. They mirror its strings
  by hand instead — see "MUST: Mirror class strings" above.
- ❌ **No vanilla JavaScript either,** except a single optional
  `<script>` block per page that flips static "open" / "closed"
  states of popovers if absolutely needed for the design.
  Default: don't include even that.
- ❌ **No inline `style="…"`** unless the value can't be expressed
  as a Tailwind class (e.g. `style="background:#1F3F8F"` for a
  swatch is fine; `style="margin-top: 12px"` is not — use `mt-3`).
- ❌ **No CSS modules, styled-components, vanilla-extract,
  emotion.**

**Why this constraint matters:**

- A designer who knows HTML and Tailwind can open any mockup,
  edit it directly in a text editor, and see the change on reload.
  No `npm install`, no Node version juggling, no JSX errors.
- The mockup HTML is the same shape the live DMS render
  produces. A reader can read one and predict the other.
- The constraint forces honesty. If a primitive needs a build
  step to demo, it can't be themed by Tailwind classes — and the
  theme system is Tailwind classes, full stop. Pretending
  otherwise produces designs that don't survive the platform.

**The trade-off this constraint accepts:** class strings are
mirrored by hand from `theme.js` into each mockup that demos
the primitive. If you change `dataCard.styles[0].header` in
`theme.js`, you must also update the corresponding inline class
string in `design-system/components.html` and any `pages/` page
that renders a Card header. This is real friction. We take it
because the alternative — a JSX shim that auto-syncs — adds a
toolchain a designer has to debug.

### 12.9 Implementation notes for the design agent

- **Sourced fonts** ship inside `theme/fonts/` and are loaded by
  `theme/index.css.additions` (and mirrored by `_shared.css` next to
  the mockups). Use a relative `url(...)` from the CSS so the same
  file works in both contexts.
- **Use real content where possible.** The `pages/` mockups should
  pull real or representative content (real DJ names, real county
  names, real KPI values), not lorem ipsum.
- **Ship the top-level `README.md`.** One section per top-level
  folder, pointing to its contents and what each contributes.
- **Date and version the top-level README.** "v0.1, 2026-05-22,
  TransportNY brand" beats nothing.
- **Per-page READMEs are optional.** The pages document themselves
  through their content.
- **Annotation overlay.** A small CSS rule on `_shared.css` can
  reveal structural badges (`LAYOUT · GROUP · SECTION`) when
  `<body class="dms-annotated">` is set. Useful on `grid.html` and
  `theme.html` to make the structural grammar visible. Default
  off on `pages/` so example pages look like the real product.

---

## 13. Reading list

Before designing for DMS, read in order:

1. **`references/dms product/positioning-v2.md`** — what the product is
   and isn't.
2. **The chosen brand brief** (`references/dms product/brand-tessera.md` /
   `references/dms product/brand-lingua.md`) — the aesthetic decisions
   for this design pass.
3. **This document** — the structural grammar.
4. **`src/dms/packages/dms/src/ui/THEMING_GUIDE.md`** — the canonical
   theming reference inside the codebase. More mechanical than this
   doc; covers the conversion process for adding a *new* primitive to
   the theme system. The design agent rarely needs this, but it's
   useful for understanding the contract from the implementer's side.
5. **`src/themes/CLAUDE.md`** — the "configure the Card, don't write
   a new component" philosophy. Important for understanding why the
   Card primitive is the workhorse and gets the most design attention.
6. **`src/themes/avail/theme.js`** and **`src/themes/wcdb/`** — two
   existing themes, very different in tone, that demonstrate how the
   contract is honoured in practice. The wcdb theme in particular
   shows how non-tool-like a DMS site can look when designed
   thoughtfully.
7. **`src/themes/transportny/TransportNY Design System/dms_design_system/`**
   and **`src/themes/tessera/design_system_v2/`** — two completed
   examples shaped by the present skill.

---

## Appendix — quick reference cheat sheet

```
Hierarchy:    Site → Layout → LayoutGroup → Section → Component/Primitive
Theme shape:  { options: { activeStyle }, styles: [{ name, …classKeys }] }
Style 0:      Complete default. Every key must exist here.
Styles 1+:    Sparse overrides. Missing keys inherit from styles[0].
Read via:     getComponentTheme(theme, 'foo.bar', activeStyle)
Values are:   Tailwind class strings (or icon-name strings, or sub-objects)
Mergeable:    Yes, JSON-serialisable, persisted in DB, editable in admin UI
NOT mergeable: CSS, CSS-in-JS, runtime style objects, custom DOM

Always ships in:
  brand-output/
  ├── theme/             code artifact
  ├── design-system/     4 DMS-shaped docs pages (HTML + Tailwind CDN only)
  │     theme · grid · components · patterns
  └── pages/             one or more theme-chosen example page(s)

Each entry in design-system/ and pages/ is structured as a real
DMS page (Layout > LayoutGroup > Section), built as plain HTML +
Tailwind CDN, no JSX, no JS framework, no build step.

The biggest single primitive to get right:  dataCard
The most far-reaching single artifact:      textSettings.styles[0]
The thing that breaks if you don't ship it: Icons map
The constraint that keeps it honest:        plain HTML + Tailwind, nothing else
Themes are choices:  may have exclusive features; need not be
                     cross-compatible with other themes.
```
