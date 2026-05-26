# Translating a design system into a DMS theme

How to take a completed HTML/CSS design system (produced by
[`designing-a-dms-design-system.md`](./designing-a-dms-design-system.md))
and turn it into a runnable DMS theme overlay — `theme/theme.js`,
`theme/icons.js`, `theme/tailwind.additions.js`,
`theme/index.css.additions` — that, when dropped into a DMS site,
renders pages matching the mockups.

> **Audience:** an engineer or AI translating a completed
> `design-system/` + `pages/` folder into the shipped theme code
> artifact.
>
> **Input:** a `brand-output/` folder with `_shared.css`,
> `design-system/{theme,grid,components,patterns}.html`, and
> `pages/*.html` — produced by the sibling design-system skill.
>
> **Output:** a `theme/` folder ready to drop into
> `src/themes/<brand>/` and consume from `src/themes/index.js`.
>
> **Worked examples:**
> [`src/themes/tessera/tessera-theme.js`](../../../themes/tessera/tessera-theme.js) (target output of this skill, given `src/themes/tessera/design_system_v2/` as input),
> and [`src/themes/transportny/`](../../../themes/transportny/).

---

## Outcome

You ship a folder shaped like this — and an engineer can drop it
into a DMS site without writing new components:

```
theme/
├── README.md                  # one-paragraph brand summary + variant catalog
├── theme.js                   # the complete theme overlay (default export)
├── icons.js                   # name → SVG-component map
├── icons/                     # the raw SVG sources (24px grid)
├── tailwind.additions.js      # snippets to merge into the consuming project's tailwind.config.js
└── index.css.additions        # @font-face + brand surface utilities
```

A site picks this theme up by importing the default export from
`theme.js` and wiring it into `DmsSite`'s `themes` prop. The
`Icons` field on the theme is then read by every `<Icon>` instance
in the product.

---

## The seven-step workflow

1. **Read the input.** Open `brand-output/README.md` and skim
   `design-system/theme.html`, `grid.html`, `components.html`,
   `patterns.html`, and every `pages/*.html`. Note which
   primitives the brand has chosen to style and which it has
   declined to.
2. **Read the codebase's contract** — [§2 below](#2-the-theme-grammar-optionsstyles).
   The theme is a JS object whose values are Tailwind class
   strings. The shape is `{ options: {...}, styles: [...] }` for
   most primitives, flat for a few legacy ones.
