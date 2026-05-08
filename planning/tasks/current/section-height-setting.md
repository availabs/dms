# Section-level height setting

## Status: IMPLEMENTED — 2026-05-08 (pending live test)

Phases 1-3 shipped. Storage path resolved: section state is flat at `value` level (sibling to `title`/`size`/`tags`), so `value.height` is the home — no `display` blob at the section value level. Control wired into the existing **Layout** group of the section menu, alongside Width/Rowspan/Padding (matches the precedent set by `value.size` reading from `pages.sectionArray.sizes`). Selecting `auto` clears the field (`updateAttribute('height', undefined)`) so the BC default state is "field absent" rather than "field === 'auto'".

### What landed

- **`section.theme.jsx`** — default style gets a `heights` map: `auto: 'auto'`, `fill: 'fill'` (sentinel), `hero: 'calc(100vh - 80px)'`, `tall: '640px'`, `medium: '400px'`, `small: '240px'`. Sites override / extend by shipping `pages.section.styles[i].heights`.
- **`sectionMenu.jsx`** — new Height entry in the Layout group. Hidden entirely when the active section style ships no `heights` map (so a downstream theme that hasn't opted in sees no new control).
- **`section.jsx`** — new `resolveSectionHeightStyles(heightKey, sectionTheme)` helper at module scope. Returns `{ wrapperStyle, contentWrapperStyle }`. Both are `{}` when `heightKey` is falsy or `'auto'` (the BC contract). Otherwise produces flex-column on the wrapper + `flex: 1 1 auto; min-height: 0` on contentWrapper. Applied at both render paths (EditSection ~L234, ViewSection ~L420).
- Inline styles applied conditionally — `style={Object.keys(s).length ? s : undefined}` — so under default the `style` prop is `undefined` and React strips it. EditSection's wrapper had no `style` prop pre-feature, so the result is identical. ViewSection's wrapper merges into the existing `{ pageBreakInside: 'avoid' }`; under default the spread of `{}` is a no-op.

### Phase 4 / first consumer

Not done yet — that's the smoke test. Once the dev server picks up the changes:

- [ ] Open WCDB now-airing section in the editor, set `height: fill` from the Layout menu.
- [ ] Switch the portrait_banner column's `bannerHeight` from `'full'` to `'fill'`.
- [ ] Verify the banner fills the section's track in the home `header` sectionGroup, no overflow / no collapse.
- [ ] Diff a different page (any non-WCDB site) DOM before/after to confirm BC for sections that didn't opt in.

---

## Objective

Let a section author declare an explicit **height** on a section (`auto` / `fill` / theme-defined presets like `hero` / `tall`) so that descendants which want to fill available space — `bannerHeight: 'fill'` on `portrait_banner`, `cellsRowHeight: 'fill'` on Card, future fill-style behaviours on graph/map — actually have a parent height to resolve against. Today the chain has no explicit height anywhere from `section.wrapper` down through `contentWrapper` → element → Card grid, so any `'fill'` mode collapses to 0.

The first concrete consumer is the WCDB home-page hero (now-airing card sitting inside the `header` sectionGroup) — the banner wants to fill the visible vertical track, but currently has to use `bannerHeight: 'full'` (`calc(100vh - 220px)`) as a static workaround. With this task, the section can be set to `height: fill` and the banner can drop back to `'fill'`, letting the sectionGroup own the viewport math.

## Backwards compatibility — non-negotiable

**This change must not affect any existing section.** All existing sections render today without a height set; the default for the new control is `auto` (no inline style applied, no flex-column wrapper change). Concretely:

- When `value.height` (or `value.display.height` — see Approach for the chosen storage path) is **unset** or `'auto'`, `section.jsx` MUST render exactly the markup it does today — no extra wrapper styles, no flex direction change, no h-full propagation. The diff to today's HTML for an existing section should be **byte-identical** under `auto`.
- Existing themes that don't ship a `heights` preset map MUST keep working — the height select either falls back to `[auto]` only, or the control is hidden when no presets exist. Decide in implementation; document the call.
- The `theme.contentWrapper = 'h-full'` token already exists in `section.theme.jsx`; we are not changing it. We're only changing what's *above* it (the section wrapper itself).
- No changes to `Card.jsx`, `graph/index.jsx`, `map/...`, or any other element-renderer internals. Element renderers inherit height through CSS via the existing `h-full` chain. If a specific renderer's outer wrapper isn't `h-full` and it should be, that's a follow-up *theme* edit, not a renderer edit.
- No migration of existing section state. The new field is optional and absent rows are treated as `auto`.

A reviewer reading the diff should be able to confirm BC by running the WCDB site (and any other site) without setting any heights and observing **no visual or DOM change**.

## Scope

**In:**

- New optional section-level field for height. Storage path: `value.display.height` is the natural home (display is already the per-section render-config blob, and height belongs to render config, not data semantics). Confirm during implementation that section state has `display` available at the section level (not just inside the data-wrapped element); fall back to `value.height` if not.
- New section-theme entry: `section.theme.js`'s active style gets a `heights` map of named presets. Mirrors the `portraitBanner.bannerHeights` shape (`{ key: cssValue, fill: 'fill' as a sentinel }`).
- New control in the section menu under the existing **Layout** (or equivalent) group. Type `select`, key `height`, options sourced from the theme's `heights` map at consumer time (so theme-registered heights show up, same lazy pattern we use for column types and font styles).
- `section.jsx` resolves the chosen key against `section.theme.heights`, applies the resolved value as inline style on `theme.wrapper`, and only when the value is a non-`auto` resolution adds `display: flex; flex-direction: column` so topBar + header + contentWrapper share the column track. `contentWrapper` keeps its existing `h-full`; we additionally apply `flex: 1 1 auto; min-height: 0` to it inline so flex children can shrink below content-size (otherwise content overflow expands the section).
- The `'fill'` sentinel (same convention as `portraitBanner.bannerHeight: 'fill'`) maps to `flex: 1 1 auto` on the section wrapper itself, for sections inside a flex/grid sectionGroup that allocates remaining space.

**Out:**

- Renderer-internal changes to Card / graph / map / richtext. They already inherit height through theme tokens.
- Width controls. Sections always go full-width inside their column; no per-section width control in this task.
- Min-height / max-height. Single `height` axis is enough for v1; if a clamp is needed it can be added to the preset's CSS value (`'min(50vh, 600px)'` etc.).
- Per-breakpoint heights. If the responsive story matters, presets can encode it (`'clamp(400px, 50vh, 800px)'`); a separate mobile/desktop control is out of scope.
- Migrating existing `bannerHeight: 'full'` (= `calc(100vh - 220px)`) consumers off the workaround. Once this lands the WCDB now-airing card *can* switch to `bannerHeight: 'fill'` + section `height: fill`, but that's an authoring change made through the editor, not a code migration.
- Theme-manager UI for editing the `heights` map (textareas to author preset values). The existing `themeSettings.js` pattern handles this if the heights map is registered there; not required for v1.

## Current State

### Section render path

`section.jsx` (the ViewSection branch, ~line 385+):

```jsx
<div className={editPageMode && hideSection && !editPageMode ? theme.wrapperHidden : theme.wrapper} style={{pageBreakInside: "avoid"}}>
    <div className={theme.topBar}>...</div>
    {showHeader ? <ViewSectionHeader ... /> : ''}
    <div className={theme.contentWrapper}>
        {element}    // Component.ViewComp — Card / graph / map / etc.
    </div>
    <DeleteModal .../>
</div>
```

`section.theme.jsx`:

```js
{
  wrapper: '',                  // empty by default — no height, no flex
  wrapperHidden: 'hidden',
  topBar: 'flex',
  topBarSpacer: 'flex-1',
  contentWrapper: 'h-full',     // <-- already there, BC preserved
  ...
}
```

`contentWrapper`'s `h-full` is the propagation surface — when `wrapper` has no height, `h-full` on contentWrapper resolves against an unset parent and effectively does nothing (modern browsers treat `height: 100%` of an auto-height parent as auto). When `wrapper` gets an explicit height, `h-full` propagates correctly.

### Section group (header type)

The `header` sectionGroup (per the user, already shipped and working) gives its children a viewport-relative track via flex layout. Sections inside it currently render content-sized; this task lets a section opt into filling that track.

### Existing precedent

`portraitBanner.theme.js` already ships a `bannerHeights` preset map and a `'fill'` sentinel that the column resolves against `flex: 1 1 auto + height: 100%`. The section-level work is the same shape, one level up — section theme exposes presets, section state picks a key, section wrapper applies the resolved CSS.

## Approach

### Phase 1: Theme

Add `heights` to `section.theme.jsx`'s default style:

```js
heights: {
  auto: 'auto',
  fill: 'fill',                   // sentinel — wrapper gets flex sizing
  hero: 'calc(100vh - 80px)',     // viewport minus topnav
  tall: '640px',
  medium: '400px',
  small: '240px',
},
```

Sites can override / extend by shipping their own `pages.section.styles[i].heights` map. Defaults exist so the control isn't empty on a stock site; the values are conservative.

### Phase 2: Control

Add a section-level layout control. Two paths to verify in implementation:

- **(A)** Add to the section menu directly (sectionMenu.jsx top-level controls). Lives alongside existing layout-group items.
- **(B)** Add to `additionalSectionAttributes` on the page pattern format, so it's threaded through the existing per-section attribute control machinery (the same machinery that handles `title`, `level`, `padding`, `tags`, …).

(B) is more idiomatic — sections already have a per-section attribute system for "render-config that isn't tied to a specific element type." Confirm during implementation; default to (B) unless it's noticeably more wiring.

The control:

```js
{ type: 'select', label: 'Height', key: 'height',
  options: ({ theme }) => Object.keys(getComponentTheme(theme, 'pages.section').heights || { auto: 'auto' })
    .map(k => ({ label: k, value: k })),
  defaultValue: 'auto',
}
```

`options` resolved lazily so theme-registered heights are picked up.

### Phase 3: Apply in section.jsx

```jsx
const heightKey = value?.display?.height || value?.height || 'auto';   // confirm storage path
const heights = sectionTheme?.heights || {};
const resolvedHeight = heights[heightKey] ?? heightKey;                // unknown keys pass through verbatim
const isAuto = !resolvedHeight || resolvedHeight === 'auto';
const isFill = resolvedHeight === 'fill';

const wrapperStyle = {
    pageBreakInside: 'avoid',
    ...(isAuto ? {}                                                    // BC: no extra style under default
        : isFill ? { flex: '1 1 auto', minHeight: 0,
                     display: 'flex', flexDirection: 'column' }
        : { height: resolvedHeight,
            display: 'flex', flexDirection: 'column' }),
};

const contentWrapperStyle = isAuto
    ? undefined                                                        // BC: existing h-full class only
    : { flex: '1 1 auto', minHeight: 0 };                              // shrinks below content
```

Applied:

```jsx
<div className={...} style={wrapperStyle}>
    <div className={theme.topBar} style={!isAuto ? { flex: '0 0 auto' } : undefined}>...</div>
    {showHeader ? <ViewSectionHeader ... /> : ''}
    <div className={theme.contentWrapper} style={contentWrapperStyle}>
        {element}
    </div>
    ...
</div>
```

The `style` overrides only kick in when `!isAuto`. Under `auto`, every style prop is `undefined` and React strips them — the rendered HTML is byte-identical to today.

### Phase 4: First consumer (out of scope, but to validate the design)

Once the wiring is in, the WCDB now-airing card section can be reconfigured:

- Section `display.height = 'fill'`
- portrait_banner column `bannerHeight = 'fill'`

Visually equivalent to today's `bannerHeight: 'full'` (`calc(100vh - 220px)`) but driven by the parent track instead of a hard-coded viewport math. This is an *authoring* change made through the editor; no code migration. Treat it as the smoke test that the new plumbing actually works end-to-end.

## Files Requiring Changes

- [ ] `src/dms/packages/dms/src/patterns/page/components/sections/section.theme.jsx` — add `heights` preset map to the default style.
- [ ] `src/dms/packages/dms/src/patterns/page/components/sections/section.jsx` (ViewSection + EditSection branches) — read `display.height`, resolve, apply inline styles when non-`auto`.
- [ ] `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` **OR** `src/dms/packages/dms/src/patterns/page/page.format.js` (if going the `additionalSectionAttributes` route) — add the height select to the Layout group.
- [ ] `src/themes/wcdb/wcdb_theme.js` (optional, can be a follow-up after the framework lands) — register a WCDB-specific `heights` map under `pages.section.styles[].heights` if the default presets aren't right for WCDB's typography scale and topnav math.
- [ ] No changes to `Card.jsx`, `graph/index.jsx`, `map/...`, `Card.config.jsx`, `dataWrapper/index.jsx`. **If a renderer's outer wrapper turns out to need an `h-full` it doesn't have, that's a one-line theme edit, not a renderer edit.**

## Testing Checklist

### Backwards compatibility (must pass before anything else)

- [ ] On a fresh checkout with no `display.height` set on any section, every existing site (WCDB, dmsdocs, b3nson, mitigat-ny, etc.) renders **byte-identical HTML** for sections (modulo whitespace). Diff the rendered DOM of a representative page before/after the change.
- [ ] Existing sites whose theme doesn't define a `heights` map still render — control either hides or falls back to `[auto]` only.
- [ ] Switching the height select to `auto` on a section that had a non-default value applied returns the section to byte-identical pre-feature rendering.
- [ ] No new console warnings, no React key warnings, no theme-resolution warnings.

### Functional

- [ ] Set `height: fill` on a section inside the WCDB header sectionGroup. Verify the section stretches to fill the available track.
- [ ] With section `height: fill` and portrait_banner `bannerHeight: fill`, verify the banner fills the section (the long-deferred case for the now-airing card).
- [ ] Set `height: hero` (or whichever preset resolves to `calc(100vh - …)`) on a standalone section. Verify it takes that exact height regardless of content.
- [ ] Set a small height (e.g. `medium: 400px`) on a section whose content is taller than 400px. Verify content overflows or scrolls per `theme.contentWrapper`'s overflow setting (current `h-full` doesn't set overflow; if scroll is desired, that's a separate theme key, not part of this task).
- [ ] Hide the section header (no title). Verify the contentWrapper still resolves height correctly — flex column should give it the full track minus topBar.
- [ ] Show the section header with a tall title. Verify topBar + header take their natural size and contentWrapper takes the remainder.

### Authoring

- [ ] Open the section menu. Verify the Height select appears under the Layout group, with options sourced from `section.theme.heights`.
- [ ] Selecting a height persists into the section state (round-trip: save → reload → option still selected).
- [ ] Selecting `auto` clears the height and the section snaps back to content-sized.
- [ ] Theme-registered height presets (e.g., a site adds `heights.editorial: '720px'`) appear in the select without restarting the dev server (HMR).

### Edge cases

- [ ] Section with `hideInView: true` is unaffected by height settings (already short-circuits via wrapperHidden).
- [ ] `pageBreakInside: 'avoid'` still applied — not regressed by the inline-style merge.
- [ ] Print stylesheet: heights set via `vh` or `calc(100vh - …)` should fall back gracefully on print. Test by triggering print preview on a tall-section page; document any regressions as follow-up rather than blocking this task.

## Open Questions

- **Storage path: `value.display.height` vs `value.height`.** Confirm during implementation whether section-level state has a `display` blob (`value.display`) or whether display is only on the data-wrapped element-data. Looking at section dumps, `display` is on `element-data` (Card/graph state), not on the section value itself. So the height likely needs to live as `value.height` directly. Verify and document the call.
- **Control location: section menu vs additionalSectionAttributes.** Both paths work; pick the more idiomatic one and document the call.
- **Default `heights` values.** The presets above are first-pass guesses (WCDB-flavoured). The default theme should ship sensible cross-site values; sites override per their typography ramp. Bikeshed in PR review.
- **Should `fill` be the default for sections inside `header`-type sectionGroups?** Probably not — explicit-opt-in is safer. But worth considering a sectionGroup-side default that propagates if individual sections don't override.

## References

- Now-airing task that surfaced this need: [tasks/completed/wcdb-schedule-now-playing-card.md](../completed/wcdb-schedule-now-playing-card.md)
- Precedent for theme-driven preset map + `'fill'` sentinel: `src/themes/wcdb/columnTypes/portraitBanner.theme.js`, `portraitBanner.jsx`
- Section render path: `src/dms/packages/dms/src/patterns/page/components/sections/section.jsx`
- Section theme: `src/dms/packages/dms/src/patterns/page/components/sections/section.theme.jsx`
- Recipe doc the now-airing card produced: `src/dms/skills/now-airing-card.md`
