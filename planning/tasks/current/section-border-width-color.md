# Section border — per-side width + theme color

**Objective:** Let a page **section** (sectionArray) render a border with a configurable **width**
and **color (from the theme palette)** at the section level — so a section can show, e.g., an amber
`border-l-4` accent panel. Replaces the per-cell `cellBorderColor` hack (which stitches a segmented,
ugly "border" out of individual cells). Requested for the mny Action Prioritize lede panel.

**Backward-compatible.** Sections that don't set width/color must render byte-identical to today.

## Current behavior (read first)

- `patterns/page/components/sections/sectionArray.jsx`
  - `resolveBorder(v.border, theme)` (~line 20-29): if `v.border` is an object `{top,right,bottom,left:boolean}`,
    it joins `theme.borderSides[side]` classes (each is a literal `border-{side} border-[#E0EBF0]`, i.e.
    fixed **1px, color #E0EBF0**). A legacy string key (`'full'`, `'openLeft'`, …) maps via `theme.border[key]`.
  - The section wrapper className is composed at ~line 76: `resolveBorder(...) + resolveRadius(...) + resolveBg(...)`.
    The wrapper element currently takes **className only** (no inline `style`).
- `patterns/page/components/sections/sectionArray.theme.jsx`
  - `borderSides` (~63): `{ top:'border-t border-[#E0EBF0]', right:…, bottom:…, left:'border-l border-[#E0EBF0]' }`.
- `patterns/page/components/sections/sectionMenu.jsx`
  - The **Border** control (~1326-1353): renders the 4 side toggles; `toggle(side)` writes
    `border: { ...cur, [side]: true|undefined }`.
- `patterns/page/components/sections/components/ComponentRegistry/sharedControls/ColorControls.jsx`
  - `ColorControls({ value, setValue, title, colors })` — renders a `ColorPicker` over `colors || defaultColorOptions`.
    Passing a `colors` array makes it a themed swatch picker.

## Change

**Tailwind note:** arbitrary runtime widths/colors can't be JIT classes (`border-[#EAAD43]` from a picker
isn't in the build). So apply width+color via **inline style** on the section wrapper, not classes.

1. **`border` config gains optional `width` (number px) + `color` (hex string).** New shape:
   `{ top?, right?, bottom?, left?: boolean, width?: number, color?: string }`.
2. **`sectionArray.jsx`:**
   - Add a `resolveBorderStyle(v.border)` returning an inline-style object **only when** `width` or `color`
     is set: for each toggled side set `border{Side}Width: '<width||1>px'` + `border{Side}Style: 'solid'`,
     and `borderColor: '<color||#E0EBF0>'`. Return `{}` otherwise.
   - When `width`/`color` are set, **do not** also emit the `borderSides` classes for those sides (avoid a
     double 1px border) — the inline style fully draws the border. When they're absent, keep the current
     class path unchanged (BC).
   - Merge the returned style into the section wrapper's `style` prop (add one if the wrapper has none).
3. **`sectionMenu.jsx` Border control:** below the side toggles add:
   - **Width** — a small stepper/select over `[1,2,3,4,6,8]` writing `border.width`.
   - **Color** — a `ColorControls` (import from sharedControls) seeded with the **theme color palette**
     (`colors={<theme swatches>}`) writing `border.color`. Source the palette the same way other themed
     color pickers in this file/menu do; if none is readily available, pass the theme's brand colors
     (fall back to `ColorControls` default). "From theme colors" is the requirement — a curated swatch list.
4. **BC:** legacy string presets (`'full'`, `'openLeft'`, …) and boolean-only side borders render identically.
   Only the presence of `width`/`color` switches a section to the inline-style path.

## Files
- `src/dms/packages/dms/src/patterns/page/components/sections/sectionArray.jsx` (resolveBorder + wrapper `style`)
- `src/dms/packages/dms/src/patterns/page/components/sections/sectionMenu.jsx` (Border control: width + color inputs)
- (maybe) `sectionArray.theme.jsx` — only if a swatch palette constant belongs there

## Constraints
- Fast-Refresh: `.jsx` files export components only (per `packages/dms/CLAUDE.md`); keep any constants/palette
  in a `.js`/`.theme` sibling if needed.
- No new hardcoded Tailwind in markup; the border is dynamic inline style (values), which is fine.
- Verify: a section with `border:{left:true,width:4,color:'#EAAD43'}` → 4px amber left border, nothing else;
  a section with `border:{top:true,bottom:true}` (no width/color) → unchanged 1px #E0EBF0 top+bottom.

## Acceptance
- [x] `border.width` + `border.color` render via inline style at the section level (per toggled side).
- [x] Existing sections (boolean sides / legacy string) unchanged.
- [x] Section-menu Border control exposes width + a theme-color picker (swatches from `theme.pages.sectionArray.borderColors`).
- [x] BC: no other page's sections change.

## Done (2026-07-16)
Built by subagent; verified on the mny Action Prioritize lede (section 2262775, `border:{left:true,
width:4,color:'#EAAD43'}`) on the :5199 dev server — renders one clean continuous amber left accent
(replacing the per-cell `cellBorderColor` hack). Files: `sectionArray.jsx` (`resolveBorder` guard +
`resolveBorderStyle` inline-style, merged onto the section's card box), `sectionArray.theme.jsx`
(`borderWidths` [1,2,3,4,6,8] + `borderColors` swatch palette), `sectionMenu.jsx` (Border control:
width stepper + `ColorControls` seeded with the theme palette). Config shape:
`border:{left:true,width:4,color:'#EAAD43'}`. BC confirmed (boolean-only / legacy-string paths untouched).