3. **For each primitive the brand uses, open its source-of-truth
   `.theme.{js,jsx}` file** ([§3](#3-the-per-primitive-key-checklist)).
   The keys in the codebase's default theme **are the API**. If
   you ship a key the component doesn't read, it's silently
   no-rendered. (This is the topnav/sidenav gap that the first
   pass of Tessera hit — see [§3.1](#31-the-topnavsidenav-gap--invented-keys-silently-no-op).)
4. **Translate the mockup HTML → class strings.** For each
   primitive, copy the Tailwind classes off the mockup element
   into the corresponding theme key. Where the mockup used a
   surface utility from `_shared.css` (`.tny-pane`, etc.), the
   class is still a literal string in the theme; the CSS rule
   moves to `index.css.additions`.
5. **Wire up the icons.** Inline-pasted SVGs in the mockups become
   React components in `theme/icons/`, registered in
   `theme/icons.js` as a `{ Name: <Component /> }` map.
6. **Produce `tailwind.additions.js` and `index.css.additions`.**
   Brand colours, font families, custom scales → Tailwind config.
   `@font-face`, surface utilities → CSS additions.
7. **Verify in a real site.** Wire the theme into a local DMS site
   and walk a real page that uses every primitive. Any place the
   render diverges from the mockup is a theme key you missed or
   wrote on the wrong path.

---

## 1. Theme grammar — the `options/styles` convention

DMS does not use CSS variables or design tokens. **A theme is a
plain JavaScript object whose values are Tailwind class strings.**
That object is provided via React context; every primitive reads
it via a single helper (`getComponentTheme`).

Don't fight this. The whole authoring story depends on themes
being serialisable to JSON and editable through an admin UI; CSS
variables and runtime style objects would break that.

### 1.1 The shape of a primitive's theme

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

The conventions you must follow:

- **`styles[0]` is the complete default.** Every renderable key the
  component reads must exist here. This is the single biggest
  deliverable of the translation skill.
- **`styles[1..n]` are sparse overrides.** They only specify keys
  that differ from `styles[0]`. Missing keys are filled in from
  `styles[0]` automatically by `getComponentTheme`.
- **`options.activeStyle`** selects which style is active by
  default. A site can override per-component by passing
  `activeStyle` as a prop, or per-Layout via `layout.options.{topNav,sideNav}.activeStyle`.
- **`name`** on a style is what the admin theme-editor dropdown
  shows; pick stable kebab-or-camel-case identifiers
  (`default`, `compact`, `dark`, `hero`, `auth`).

Each style is also the unit of variation an author can swap from
the admin UI. If the brand mockup shows three different button
treatments, ship them as `button.styles[0..2]` — don't bake the
variation into the markup.

### 1.2 Flat themes (legacy)

Some older primitives are **flat** — no `options`/`styles`, just
keys directly:

```js
export const inputTheme = {
  input:          "relative w-full block …",
  inputContainer: "group flex relative …",
  textarea:       "relative block h-full …",
};
```

Both shapes are supported. **Prefer the `options/styles` shape for
new or rebuilt themes** — it's the format the theme editor knows
about and it supports named variants. Flat themes work but can't be
re-skinned from the admin UI.

When the codebase's default is flat (as `input`, `field`, `label`,
`dialog`, `modal` currently are), ship a flat overlay so your
overlay merges cleanly. **Don't unilaterally promote a flat theme
to `options/styles` shape** — that's a codebase change, not a
theme decision. Mention it in the brand README if you want it on
the roadmap.

### 1.3 How a component reads its theme (so you know what merging
does)

A themed component always has the same three lines at the top:

```jsx
const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
const t = {
  ...fooTheme.styles[0],                            // local default fallback
  ...getComponentTheme(themeFromContext, 'foo', activeStyle),
};
// Then: <div className={t.wrapper}>…
```

`getComponentTheme(theme, 'foo', activeStyle?)`:

- Resolves the named style (by index *or* by name string).
- Honours `activeStyle` argument first, then the theme's own
  `options.activeStyle`, then `0`.
- Fills in missing keys on the active style from `styles[0]`, so
  sparse overrides work.
- For flat themes, returns the object as-is.
- Always returns `{}` if the path is missing.

What this means for you:
- Spell keys exactly. `wrapper` and `Wrapper` are different keys;
  the component reads only one.
- Don't worry about styles[1..n] keys missing — they inherit.
- Do worry about styles[0] keys missing — those defaults are the
  only thing the component has to render with.

### 1.4 Merging across sites

A site provides a partial theme that merges into the DMS default
theme via `mergeTheme()`:

- **`styles[0]` is deep-merged.** Your overlay's `styles[0]` keys
  override the codebase default's `styles[0]` keys one-by-one. You
  *can* leave a key out and inherit the codebase default — but
  it's safer to specify every key your design depends on. The
  codebase default is the Catalyst look; inheriting it leaks
  Catalyst aesthetics into your brand.
- **`styles[1..n]` come from whichever theme defines them.** No
  index collisions: your "dark" style at index 1 does not inherit
  from the codebase's "dark" style at index 1 — it inherits from
  *your* `styles[0]`.

**Rule of thumb:** produce a **complete** `styles[0]` for every
primitive the brand uses. Don't rely on inherited keys from the
default theme unless you've verified they match the brand.

---

## 2. The theme grammar (options/styles) — extended notes

A few subtleties that come up every time:

- **The icon registry is global to the theme**, not per-primitive.
  Set `theme.Icons = { Menu: <MenuIcon/>, ChevronDown: <…/>, … }`
  once. Primitives reference icons by name (a string in the theme,
  not a JSX import).
- **`textSettings` is also a single top-level entry**, not per-
  primitive. Card, Lexical, Header, and any column type that renders
  text all read from it. It uses `options/styles`, but you'll
  almost always ship a single `styles[0]` covering every named
  text key.
- **Some primitives carry `options` beyond `activeStyle`.** Layout
  carries `options.sideNav` / `options.topNav` configuration
  (size, nav, widget slots). TopNav carries `options.maxDepth`.
  Read each primitive's `.theme.{js,jsx}` to see what `options`
  fields it expects.
- **Pattern-level themes live under namespace keys**
  (`pages.attribution`, `pages.complexFilters`,
  `datasets.datasetsList`, etc.). They're styled the same way as
  primitives; they're just read via a dotted path:
  `getComponentTheme(theme, 'pages.searchButton', activeStyle)`.

---

## 3. The per-primitive key checklist

**For every primitive you ship, open the matching
`.theme.{js,jsx}` source file and copy its key list as your work
target.** The keys in the codebase default theme **are the API**
the component reads — no more, no less. Keys you invent silently
no-op; keys you misspell silently no-op; keys you ship on the
wrong path silently no-op.

### 3.1 The TopNav / SideNav gap — invented keys silently no-op

The first Tessera pass illustrates the failure mode this skill
exists to prevent. The translation produced `topnav.styles[0]` and
`sidenav.styles[0]` with keys like `wrapper`, `inner`, `menu`,
`menuItem`, `menuItemActive`, `leftMenu`, `rightMenu` —
**none of which `TopNav.jsx` or `SideNav.jsx` actually read**.
The styles were there, but on keys nothing consumes. The live nav
fell through to the Catalyst defaults.

The actual key set lives in:
- `src/dms/packages/dms/src/ui/components/TopNav.theme.jsx`
- `src/dms/packages/dms/src/ui/components/SideNav.theme.jsx`

For TopNav, the real keys are (non-exhaustive):
`layoutContainer1`, `layoutContainer2`, `topnavWrapper`,
`topnavContent`, `leftMenuContainer`, `centerMenuContainer`,
`rightMenuContainer`, `mobileNavContainer`, `mobileButton`,
`menuOpenIcon`, `menuCloseIcon`, `navitemWrapper`,
`navitemWrapper_level_2`, `navitemWrapper_level_3`, `navitem`,
`navitemActive`, `navIcon`, `navIconActive`, `navitemContent`,
`navitemName`, `navitemName_level_2`, `navitemName_level_3`,
`navitemDescription`, `navitemDescription_level_2`,
`navitemDescription_level_3`, `indicatorIconWrapper`,
`indicatorIcon`, `indicatorIconOpen`, `subMenuWrapper`,
`subMenuWrapper2`, `subMenuWrapper_level_2`,
`subMenuWrapper2_level_2`, `subMenuItemsWrapper`,
`subMenuItemsWrapperParent`, `subMenuParentWrapper`,
`subMenuParentContent`, `subMenuParentName`, `subMenuParentDesc`,
`subMenuParentLink`.

For SideNav: `layoutContainer1`, `layoutContainer2`, `logoWrapper`,
`sidenavWrapper`, `menuItemWrapper`, `menuItemWrapper_level_1..4`,
`navitemSide`, `navitemSideActive`, `menuIconSide`,
`menuIconSideActive`, `forcedIcon`, `forcedIcon_level_1..4`,
`itemsWrapper`, `navItemContent`, `navItemContent_level_1..4`,
`indicatorIcon`, `indicatorIconOpen`, `indicatorIconWrapper`,
`subMenuWrapper_1..3`, `subMenuOuterWrapper`, `subMenuParentWrapper`,
`subMenuTitle`, `bottomMenuWrapper`, `sectionDivider`,
`sectionHeading`, plus a few mobile-toggle topnav-ish keys
(`topnavWrapper`, `topnavContent`, `topnavMenu`,
`topmenuRightNavContainer`, `topnavMobileContainer`).

**Lesson:** for every primitive, *open the .theme file first* and
copy its key set as your work target. Don't invent keys from the
mockup's div structure — match the codebase's contract exactly.

### 3.1.4 Exposing named text styles to Lexical authors

The brand may declare 12–18 text tokens, but a Lexical author's
*native* vocabulary is much narrower: paragraph, headings 1–6,
quote, code, list, bold, italic. Bridging this gap matters because
all the rich brand styles are useless if authors can't reach them
in the editor.

The DMS codebase now ships **the full Approach B implementation**
described below: a `StyledParagraphNode` plus a slash-menu
auto-generation step that lists every brand textSettings key as a
`/Style: <key>` option. Themes opt in by populating
`textSettings.styles[0]` with their named tokens; they get author
access for free. Themes can further filter the menu by listing
which keys should appear (see Approach B steps below).

There are three working approaches; the right move is usually a
combination. **Approach B is the recommended default for new
themes**; A is the necessary first step (heading mapping); C is
the historical lighter-weight alternative.

#### Approach A — Stretch `h1..h6` across your display ladder (easiest)

`getLexicalTheme()` backfills `heading_h1..h6` from
`textSettings.h1..h6` when the lexical theme doesn't define them
explicitly, AND the codebase's slash menu already offers
"Heading 1..4" out of the box. So:

1. Map `textSettings.h1..h6` to your display tokens (1 = biggest,
   6 = smallest), e.g. for Tessera:
   ```js
   textSettings.styles[0] = {
     ...allTokens,
     h1: T.displayHero,   //  76px — page hero only
     h2: T.displayXL,     //  48
     h3: T.displayLG,     //  36
     h4: T.displayMD,     //  28
     h5: T.displaySM,     //  22
     h6: T.displayXS,     //  18
   }
   ```
2. Mirror those into `lexical.styles[0].heading_h1..h6` so the
   token strings win in the merge (textSettings is only a
   backfill — see §3.1.5 for the merge gotcha).
3. **Lift the codebase slash menu's heading range** to 1–6 if
   you want authors to reach h5/h6 via `/heading 5`:
   ```diff
   // src/dms/packages/dms/src/ui/components/lexical/editor/plugins/ComponentPickerPlugin/index.tsx
   - ...([1, 2, 3, 4] as const).map(
   + ...([1, 2, 3, 4, 5, 6] as const).map(
   ```
   This is one line in the codebase (theme-neutral; every brand
   benefits).

After this, an author types `/heading 1` and gets your 76px
display moment; `/heading 6` gets your 18px small display title.
That alone covers the brand's six display sizes with **zero new
Lexical nodes**.

What this does NOT cover: the prose ladder (`proseLG`/`proseSM`/
`proseXS`), the display italic ladder (`displayItalicHero`/`LG`/
`SM`), and the meta ladder (`metaMD`/`metaSM`/`metaXS`). Those
need Approach B or C.

#### Approach B — `/Style:` slash auto-menu (the shipped path)

The codebase implements this end-to-end. Every key in the active
theme's `textSettings.styles[0]` automatically becomes a
`/Style: <key>` option in Lexical's slash menu. Selecting one
converts the current paragraph to a `StyledParagraphNode` carrying
that key; at render time the node resolves the key to its Tailwind
class string via the brand's textSettings.

**The four moving parts:**

| File | Role |
|---|---|
| `src/dms/packages/dms/src/ui/components/lexical/editor/nodes/StyledParagraphNode.ts` | Subclass of `ParagraphNode` with `__styleKey: string`. Reads className from `editor._config.theme.brandTextStyles[styleKey]` at createDOM/updateDOM. Serialises as `{ type: 'styled-paragraph', styleKey: '<key>' }`. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/nodes/PlaygroundNodes.ts` | Registers the node so the editor knows about it. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/index.tsx` | Mirrors the active theme's `textSettings.styles[0]` onto `nestedLexicalTheme.brandTextStyles` and the slash allow-list onto `brandTextStyleSlashKeys`. |
| `src/dms/packages/dms/src/ui/components/lexical/editor/plugins/ComponentPickerPlugin/index.tsx` | `buildStyleOptions(editor)` reads `editor._config.theme.brandTextStyles` and emits one `Style: <key>` option per key (optionally filtered by `brandTextStyleSlashKeys`). |

**Theme side: what you need to ship.**

1. **Brand tokens on textSettings.styles[0]** — the 12–18 named
   tokens (e.g. `displayHero`, `proseLG`, `metaSM`) as full
   Tailwind class strings. See §3.1.6.
2. **An optional slash allow-list** — `textSettings.options.slashKeys`.
   Without it, *every* textSettings key (including the generic
   `textXS`..`text8XL` ladder) shows up in the slash menu, which
   is noisy. With it, only the listed keys appear:
   ```js
   textSettings: {
     options: {
       activeStyle: 0,
       slashKeys: [
         'displayHero','displayXL','displayLG','displayMD','displaySM','displayXS',
         'displayItalicHero','displayItalicLG','displayItalicMD','displayItalicSM',
         'proseLG','prose','proseSM','proseXS',
         'metaMD','metaSM','metaXS',
       ],
     },
     styles: [{ /* … the 17 tokens here … */ }],
   }
   ```

**Author UX in the editor.** Type `/` to open the slash menu, then
`Style` or any token name (e.g. `prose` or `metaSM`) — fuzzy
search across both the title and keywords. Pick the option; the
current block becomes a `StyledParagraphNode` rendering at the
brand's chosen treatment. The chosen key persists in the
section's lexical state JSON, so reopening the editor shows the
same selection.

**Seed-script side: a `styled()` helper** mirrors what the editor
produces so seeded content can use named tokens too. In
`scripts/seed-tessera-pages.mjs`:
```js
const styled = (styleKey, ...kids) => ({
  type: 'styled-paragraph', version: 1, direction: null, format: '',
  indent: 0, textFormat: 0, textStyle: '',
  styleKey,
  children: kids.flat(),
});
```
Use it alongside `para()`, `head()`, `quote()`:
```js
lexical([
  styled('metaSM', text('TESSERA · v0.1 PREVIEW')),
  head('h1', 'The shape of your data is the shape of your site.'),  // → displayHero
  styled('proseLG', text('One typed row that can be a page, a section, …')),
  styled('metaSM', text('Open-source. Self-host or use the hosted service.')),
])
```

**Backwards compatibility.** Themes that don't populate
`brandTextStyles` get no `/Style:` options (the menu falls back to
the existing slash entries — `/heading 1`, `/paragraph`, `/quote`,
etc.). Existing Lexical sections that don't use
`styled-paragraph` continue to round-trip unchanged. The node
itself is registered in PlaygroundNodes for every editor; themes
opt in by populating textSettings.

#### Approach C — Custom keyword routes (lightest)

The simplest patch for the most common non-heading tokens: hand-
register a small set of ComponentPickerOptions that target
*existing* Lexical nodes with brand class names. Tessera-style:

| Slash | Behaviour |
|---|---|
| `/lede` | Paragraph with className `proseLG` |
| `/caption` | Paragraph with className `proseXS ink-graphite` |
| `/eyebrow` | Paragraph with className `metaXS upper ink-fog` |
| `/pull-quote` | Already covered by `/quote` → maps to `displayItalicMD` |

This costs ~30 lines in ComponentPickerPlugin and avoids the
custom node type. It's not extensible (every new style needs a
codebase edit) but it's the right v0.x trade.

#### Inline modifiers (italic-on-prose, ink colour, tabular)

Lexical's `TextFormat` is bitmask-based (bold=1, italic=2, …) and
not extensible without a custom `TextNode` subclass. Author access
to the brand's inline modifier axes (`ink-graphite`, `tabular`,
`case-normal`) currently requires either:

