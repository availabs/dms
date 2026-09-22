# Map hover popup font tokens are silently inert under Tailwind v4

**Status: DIAGNOSED + measured, NOT FIXED.** A workaround exists in one consumer
(`transportnyv2`); the core fix is a behaviour change for every existing consumer and needs a BC
assessment before it is attempted. · **Topic:** patterns/page (ComponentRegistry/map) ·
**Found:** 2026-09-22

## Objective

Make a hover column's `valueFontStyle` / `headerFontStyle` actually apply the named theme token.
Today most of them do nothing at all, silently.

## Current State — the bug

A map layer's hover column can name a font style per row. `SymbologyViewLayer.jsx` resolves that
name against `{...getComponentTheme(theme,'textSettings',0), ...getComponentTheme(theme,'dataCard',0)}`
and then passes the resulting class string through **`toImportantClasses`**
(`patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx:1815`,
and the same helper at `patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx:724`):

```js
const toImportantClasses = (className = '') =>
  String(className).split(/\s+/).filter(Boolean)
    .map((token) => token.startsWith('!') ? token : `!${token}`)
    .join(' ');
```

It prefixes every class with a leading `!` — legacy Tailwind **v3** important syntax — and it does
so **at runtime**.

**Tailwind v4 only emits classes it finds by scanning source text.** A class name assembled at
runtime is never scanned, so the prefixed class was never generated and the browser drops it. There
is no error and no warning: the row simply renders at its default weight/size/colour, which reads as
"the config didn't take".

### Measured, on the live `/npmrds` bundle (2026-09-22)

Each probe appends a `<div>` with only that class and reads the computed style:

| class | computed | verdict |
|---|---|---|
| `font-semibold` | 600 | fine — plain classes are scanned |
| **`!font-semibold`** ← what core ships | **400** | **dead** |
| `font-semibold!` (v4 trailing form) | 400 | dead — also never scanned |
| `!font-bold` | 400 | dead |
| `!font-medium` | 400 | dead |
| `!text-[11px]` | 16px | dead |
| `!text-[#0F1722]` | black | dead |
| `!text-[12.5px]` | 12.5px | **works** — that exact literal happens to exist elsewhere in scanned source |

That last row is why this is so hard to spot from the outside: a token can be partially alive. The
transportNY macro popup's first styling attempt named `textSMSemiBold`
(`text-[12.5px] font-semibold`) and the size changed while the weight did not, so the change looked
like it had landed and the remaining problem looked like a design disagreement. Three styling passes
were spent before the mechanism was suspected.

### Blast radius — this is not one theme's problem

`hoverAttr.headerFontStyle` **defaults to `textXS`** when unset
(`SymbologyViewLayer.jsx:2299`), so core ships `!text-[11px] !font-medium` on **every hover popup
label**. Neither class exists. Consequences:

- every hover popup label in every theme renders at whatever the theme's own `hover.label` says,
  not at the token's 11px/500 — the default token has never had any effect under v4;
- any `valueFontStyle` / `headerFontStyle` naming a plain-class token is inert, on every map
  section, in both the page-map and mapeditor copies of the component;
- a theme author following `THEME_EDITING_GUIDE` / the design-system skills has no way to tell —
  the token resolves, the class string is produced, and nothing renders.

## Proposed Changes — candidates, not yet chosen

1. **Stop rewriting the classes.** Let each token carry its own importance; theme tokens already use
   Tailwind v4's trailing `!` where they need to win (`text-[12px]!` is all over `themev2.js`), and
   those ARE scanned because they are written in source. This is the cleanest option but changes
   which class wins for every current consumer, so it needs a sweep of existing `valueFontStyle` /
   `headerFontStyle` usages and of the `hover.label` / `hover.value` theme classes they compete with.
2. **Generate the important variants at build time** — a safelist, or a source comment carrying the
   `!`-prefixed literals so the scanner sees them. Preserves current specificity exactly; costs a
   build-config dependency and has to enumerate the token set.

Either way the outcome should be that a plain-class token works, since that is what every theme and
every skill already writes.

## The workaround in use today (transportNY only)

`src/themes/transportny/themev2.js` — `textXSBoldInk` / `textSMSemiBoldInk`, in **both**
`textSettings` and the `dataCard` mirror:

```js
textXSBoldInk:      `!text-[11px] !font-bold !text-[#0F1722]`,
textSMSemiBoldInk:  `!text-[12.5px] !font-semibold !text-[#0F1722]`,
```

The leading `!` is written **into the token**. The literal then lives in `themev2.js`, which IS
scanned, so Tailwind generates it — and `toImportantClasses` skips any class already starting with
`!`, so nothing is double-prefixed. Verified after the rewrite: `!font-semibold` → 600,
`!font-bold` → 700, `!text-[11px]` → 11px, all previously inert.

Consumer: the MacroView hover popup's emphasised selected-measure row
(`src/themes/transportny/components/macroview/dataUpdate.jsx`), see
`planning/transportny/tasks/current/macroview-hover-roadname-direction.md`.

⚠ **Do not "fix" this by stripping the `!` from the plain `textXS` / `textSM*` rungs.** Those are
shared with Card cells, which apply them **directly** (no `toImportantClasses`), so adding `!` there
would change every card on the site. The two forms have to coexist until core is fixed — which is
the whole argument for fixing core.

## Files Requiring Changes

- `src/dms/packages/dms/src/patterns/page/components/sections/components/ComponentRegistry/map/SymbologyViewLayer.jsx`
  — `toImportantClasses` (~1815) and its three call sites (~2299–2302).
- `src/dms/packages/dms/src/patterns/mapeditor/MapEditor/components/SymbologyViewLayer.jsx`
  — the same helper (~724) and call sites (~1195). Both copies must move together.
- Possibly the Tailwind/Vite config, if option 2 is chosen.

## Testing Checklist

- [ ] Probe harness: append a div per candidate class, assert computed `fontWeight` / `fontSize` /
      `color` — the table above is the regression baseline.
- [ ] A hover column with a **plain-class** `valueFontStyle` visibly changes weight and colour.
- [ ] The `!`-prefixed workaround tokens still work, or are migrated in the same pass (transportNY
      `textXSBoldInk` / `textSMSemiBoldInk` are the only known ones).
- [ ] Default labels (no `headerFontStyle`) do not change appearance unexpectedly once `textXS`
      starts applying — this is the BC risk, because the default has been inert and popups have been
      rendering at the theme's `hover.label` size all along.
- [ ] Both the page-map and mapeditor popups checked.
- [ ] Card cells unaffected (they never went through this helper).