- A custom inline `TextStyleNode` with a `className` attribute, OR
- A FloatingTextFormatToolbar entry that wraps the selection in a
  `<span class="ink-graphite">…</span>` via a Lexical mark.

Both are bigger lifts than the block-level approaches above. For
v1, accept that ink colour and tabular numerals are author-
inaccessible inside Lexical — they're applied automatically by
the token (e.g. `metaMD` ships tabular-nums by default) or
authored at the Card-cell level where the `valueFontStyle`
dropdown gives full token access.

#### Recommended sequence for any new theme

1. **Phase 1** (mandatory): Map `h1..h6` to your display ladder
   (Approach A). Verify with `/heading 1` rendering at the brand's
   biggest title.
2. **Phase 2** (recommended): Lift the codebase slash menu's
   heading range to 1–6 so authors can reach the full ladder.
3. **Phase 3** (when authors ask for it): Add the `/lede` /
   `/caption` / `/eyebrow` custom routes (Approach C) for the
   most-used non-heading tokens.
4. **Phase 4** (only if author demand sustains): Build the full
   `StyledParagraphNode` + auto-generated submenu (Approach B)
   so every textSettings key is reachable.

Skipping Phase 1 means your hero title can never be 76px through
Lexical; it'll cap at whatever h1 the codebase default sets.
Skipping later phases is fine — the brand's voice degrades
gracefully through the default headings.

### 3.1.45 Other Lexical knobs the theme controls

Beyond the textSettings tokens that drive `/Style:` slash options,
the theme also controls four other Lexical surfaces. Every brand
should audit these because the codebase defaults are generic.

#### `theme.button.styles` — the inline button vocabulary

The `/Button` slash command opens a dialog whose **style dropdown
is auto-generated from `theme.button.styles[].name`**. Whatever
named variants the brand ships there become the author-pickable
button styles. The rendered `ButtonNode` then renders via
`UI.Button activeStyle={name}` — so the brand's button skin
(`text-`, `bg-`, `border-`, `hover:`, `focus-visible:` classes
already declared in `theme.button.styles[N].button`) is what shows
up in the editor and on the live page.

For Tessera that gives authors `default | plain | active | danger`
in the dropdown — the same four button looks every other surface
of the site renders. No per-Lexical-button styling needed.

**Legacy compatibility.** Stored ButtonNode `__style` strings from
the pre-theme-integration era (`'primary' | 'secondary' | 'primarySmall' | …`)
auto-fall-back to `theme.button.styles[0].name` with a one-time
deduped console warning. Existing content keeps rendering; the
warning surfaces the migration path in devtools.

#### `theme.modal.{header,title,closeButton,body,panel}` — dialog chrome

Every Lexical plugin dialog (`/Image`, `/Table`, `/Layout`,
`/Button`, etc.) renders inside `UI.Modal` via the
`useModal` hook. `UI.Modal` reads `theme.modal.panel` for the
panel surface. The shared `useModal` hook also wraps content with
a header that reads `theme.modal.header / title / closeButton`
keys with sensible fallbacks. So a brand that ships those keys
gets fully-themed plugin dialogs across the editor; a brand that
doesn't still gets a usable header with generic chrome.

Minimum brand modal keys for a coherent editor:
```js
// theme.modal — flat object (no styles array; this is a legacy primitive)
{
  wrapper:     `fixed inset-0 z-50 flex items-center justify-center p-4`,
  backdrop:    `absolute inset-0 bg-[${c.slate}]/40`,
  panel:       `relative bg-[${c.parchment}] border border-[${c.groutLight}] shadow-[…] rounded-none p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto`,
  header:      `flex items-center justify-between mb-4 pb-4 border-b border-[${c.groutLight}]`,
  title:       `${FONT_DISPLAY} text-xl font-medium text-[${c.slate}]`,
  closeButton: `cursor-pointer p-1 text-[${c.graphite}] hover:text-[${c.slate}]`,
}
```

#### `theme.lexical.layoutTemplates` — column layout presets

The `/Columns` slash command shows a dropdown of column-layout
templates. The codebase ships 6 generic Tailwind presets
(`grid-cols-2`, `[1fr_3fr]`, etc.). Themes can replace them with
brand-appropriate templates via `theme.lexical.layoutTemplates`:

```js
// inside the theme's lexical export
layoutTemplates: [
  { label: '2 buttons side-by-side', value: 'grid-cols-1 md:grid-cols-[max-content_max-content_1fr]', count: 3 },
  { label: '2 columns (equal)',     value: 'grid-cols-1 md:grid-cols-2',            count: 2 },
  { label: '2 columns (1/3 + 2/3)', value: 'grid-cols-1 md:grid-cols-[1fr_2fr]',    count: 2 },
  { label: '2 columns (2/3 + 1/3)', value: 'grid-cols-1 md:grid-cols-[2fr_1fr]',    count: 2 },
  { label: '3 columns (equal)',     value: 'grid-cols-1 md:grid-cols-3',            count: 3 },
  { label: '4 columns (equal)',     value: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4', count: 4 },
],
```

The `value` is the Tailwind classes applied to the layout
container. The brand-specific `2 buttons side-by-side` template
above (two content-width columns + a filler) is what Tessera's
marketing hero uses for its CTA row — the side-by-side buttons
sit tight to one another rather than 50/50-split across the row.

The `count` field tells the InsertLayoutPlugin how many
LayoutItems to create when the user picks that template.

Themes that don't declare `layoutTemplates` fall back to the
codebase's hardcoded 6 presets.

#### `theme.lexical.layoutContainer` + `layoutItem`

The codebase default `layoutItem` ships `px-2 py-4` — 32 px of
vertical padding INSIDE each column. That's appropriate for a
documentation grid where columns hold prose blocks; it's terrible
for a tight side-by-side CTA row where it adds a thick vertical
band of empty space.

Brands should override both:
```js
// inside theme.lexical.styles[0]
layoutContainer: 'grid gap-3 mt-2',           // smaller gap, small top margin
layoutItem:      'min-w-0 max-w-full',         // drop the default px-2 py-4
layoutItemEditable: `border border-dashed border-[${c.groutLight}]`,  // edit-mode dashed outline in brand color
```

`mt-2` (8 px) on the container is small enough that the layout
sits close to the paragraph above without crashing into it; the
codebase default has no `mt` at all, which combined with a
preceding paragraph's `mb-4` (16 px) is fine for prose but feels
detached for a CTA row.

#### Summary — the four Lexical hooks every brand should declare

| Hook | Codebase default | What to ship |
|---|---|---|
| `textSettings.styles[0]` brand tokens + `textSettings.options.slashKeys` | None | 12–18 brand tokens; opt-in slash allow-list (see §3.1.4). |
| `button.styles[].name` | `default Buttons` / `plain` / `active` (3 generic) | Brand's named button variants (Tessera: 4 — `default` / `plain` / `active` / `danger`). |
| `modal.{header,title,closeButton,…}` | Only `panel` is set | All five keys so every editor dialog gets brand chrome. |
| `lexical.layoutTemplates` + `lexical.layoutItem` + `lexical.layoutContainer` | 6 generic Tailwind presets + heavy `px-2 py-4` item padding | Brand-grid-aligned templates + minimal item padding + sensible container gap. |

### 3.1.5 The Lexical / textSettings trap

**The second failure mode the Tessera pass hit twice.** Lexical
has two quirks that combine to silently swallow your overrides
unless you know about them.

**Quirk 1 — flat keys, not nested.** Lexical's theme uses
underscore-separated flat keys, not nested objects:

```js
// WRONG — Lexical will not see these
lexical: {
  heading: { h1: '…', h2: '…' },
  text:    { bold: '…', italic: '…' },
  list:    { ol: '…', ul: '…' },
}

// RIGHT — what Lexical actually reads
lexical: {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    heading_h1: '…',
    heading_h2: '…',
    text_bold: '…',
    text_italic: '…',
    list_ol: '…',
    list_ul: '…',
    list_listitem: '…',
    list_nested_listitem: 'list-none',
  }],
}
```

The mapping is `nested.path.key → nested_path_key`. See
`src/dms/packages/dms/src/ui/components/lexical/theme.js` for the
authoritative key list.

**Quirk 2 — textSettings only backfills missing headings.**
`getLexicalTheme()` merges `textSettings.h1..h6` into
`heading_h1..h6` **only when `lexicalStyles.heading_h1` is
falsy**. The codebase's default `lexicalTheme.styles[0]` already
sets `heading_h1: "font-semibold text-3xl scroll-mt-36 font-display"`.
So unless your brand's `lexical` overlay explicitly sets
`heading_h1..h6`, the default's `font-display` rule wins and the
backfill from `textSettings.h1` never fires.

Three working patterns, pick one:

| Pattern | When |
|---|---|
| **Set `heading_h1..h6` directly in the lexical overlay** (preferred) | You want headings to look the same in Lexical and elsewhere. Most themes. |
| **Set `textSettings.h1..h6` AND leave `lexical.heading_*` undefined in your overlay** | You want one source of truth for heading styles AND you're willing to take the codebase default's lexical headings as `null` (you'd need to actively unset them — non-trivial since the merge layers your overlay on top). |
| **Both** — set them in lexical AND in textSettings, with matching strings | Belt-and-braces. The lexical entry wins; the textSettings entry is a fallback for other components (Card, Header) that read `textSettings.h1` directly. |

### 3.1.55 The "make the default look right" rule

When a brand author opens the section-groups pane and adds a new
band, they pick **one configuration**. They should not have to flip
five toggles to make that band look like the rest of the brand.
Translate this in two ways:

1. **Override the codebase defaults so the most common case ships
   correct.** Anything authors will hit on every new group — page
   width, section padding, edit-mode chrome colour, the "add
   section" button — should ship with the brand's intended value
   in `styles[0]`. Don't expect authors to discover and override.
2. **Treat named variants as the rare cases.** A second LayoutGroup
   style for a limestone band, a `full_width: 'show'` flag for a
   genuinely full-bleed section — these are the *exceptions*. The
   default is what the author starts with on every group; the
   variants are for the few that need to break the rhythm.

**The single most common trap:** `pages.sectionArray.styles[0].layouts.centered`
defaults to `max-w-[1020px] mx-auto`. Almost every brand's
LayoutGroup wrapper has a wider max-width (Tessera's is 1280px),
so the codebase default ends up showing content as a narrow
centered column inside an oversized parchment box. Reading is
"left-aligned in a thin column" rather than "filling the surface."

The fix is a one-line theme override:

```js
// tessera-theme.js — under pagesTheme
sectionArray: {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    layouts: {
      centered: 'max-w-[1280px] mx-auto',   // match your brand's --grid-max
      fullwidth: '',                          // rare full-bleed bands only
    },
  }],
},
```

##### Switching to a 12-column grid (and the `_replace` merge trick)

The codebase default sectionArray uses a 6-column grid with sizes
keyed `"1/3" | "1/2" | "2/3" | "1"`. For brands that want
finer-grained section widths (Tessera uses a 12-col grid so
authors can place a hero at 7/12 ≈ 58% or 8/12 ≈ 67%), the
override needs to swap **both** the grid container's
`grid-cols-N` class **and** the entire `sizes` map. There's a
gotcha:

`mergeTheme` deep-merges `styles[0]` keys, so if you provide a
new `sizes` map with `"1"`..`"12"`, the codebase's old `"1/3"` /
`"1/2"` / `"2/3"` keys leak through and — worse — your `"1"` key
overwrites the codebase's `"1"` which used to mean *full width
in a 6-col grid* (now it means *1/12 of width* — and every
section that has no explicit size defaults to `"1"`, so the
entire page shrinks).

The fix is the `_replace` mechanism on `mergeComponentStyles`.
Listing a key in `_replace` tells the merge to **swap the key
wholesale from the override** rather than deep-merging it:

```js
// tessera-theme.js — pagesTheme.sectionArray
sectionArray: {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    _replace: ['sizes'],                    // ← critical: replace sizes wholesale
    container: 'w-full grid grid-cols-12',  // matches the new grid width
    gridSize: 12,
    sizes: {
      "1":  { className: 'col-span-12 md:col-span-1',  iconSize: 8.3 },
      "2":  { className: 'col-span-12 md:col-span-2',  iconSize: 16.7 },
      // … through "12" …
      "12": { className: 'col-span-12 md:col-span-12', iconSize: 100 },
    },
    layouts: { centered: 'max-w-[1280px] mx-auto', fullwidth: '' },
  }],
},
```

`_replace` lives at the same level as the keys it controls. The
merger looks at `_replace` and removes the listed keys from
deep-merge, copying the override's version verbatim. Without
`_replace`, the merged `sizes` map contains both old and new keys
side by side.

**Then update the seed**: every section without an explicit width
needs `size: "12"` (full width in the new 12-col grid). The
seed-loop default makes this safe:
```js
payload.size = s.size || '12';
```
Set `size: "8"` (or "7", "9", whatever matches the design) on
specific narrower sections like the marketing hero.

##### `defaultSize` — what the editor's "+ Add" button creates

There's a second hardcoded `"1"` to override: the section-array
renderer's fallback for sections with no explicit `size` field.
This bites when an author clicks "+ Add section" in the editor —
the new section appears at the legacy `"1"` (which under a 12-col
grid means 1/12 = ~8% width) instead of full-width.

Themes set their own default via `theme.defaultSize`. The
codebase reads it with a "1" fallback so existing themes are
unaffected:
```js
const defaultSize = theme?.defaultSize || "1";
const size = v?.size || defaultSize;
```

For a 12-col grid theme like Tessera, declare `defaultSize: '12'`
in the sectionArray override:
```js
sectionArray: {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    _replace: ['sizes'],
    container: 'w-full grid grid-cols-12',
    gridSize: 12,
    defaultSize: '12',  // ← new sections start full-width
    sizes: { "1": …, "2": …, …, "12": … },
    layouts: { centered: 'max-w-[1280px] mx-auto', fullwidth: '' },
  }],
},
```

This is the right pair: the seed script defaults sections to
`size: "12"` *and* the editor creates new sections at `size:
defaultSize` (also `"12"` for tessera). Authors never see a
broken-width new section, never have to remember to set a size
manually.

While you're in there, re-skin the edit-mode chrome
(`sectionEditHover`, `sectionEditing`, `addSectionIcon`,
`addSectionText`) and the section border palette (`border.full`,
`border.openLeft`, etc.) — those default to blue/orange and stick
out badly against any brand that isn't catalyst.

**Other defaults to audit at the same time:**

| Key | Codebase default | Why audit |
|---|---|---|
| `pages.sectionArray.styles[0].layouts.centered` | `max-w-[1020px] mx-auto` | Almost always too narrow for the brand grid. |
| `pages.sectionArray.styles[0].sectionPadding` | `p-4` | Brand spacing scales may need `p-6` / `p-8`. |
| `pages.sectionArray.styles[0].border.full` | `border-[#E0EBF0] rounded-lg` | Hardcoded blue-gray + 8px radius — fights any brand that's square-cornered. |
| `pages.sectionArray.styles[0].sectionEditHover` | blue-900 border | Edit-mode chrome inherits brand identity too. |
| `pages.sectionArray.styles[0].addSectionIcon` / `addSectionText` | blue-900 bg, white text | Same. |
| `layoutGroup.styles[0]` (the `content` variant) | shadow + rounded-lg + p-4 | If your brand is square-cornered or flat, the default LayoutGroup is the most common surface — set it right. |

The principle generalises: **for every primitive's `styles[0]`,
ask "does this look right out of the box?" Don't leave a key
inherited from the codebase default unless you've verified it
matches your brand.**

### 3.1.6 textSettings — the global type scale

`textSettings` is **not** a primitive; it's a top-level theme key
holding **named text styles** that several components read by name.
Source of truth: `src/dms/packages/dms/src/ui/themes/textSettings.js`.

**What reads textSettings:**

| Consumer | What it reads |
|---|---|
| Lexical (`getLexicalTheme`) | `h1..h6` — backfills `heading_h1..h6` (see Quirk 2 above) |
| `Card` cells (`valueFontStyle` toolbar dropdown) | Every `textXS..text8XL` size key + the semantic aliases (`body`, `bodySmall`, `caption`, `label`) |
| `Header` section | `h1..h6` + `body` |
| Pattern themes (search results, attribution chips, etc.) | The semantic aliases (`label`, `caption`, `bodySmall`) |
| Any column type that renders text | Whatever key it asks for |

**Shape:**

```js
textSettings: {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',

    // ----- Heading roles -----
    // Used by Lexical (only when lexical.heading_hN is unset) AND Header.
    h1: '<your serif/display class string + size + weight + leading + tracking + color>',
    h2: '…',
    h3: '…',
    h4: '…',
    h5: '…',
    h6: '…',

    // ----- Size + weight scale -----
    // Used by Card's valueFontStyle dropdown — the user picks one of these per
    // column. Each entry must exist or the dropdown shows an empty option.
    textXS: '…',  textXSReg: '…',  textXSBold: '…',
    textSM: '…',  textSMReg: '…',  textSMBold: '…',  textSMSemiBold: '…',
    textBase: '…',  textBaseMedium: '…',  textBaseBold: '…',
    textLG: '…',  textLGReg: '…',  textLGBold: '…',
    textXL: '…',  textXLReg: '…',  textXLSemiBold: '…',  textXLBold: '…',
    text2XL: '…', text2XLReg: '…', text2XLSemiBold: '…', text2XLBold: '…',
    text3XL: '…', text3XLReg: '…', text3XLSemiBold: '…', text3XLBold: '…',
    text4XL: '…', text4XLBold: '…',
    text5XL: '…', text5XLBold: '…',
    text6XL: '…', text7XL: '…', text8XL: '…',

    // ----- Semantic aliases -----
    body:      '<sans, base size, normal weight, brand ink color>',
    bodySmall: '<sans, sm size, normal weight, brand ink color>',
    caption:   '<sans, xs size, secondary ink color>',
    label:     '<sans, sm size, medium weight>',

    // Optional brand-specific keys — show up automatically in
    // valueFontStyle dropdown so authors can use them per-cell.
    designator: '<small caps, wide tracking, secondary ink>',
    pullQuote:  '<display serif, italic, large, hanging>',
  }],
}
```

**Brand tokens use the universal role + size naming pattern.** A
well-balanced theme adds ~12–18 brand-specific tokens beyond the
generic `textXS..text8XL` ladder, named `{role}{Size}[{Variant}]`
where role is `display | displayItalic | prose | meta` and size is
`Hero | XL | LG | MD | SM | XS`. See the design-system skill's
[§7.2.1 "The Type section — every variation must be declared
here, with balance"](./designing-a-dms-design-system.md#721-the-type-section--every-variation-must-be-declared-here-with-balance)
for the full pattern and the "earn-a-token" rule.

Example brand tokens to add alongside the generic ladder (Tessera):

```js
// Display ladder (5 tokens)
displayHero:        `${FONT_DISPLAY} text-[76px] leading-[1.04] tracking-[-0.02em] font-medium`,
displayXL:          `${FONT_DISPLAY} text-5xl  leading-[1.08] tracking-[-0.012em] font-medium`,
displayLG:          `${FONT_DISPLAY} text-4xl  leading-[1.08] tracking-[-0.012em] font-medium`,
displayMD:          `${FONT_DISPLAY} text-[28px] leading-[1.2] tracking-[-0.012em] font-medium`,
displaySM:          `${FONT_DISPLAY} text-[22px] leading-[1.2] tracking-[-0.008em] font-medium`,

// Display italic ladder (3 tokens — only the sizes the brand actually uses italic)
displayItalicHero:  `${FONT_DISPLAY} italic text-[64px] leading-[1.05] tracking-[-0.018em] font-normal`,
displayItalicLG:    `${FONT_DISPLAY} italic text-4xl  leading-[1.18] tracking-[-0.012em] font-normal`,
displayItalicMD:    `${FONT_DISPLAY} italic text-[26px] leading-[1.35] font-normal`,

// Prose ladder (4 tokens)
proseLG:            `${FONT_SANS} text-xl   leading-[1.55] font-normal`,
prose:              `${FONT_SANS} text-base leading-[1.55] font-normal`,
proseSM:            `${FONT_SANS} text-sm   leading-[1.5]  font-normal`,
proseXS:            `${FONT_SANS} text-xs   leading-[1.45] font-normal`,

// Meta ladder (3 tokens)
metaMD:             `${FONT_MONO} text-sm   leading-[1.45] font-normal tabular-nums`,
metaSM:             `${FONT_MONO} text-[11px] leading-[1.4] tracking-[0.06em] uppercase font-normal`,
metaXS:             `${FONT_MONO} text-[10px] leading-[1.4] tracking-[0.08em] uppercase font-normal`,
```

**These do not replace the codebase's generic ladder** — keep
`textXS..text8XL`, `body`, `bodySmall`, `caption`, `label`,
`designator` for backward compatibility with Card cells that
already reference them. The brand tokens are *additions* that show
up alongside in the `valueFontStyle` dropdown.

**Three rules when writing textSettings:**

1. **Every key in the codebase default must exist in your styles[0].**
   The Card toolbar dropdown is populated from `Object.keys(styles[0])`
   — missing keys become missing options. The set above is the
   minimum.
2. **Apply your brand's typeface to the right keys.** Display serifs
   on `h1..h6` and the big sizes (`text4XL`+); brand sans on the
   working sizes (`textXS..text2XL`); brand mono on numeric and
   monospace-natural keys (you can add custom keys like
   `textSMMono`, `text2XLMono` for tabular figures).
3. **For numbers, include `tabular-nums` on the key.** Card cells
   that render numbers (formatFn: 'comma', 'abbreviate', etc.)
   look uniform only if the font has tabular figures *and* the
   class string asks for them.

**Tabular numerals example** — common addition for any theme:

```js
textSMNum:    `${FONT_MONO} text-sm  tabular-nums`,
textBaseNum:  `${FONT_MONO} text-base tabular-nums`,
text2XLNum:   `${FONT_MONO} text-2xl tabular-nums font-medium`,
```

After adding these, the Card column toolbar's `valueFontStyle`
dropdown gains `textSMNum`, `textBaseNum`, `text2XLNum` as
selectable options — authors can pick them per column without
touching code.

### 3.2 The lookup table

| Primitive | Top-level key in theme | Theme shape | Source of truth |
|---|---|---|---|
| Layout | `layout` | options/styles | `src/dms/packages/dms/src/ui/components/Layout.theme.jsx` |
| LayoutGroup | `layoutGroup` | options/styles | `src/dms/packages/dms/src/ui/components/LayoutGroup.theme.jsx` |
| TopNav | `topnav` | options/styles | `src/dms/packages/dms/src/ui/components/TopNav.theme.jsx` |
| SideNav | `sidenav` | options/styles | `src/dms/packages/dms/src/ui/components/SideNav.theme.jsx` |
| NavigableMenu | `navigableMenu` | options/styles | `src/dms/packages/dms/src/ui/components/navigableMenu/theme.js` |
| Nestable | `nestable`, `nestableInHouse` | options/styles | `src/dms/packages/dms/src/ui/components/draggableNav.jsx` (and `nestableInHouse/`) |
| Logo | `logo` | flat | `src/dms/packages/dms/src/ui/components/Logo.theme.js` |
| Button | `button` | options/styles | `src/dms/packages/dms/src/ui/components/Button.theme.jsx` |
| Input | `input` | flat | `src/dms/packages/dms/src/ui/components/Input.theme.js` |
| MultiSelect | `multiselect` | options/styles | `src/dms/packages/dms/src/ui/components/MultiSelect.theme.js` |
| Tabs | `tabs` | options/styles | `src/dms/packages/dms/src/ui/components/Tabs.theme.jsx` |
| Switch | `switch` | options/styles | `src/dms/packages/dms/src/ui/components/Switch.theme.js` |
| FieldSet | `field` | flat | `src/dms/packages/dms/src/ui/components/FieldSet.theme.js` |
| Label | `label` | flat | `src/dms/packages/dms/src/ui/components/Label.jsx` |
| Icon | `icon` + global `Icons` map | flat + map | `src/dms/packages/dms/src/ui/components/Icon.theme.js` |
| Dialog | `dialog` | flat | `src/dms/packages/dms/src/ui/components/Dialog.theme.jsx` |
| Modal | `modal` | flat | `src/dms/packages/dms/src/ui/components/Modal.theme.jsx` |
| Drawer | `drawer` (none registered today) | flat | `src/dms/packages/dms/src/ui/components/Drawer.theme.jsx` |
| DeleteModal | (uses dialog/modal) | flat | `src/dms/packages/dms/src/ui/components/DeleteModal.theme.js` |
| dataCard (Card section) | `dataCard` | options/styles | `src/dms/packages/dms/src/ui/components/card.theme.jsx` |
| Pill | `pill` | options/styles | `src/dms/packages/dms/src/ui/components/Pill.theme.js` |
| Table | `table` | options/styles | `src/dms/packages/dms/src/ui/components/table/table.theme.js` |
| Lexical | `lexical` | flat | `src/dms/packages/dms/src/ui/components/lexical/theme.js` |
| Graph (legacy) | `graph` | options/styles | `src/dms/packages/dms/src/ui/components/graph/theme.js` |
| avlGraph (new) | `avlGraph` | options/styles | `src/dms/packages/dms/src/ui/components/graph_new/theme.js` |
| Map | `map` | options/styles | `src/dms/packages/dms/src/ui/components/map/map.theme.js` |
| textSettings | `textSettings` | options/styles | `src/dms/packages/dms/src/ui/themes/textSettings.js` |

The top-level registration is in
`src/dms/packages/dms/src/ui/defaultTheme.js` — use that as the
authoritative top-level key list, plus pattern-level entries:

| Pattern key | Source of truth |
|---|---|
| `pages.attribution`, `pages.complexFilters`, `pages.sectionGroupsPane`, `pages.search*` | `src/dms/packages/dms/src/patterns/page/defaultTheme.js` |
| `datasets.datasetsList`, `datasets.metadataComp` | `src/dms/packages/dms/src/patterns/datasets/defaultTheme.js` |
| `auth.login`, `auth.signup` | `src/dms/packages/dms/src/patterns/auth/defaultTheme.js` |

### 3.3 The per-primitive workflow (repeat for each)

1. **Open the `.theme.{js,jsx}` source file.** Read the default
   theme's keys. This is your target list for `styles[0]` (or for
   the flat top level).
2. **Find the matching mockup** in `design-system/components.html`
   (or `patterns.html` for pattern-level themes).
3. **Map mockup element → theme key.** For each key in the
   source-of-truth list, find the corresponding element in the
   mockup and copy the Tailwind classes off it. If the mockup
   used a custom class from `_shared.css`, the class string still
   goes into the theme as-is — only the CSS rule moves to
   `index.css.additions`.
4. **Add named variants.** If the mockup shows multiple visual
   treatments of the same primitive (e.g., 4 button styles, 2
   Layout variants), add them as `styles[1..n]` with sparse
   overrides.
5. **For any source-of-truth key not represented in the mockup**,
   either:
   - **Style it conservatively** in the brand's palette (so it
     looks "of-a-piece" even though the brand didn't explicitly
     spec it), and note in the brand README that the key was
     filled in implicitly; OR
   - **Inherit by omission** (leave it out of your overlay so the
     codebase default fills it in) — only if the codebase default
     is visually compatible with the brand.
6. **Check the source `.jsx` file** if a key's name doesn't make
   sense to you. The component's render code (e.g., `Button.jsx`)
   tells you which DOM element each key lands on and what role it
   plays.

---

## 4. icons.js — the registry

Icons are referenced **by name**, never by import. The theme
provides the registry:

```js
// theme/icons.js
import React from 'react';

export const Menu       = (props) => <svg {...props} viewBox="0 0 24 24">…</svg>;
export const ChevronDown = (props) => <svg {...props} viewBox="0 0 24 24">…</svg>;
// … one per name

const icons = { Menu, ChevronDown, /* … */ };
export default icons;
```

Then in `theme.js`:

```js
import icons from './icons';
const brandTheme = {
  // … other component themes
  Icons: icons,
};
```

Each `.theme.{js,jsx}` source file shows you which icon names that
primitive uses (e.g., TopNav: `Menu`, `XMark`; SideNav:
`ArrowRight`, `ArrowDown`; MultiSelect: `Check`, `XMark`).
**Every name referenced anywhere in your `theme.js` must exist as
a key in `Icons`** — a missing icon name silently renders nothing.

Source the inline SVGs from your mockups. Each SVG should be a 24px
grid component with the brand's stroke weight. Lucide and Phosphor
are common starting points; a custom drawn set works too — but
provide one coherent style throughout. Standard names you'll
almost always need: `Menu`, `XMark`, `ChevronDown`, `ChevronRight`,
`ArrowDown`, `ArrowRight`, `ArrowLeft`, `Plus`, `Pencil`, `Trash`,
`Check`, `Search`, `Settings`, `User`, `Logo`.

---

## 5. tailwind.additions.js

Snippets that get merged into the consuming project's
`tailwind.config.js`:

```js
// theme/tailwind.additions.js
export default {
  theme: {
    extend: {
      colors: {
        bone:      '#F4F1EA',
        limestone: '#E8E2D5',
        slate:     '#2A2F36',
        oxide:     '#B5532C',
        // … the brand palette
      },
      fontFamily: {
        display: ['Newsreader', 'serif'],
        sans:    ['IBM Plex Sans', 'sans-serif'],
        mono:    ['IBM Plex Mono', 'monospace'],
      },
      // optional: spacing scales, fontSize scales the brand extends
    },
  },
};
```

This is what lets your theme use named colour classes
(`bg-bone`, `text-oxide`) instead of arbitrary values
(`bg-[#F4F1EA]`, `text-[#B5532C]`). For v0.1 themes it's also fine
to use arbitrary values directly in `theme.js` and skip the
Tailwind config additions; a follow-up pass can promote them to
named colors.

The brand README should note whether the theme uses named colors
(requiring the `tailwind.additions.js` to be merged in) or
arbitrary values (no Tailwind config changes needed).

---

## 6. index.css.additions

This file holds anything that must be in a CSS rule rather than a
class string, and that the theme can't declare via the
[`fonts` field](#61-fontsthe-themeowned-font-loader) (covered
below):

- **Brand surface utilities** the theme references by class name
  (`.tny-pane`, `.tessera-card`, etc.) — these mirror the
  `_shared.css` from the design system folder.
- **Minimal global resets** the brand requires.

Keep it small. Every rule here is something a consuming site has
to remember to load. Anything expressible in Tailwind belongs in
the theme.js class strings instead.

### 6.1 `fonts` — the theme-owned font loader

The theme can declare its fonts on a top-level `fonts` array.
When a site selects the theme, the DMS runtime calls
`loadThemeFonts(theme.fonts)` from `ui/useTheme.js#getPatternTheme`
to inject the corresponding `<link>` / `<style>` nodes into
`document.head` exactly once. **No per-site `index.css` edits
needed.**

Entry shapes:

```js
// theme.js
const fonts = [
  // Google Fonts — single stylesheet request for all families and weights
  { type: 'google', href: 'https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap' },

  // An external CSS file (your own _shared.css served from the public folder)
  { type: 'css', href: '/themes/tessera/_shared.css' },

  // A self-hosted webfont with one or more sources
  {
    type: 'face',
    family: 'IBM Plex Sans',
    weight: 400,
    style: 'normal',
    display: 'swap',
    sources: [
      { url: '/themes/tessera/fonts/IBMPlexSans-Regular.woff2', format: 'woff2' },
    ],
  },

  // Legacy single-source shorthand
  { type: 'face', family: 'Newsreader', weight: 400,
    src: '/themes/tessera/fonts/Newsreader-Roman.woff2', format: 'woff2' },

  // Raw CSS — required for Tailwind 4 themes; see §6.1.1 below.
  { type: 'style', id: 'tessera-font-stacks', content: `
      html, body { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; }
      .font-serif { font-family: "Newsreader", ui-serif, Georgia, serif; }
      .font-sans  { font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif; }
      .font-mono  { font-family: "IBM Plex Mono", ui-monospace, monospace; }
    ` },
];

export default { /* …other theme fields… */, fonts };
```

The loader is idempotent (each font is added at most once per
page lifetime) and SSR-safe (no-op when `document` is undefined).

To diagnose font issues at runtime, open the browser console and
set `window.__DMS_DEBUG_FONTS__ = true`, then refresh — the loader
logs every theme resolution, every font key it considered, and
whether each one was injected or skipped.

#### 6.1.1 Tailwind 4 — register fonts via `@theme`, not via class overrides

**This is the failure mode the first Tessera pass hit twice.**
Loading Newsreader from Google Fonts puts the typeface on the page,
but it doesn't make any element *use* it. And on Tailwind 4 the
*idiomatic* way to register a font family is its `@theme` directive
— literal `.font-serif { font-family: … }` overrides work but
fight the cascade and don't generate utility classes for new
families.

In this project, Tailwind 4 runs **at runtime in the browser** via
`<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4">`.
That runtime scans the DOM for `<style type="text/tailwindcss">`
blocks and processes their `@theme { … }` directives as if they
were in a build-time CSS file. The loader's `{ type: 'tailwind' }`
entry uses this hook: it injects a `<style type="text/tailwindcss">`
with your `@theme` declarations and Tailwind 4 picks them up.

Minimum viable theme registration:

```js
fonts: [
  // 1. Load the typefaces themselves (uses @import-in-<style> internally —
  //    Chromium sometimes drops dynamically-inserted <link rel="stylesheet">
  //    requests, but @import inside a <style> always fires the fetch).
  {
    type: 'google',
    href: 'https://fonts.googleapis.com/css2?family=Newsreader:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap',
  },

  // 2. Register the families with Tailwind 4 so .font-serif / .font-sans /
  //    .font-mono utilities resolve correctly AND the body picks up the
  //    brand sans via --default-font-family. This is the canonical
  //    Tailwind 4 mechanism (CSS-only — no JS config file in v4).
  {
    type: 'tailwind',
    id: '<brand>-tw-theme',
    content: `
      @theme {
        --font-sans: "<your sans>", ui-sans-serif, system-ui, sans-serif;
        --font-serif: "<your serif>", ui-serif, Georgia, serif;
        --font-mono: "<your mono>", ui-monospace, SFMono-Regular, Menlo, monospace;
        --default-font-family: "<your sans>", ui-sans-serif, system-ui, sans-serif;
      }
    `,
  },

  // 3. Belt-and-braces. The project loads Tailwind 4 twice (once at
  //    build via @tailwindcss/vite, once at runtime via the browser
  //    CDN); the build-time bundle sets its own :root variables that
  //    can shadow runtime @theme on first paint. This raw-CSS block
  //    re-pins the variables at :root so the runtime stack always wins.
  {
    type: 'style',
    id: '<brand>-font-stacks',
    content: `
      :root, :host {
        --font-sans: "<your sans>", ui-sans-serif, system-ui, sans-serif;
        --font-serif: "<your serif>", ui-serif, Georgia, serif;
        --font-mono: "<your mono>", ui-monospace, SFMono-Regular, Menlo, monospace;
        --default-font-family: "<your sans>", ui-sans-serif, system-ui, sans-serif;
      }
      html, body { font-family: var(--font-sans); }
      .font-serif { font-family: var(--font-serif); }
      .font-sans  { font-family: var(--font-sans); }
      .font-mono  { font-family: var(--font-mono); }
    `,
  },
],
```

The combination of entries 2 and 3 is what made the Tessera pass
work. Either alone failed: entry 2 alone left a window where the
build-time Tailwind's defaults still applied; entry 3 alone didn't
register utility classes for new families (e.g. a brand-specific
`.font-display`) that the runtime Tailwind would otherwise emit.

How to verify (after refresh):

- DevTools Network panel — you should see `200` responses from
  `fonts.googleapis.com/css2?...` and `fonts.gstatic.com/...woff2`
  matching your families.
- DevTools console: `document.fonts.forEach(f => f.family.includes('YourFont') && console.log(f.family, f.status))` — at least one weight should show `status: loaded`.
- `getComputedStyle(document.body).fontFamily` — starts with your
  sans family, not Geist or the system default.
- A test `<div class="font-serif">` — `getComputedStyle` starts
  with your serif family.
- `document.getElementById('<brand>-tw-theme')` and
  `document.getElementById('<brand>-font-stacks')` — both return
  `<style>` elements.

If `getComputedStyle` looks right but glyphs still show as
fallback, the font *file* isn't being downloaded. Check the
Network tab for failed `fonts.gstatic.com` requests (CSP /
ad-blocker / offline). The loader uses `@import` inside `<style>`
rather than `<link>` exactly to avoid one bug where Chromium drops
dynamically-inserted stylesheet links — if the request still
isn't being made, the cause is upstream of the loader.

#### 6.1.15 Self-hosted commercial fonts (Tiempos, Söhne, Recoleta, etc.)

For brands using a commercial typeface that isn't on Google
Fonts, the workflow is: put the font files directly in
`public/fonts/<brand>/<family>/`, then register one
`{ type: 'face' }` entry per weight/style in the theme's `fonts`
array pointing at `/fonts/<brand>/<family>/<file>`.

**Step 1 — Move the font files into `public/`.** Vite serves
`public/` at the site root, so anything under
`public/fonts/<brand>/<family>/` is reachable at the matching
URL:

```bash
mkdir -p public/fonts/<brand>
mv <wherever-the-foundry-shipped-them>/<family> public/fonts/<brand>/<family>
# Files are now at /fonts/<brand>/<family>/<file>
```

Don't symlink from inside `src/themes/<brand>/fonts/` to
`public/` — symlinks break on Windows, get forgotten, and add a
mental layer between "where do these files live" and the deploy
artifact. A direct copy/move is dumber and more durable.

`.woff2` is the production target — it's ~50% smaller than `.otf`
and ~30% smaller than `.woff`. If the foundry only ships `.otf`,
move them as `.otf` for v0 and convert to `.woff2` for production
(`fonttools` or `woff2_compress`).

**Step 2 — `@font-face` entries.** Each weight × italic gets its
own entry. A small helper keeps the theme readable:

```js
const FONT_DIR = '/fonts/<brand>/<family>';
const face = (family, weight, italic, file, format='woff2') => ({
  type: 'face',
  family,
  weight,
  style: italic ? 'italic' : 'normal',
  display: 'swap',
  sources: [{ url: `${FONT_DIR}/${file}`, format }],
});

const fonts = [
  face('My Display', 400, false, 'MyDisplay-Regular.woff2'),
  face('My Display', 400, true,  'MyDisplay-RegularItalic.woff2'),
  face('My Display', 500, false, 'MyDisplay-Medium.woff2'),
  face('My Display', 500, true,  'MyDisplay-MediumItalic.woff2'),
  face('My Display', 600, false, 'MyDisplay-Semibold.woff2'),
  face('My Display', 600, true,  'MyDisplay-SemiboldItalic.woff2'),
  // … any other families …
];
```

**Step 3 — Put the new family first in the font stacks.** Both
the `tailwind` `@theme` entry and the `style` runtime override
need it. Fall back to your prior choice (a Google Fonts family
or system serif) for the moment between `font-display: swap`
firing and the woff2 finishing:

```js
// Inside the `tailwind` entry's @theme block
--font-serif: "My Display", "Newsreader", ui-serif, Georgia, serif;
--font-display: "My Display", "Newsreader", ui-serif, Georgia, serif;
```

**Step 4 (optional) — Multiple optical-size cuts.** Foundries
that ship distinct optical-size masters (Tiempos: Fine /
Headline / Text · Söhne: Halbfett / Buch) register each as its
own font-family name and override the appropriate display tokens
to use the right one. Tessera does this with `Tiempos Fine` for
hero-scale display (60+px) and `Tiempos Headline` for the rest:

```js
const FONT_DISPLAY = 'font-serif';   // Tiempos Headline (default)
const FONT_FINE    = 'font-fine';    // Tiempos Fine — hero-scale only

const T = {
  displayHero: `${FONT_FINE}    font-medium text-[76px] …`,
  displayXL:   `${FONT_DISPLAY} font-medium text-5xl   …`,
  // …
};
```

With matching `--font-fine` registered in `@theme` and a
`.font-fine { font-family: var(--font-fine); }` rule in the
runtime CSS override.

**Worked example:**
`src/themes/tessera/tessera-theme.js` registers 12 Tiempos faces
(6 Headline + 6 Fine, weights 400/500/600 × roman/italic) backed
by font files directly in `public/fonts/tessera/tiempos/`. The 17
brand tokens use Tiempos Headline by default; `displayHero` and
`displayItalicHero` are overridden to use Tiempos Fine.

#### 6.1.2 Variable fonts and the `opsz` (optical size) axis

If the design system uses a **variable** display font (Newsreader,
Source Serif 4, Recursive, Inter, etc.) and the rendered headings
look thinner / more spread than the design at large sizes (76px,
60px, 48px), the cause is almost always the optical-size axis.
Variable fonts ship multiple **optical-size masters** — different
glyph designs optimized for different rendering sizes — exposed
on an `opsz` variation axis (typically 6..72).

The design mockup, when it loads the woff2 file directly
(`format("woff2-variations")`), pulls the full variable font and
the browser auto-switches glyphs by rendered size. Google Fonts'
default CSS query *does not* include the opsz axis — you get one
master, stretched up to whatever px the heading is.

The fix is in the Google Fonts URL:

```text
// WRONG — no opsz axis; all sizes use the same baseline master
?family=Newsreader:wght@400;500;600

// RIGHT — explicit opsz range alongside wght (and ital for italic faces)
?family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..700
```

Pair the URL change with a CSS rule that tells the browser to
auto-pick the optical size from the rendered text size (most
modern browsers default to this, but stating it explicitly avoids
regression):

```css
:where(.font-serif, .font-display) { font-optical-sizing: auto; font-synthesis: none; }
```

How to detect this in the wild:
- Hero headings at 60–80px look "thinner / more spread" than the
  design mockup.
- Lowercase letters in body text look slightly heavier or
  narrower than expected — same axis, in the other direction.
- Different rendered sizes look like the *same* glyph design just
  scaled — a sure sign opsz is missing.

This gotcha shows up only for fonts that ship optical-size
masters. Static fonts (Inter, IBM Plex Sans, IBM Plex Mono, most
sans families) don't have an opsz axis; for those the simpler
`wght@400;500;600` URL is correct. Check the font's variable-font
documentation: if it lists an `opsz` axis, request it.

What this lets you cut from `index.css.additions`:

- `@font-face` declarations — move to `fonts: [{ type: 'face', … }]`.
- Google Fonts `<link>` tags in the consuming site's `index.html`
  — move to `fonts: [{ type: 'google', href }]`.
- Tailwind `@theme` font-family extensions in the site's CSS —
  move to `fonts: [{ type: 'tailwind', content }]`.

What remains in `index.css.additions`:

- Brand surface utilities that can't be Tailwind classes.
- Global resets the brand requires.
- Any CSS that must apply *before* React mounts (rare).

---

## 7. README.md

One paragraph for the brand identity at a glance, plus a catalog of
named variants:

```markdown
# <Brand> theme

<One-paragraph summary of the brand: surfaces, ink, accents, vibe.>

## Variants

- `layout.styles`: `default` · `app` · `bare`
- `layoutGroup.styles`: `content` · `header` · `auth` · `footer`
- `button.styles`: `default` · `plain` · `active` · `danger`
- `dataCard.styles`: `default` · `compact` · `hero`
- `pill` colors: `default`, `zinc`, `blue`, `green`, `amber`, `red`, `slate`

## Primitives this theme styles

<list of primitives with non-default treatments>

## Primitives this theme does NOT style

<list of primitives the brand declined; live sites inherit the codebase default for these>

## Custom additions

- `columnTypes.<name>` (if any)
- `pageComponents.<name>` (if any)
- `_shared.css` surface utilities required: `.tny-pane`, `.tny-card`
- Tailwind config additions: brand colors, fontFamily.display / .sans / .mono
```

---

## 8. theme.js skeleton

```js
// theme/theme.js
import icons from './icons';
// import pageComponents from './components';   // optional, only if the brand ships custom section components

const brandTheme = {
  // ----- Foundation -----
  textSettings: { options: { activeStyle: 0 }, styles: [ /* see textSettings.js for keys */ ] },
  Icons: icons,

  // ----- Composition -----
  layout:      { options: { activeStyle: 0, sideNav: {...}, topNav: {...} }, styles: [ /* default, app, bare, … */ ] },
  layoutGroup: { options: { activeStyle: 0 }, styles: [ /* content, header, auth, footer, … */ ] },

  // ----- Navigation -----
  topnav:        { options: { activeStyle: 0, maxDepth: 2 }, styles: [ /* keys: see TopNav.theme.jsx */ ] },
  sidenav:       { options: { activeStyle: 0 },               styles: [ /* keys: see SideNav.theme.jsx */ ] },
  navigableMenu: { options: { activeStyle: 0 }, styles: [ /* keys: see navigableMenu/theme.js */ ] },
  nestable:      { options: { activeStyle: 0 }, styles: [ /* keys: see draggableNav.jsx */ ] },
  logo:          { /* flat: see Logo.theme.js */ },

  // ----- Interaction -----
  button:      { options: { activeStyle: 0 }, styles: [ /* default, plain, active, danger, … */ ] },
  input:       { /* flat: see Input.theme.js */ },
  multiselect: { options: { activeStyle: 0 }, styles: [ /* keys: see MultiSelect.theme.js */ ] },
  tabs:        { options: { activeStyle: 0 }, styles: [ /* keys: see Tabs.theme.jsx */ ] },
  switch:      { options: { activeStyle: 0 }, styles: [ /* keys: see Switch.theme.js */ ] },
  field:       { /* flat: see FieldSet.theme.js */ },
  label:       { /* flat: see Label.jsx */ },

  // ----- Overlays -----
  dialog: { /* flat: see Dialog.theme.jsx */ },
  modal:  { /* flat: see Modal.theme.jsx */ },

  // ----- Containers / atoms -----
  dataCard: { options: { activeStyle: 0 }, styles: [ /* keys: see card.theme.jsx */ ] },
  card:     { /* flat */ },
  pill:     { options: { activeStyle: 0 }, styles: [ /* keys: see Pill.theme.js */ ] },
  icon:     { /* flat: see Icon.theme.js */ },

  // ----- Rich content / data -----
  lexical:  { /* flat: see lexical/theme.js */ },
  graph:    { options: { activeStyle: 0 }, styles: [ /* keys: see graph/theme.js */ ] },
  avlGraph: { options: { activeStyle: 0 }, styles: [ /* keys: see graph_new/theme.js */ ] },
  map:      { options: { activeStyle: 0 }, styles: [ /* keys: see map/map.theme.js */ ] },
  table:    { options: { activeStyle: 0 }, styles: [ /* keys: see table/table.theme.js */ ] },

  // ----- Pattern-level -----
  pages: {
    attribution:       { /* see patterns/page/.../Attribution.theme.js */ },
    complexFilters:    { /* see patterns/page/.../ComplexFilters.theme.js */ },
    searchButton:      { /* … */ },
    searchPallet:      { /* … */ },
    sectionGroupsPane: { /* … */ },
  },
  datasets: {
    datasetsList: { /* see patterns/datasets/defaultTheme.js */ },
    metadataComp: { /* … */ },
  },
  auth: {
    login:  { /* … */ },
    signup: { /* … */ },
  },

  // ----- Optional brand extensions -----
  columnTypes:    {},   // theme-registered column types (e.g. portrait_banner, stream_player)
  pageComponents: {},   // theme-registered page components
};

export default brandTheme;
```

The actual file in
[`src/themes/tessera/tessera-theme.js`](../../../themes/tessera/tessera-theme.js)
is the worked example — open it side-by-side with this skeleton.

---

## 9. Verification

Translation is *done* when:

1. Every primitive the design system depicted on
   `components.html` has a matching `styles[0]` (or flat overlay)
   in `theme.js`, and **every key in the codebase
   `.theme.{js,jsx}` source for that primitive is present**.
2. Every variant the design system depicted (multiple button
   styles, multiple LayoutGroup recipes, etc.) has a corresponding
   `styles[1..n]` entry.
3. Every pattern-level theme depicted on `patterns.html` has a
   matching entry under `pages.*` / `datasets.*` / `auth.*`.
4. `theme/icons.js` exports a component for every icon name
   referenced in `theme/theme.js`.
5. `theme/tailwind.additions.js` declares every brand color / font
   family referenced by name (or the theme uses arbitrary values
   throughout and the README says so).
6. `theme/index.css.additions` declares every `@font-face` and
   every brand surface utility class string used in the theme.
7. A live DMS site loading the theme renders every primitive in a
   way that matches the design system's `components.html`. Walk a
   real page that uses each primitive and confirm visually.

### A common-failure checklist

If a live page looks off:

- **Element renders with the platform default colours.** A key
  you shipped doesn't match the component's API. Grep the source
  `.theme.{js,jsx}` for the expected key and rename.
- **TopNav / SideNav looks like Catalyst.** You shipped invented
  keys (`wrapper`, `inner`, `menu`, …) instead of the actual ones
  (`topnavWrapper`, `topnavContent`, `navitem`, `navitemActive`,
  …). See [§3.1](#31-the-topnavsidenav-gap--invented-keys-silently-no-op).
- **Icon doesn't render.** The icon name in the theme isn't a key
  in `Icons`. Check capitalisation; React component or function
  expected.
- **A nested style appears with the wrong colour.** A `styles[N>0]`
  for `name: "dark"` didn't override the key, so it's inheriting
  from `styles[0]`. Add the missing key to the override.
- **Auth / dataset / pattern UI looks generic.** You didn't ship
  the `pages.*` / `datasets.*` / `auth.*` overlay. Check
  `patterns.html` for the matching mockup and produce the overlay.

---

## 10. Reading list

Before translating, read in order:

1. **`brand-output/README.md`** — the brand's stated intent.
2. **[`designing-a-dms-design-system.md`](./designing-a-dms-design-system.md)**
   — the sibling skill that produced your input. The "Finding the
   canonical theme keys" section in §2 lists every primitive's
   source-of-truth `.theme.{js,jsx}` file.
3. **This document** — the translation grammar.
4. **`src/dms/packages/dms/src/ui/defaultTheme.js`** — the
   top-level theme registration. Confirms which top-level key each
   primitive lives under, including pattern-level entries
   (`pages.*`, `datasets.*`, `auth.*`).
5. **`src/dms/packages/dms/src/ui/THEMING_GUIDE.md`** — the
   canonical theming reference inside the codebase. More
   mechanical than this skill; covers the conversion process for
   adding a *new* primitive to the theme system. Useful for
   understanding the contract from the component-author's side.
6. **`src/themes/CLAUDE.md`** — the "configure the Card, don't
   write a new component" philosophy. Important for understanding
   why the Card primitive is the workhorse and gets the most theme
   attention.
7. **`src/themes/avail/theme.js`** and **`src/themes/wcdb/`** —
   two existing themes that demonstrate full theme overlays.
8. **`src/themes/tessera/tessera-theme.js`** — the worked example
   for this skill, paired with `src/themes/tessera/design_system_v2/`
   as input.

---

## Appendix — quick reference cheat sheet

```
Theme shape:  { options: { activeStyle }, styles: [{ name, …classKeys }] }
              (or flat object for legacy primitives)
Style 0:      Complete default. Every key the component reads must exist here.
Styles 1+:    Sparse overrides. Missing keys inherit from styles[0].
Read via:     getComponentTheme(theme, 'foo.bar', activeStyle)
Values are:   Tailwind class strings (or icon-name strings, or sub-objects)

Where the keys come from:
  src/dms/packages/dms/src/ui/components/<Foo>.theme.{js,jsx}
  src/dms/packages/dms/src/ui/defaultTheme.js                  (registration map)
  src/dms/packages/dms/src/ui/themes/textSettings.js           (textSettings keys)
  src/dms/packages/dms/src/patterns/<pattern>/defaultTheme.js  (pattern-level keys)

Ships in:
  theme/
  ├── README.md
  ├── theme.js                ← the complete overlay
  ├── icons.js
  ├── icons/
  ├── tailwind.additions.js
  └── index.css.additions

The biggest single primitive to translate:    dataCard (largest key set)
The most far-reaching single artifact:        textSettings.styles[0]
The two primitives that bit Tessera v1:       TopNav, SideNav
                                              (invented keys silently no-op)
The thing that breaks if you forget it:       Icons map
The rule that keeps it honest:                read the .theme file first
```
