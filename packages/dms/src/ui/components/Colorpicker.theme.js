// UI.ColorPicker / ColorPickerFlat (Colorpicker.jsx) — v6 2026-10-17, ui-primitives-default-theme.md. Spec:
// design_system_v6/pages/ui-controls.html#color-picker (owner-approved): the section menu's border-colour grid — 24px
// swatches, eight to a row, a rule edge so pale colours read, the chosen one ink-ringed — and a mono hex readout.
// The swatches are UI.Button named styles (`swatchStyle` / `swatchOnStyle`, Button.theme.jsx swatch / swatchOn); the
// fill is always the colour itself (inline). Pre-v6 strings are frozen for project themes in src/themes/_legacy/ui.js.
// Sizes the drag maths depends on (the 214px width, the 150px / 100px square heights, the cursor offsets) stay in code.
const HUE = 'bg-[linear-gradient(_to_right,_rgb(255,_0,_0),_rgb(255,_255,_0),_rgb(0,_255,_0),_rgb(0,_255,_255),_rgb(0,_0,_255),_rgb(255,_0,_255),_rgb(255,_0,_0)_)]';

export const colorPickerTheme = {
  options: { activeStyle: 0 },
  styles: [{
    name: 'default',
    // ColorPicker — the popup form (its box is the caller's)
    wrapper: 'flex flex-col gap-3 p-3 bg-[var(--t-panel)]',
    swatches: 'grid grid-cols-8 gap-1',
    swatchStyle: 'swatch',
    swatchOnStyle: 'swatchOn',
    // the full picker (showColorPicker): saturation square, hue bar, sample
    saturation: 'relative w-full h-[150px] rounded-md border border-[var(--t-rule)] select-none',
    saturationCursor: 'absolute w-[20px] h-[20px] border-2 border-white rounded-full shadow-[var(--t-shadow-lift)] box-border -translate-x-[10px] -translate-y-[10px]',
    hue: `relative w-full h-3 rounded-full select-none ${HUE}`,
    hueCursor: 'absolute w-[20px] h-[20px] border-2 border-white rounded-full shadow-[var(--t-shadow-lift)] box-border -translate-x-[10px] -translate-y-[4px]',
    sample: 'w-full h-5 rounded border border-[var(--t-rule)]',
    // ColorPickerFlat — the inline (menu) form
    flatWrapper: 'px-2 py-1.5',
    flatHeader: 'flex items-center gap-2 mb-2',
    flatCurrent: 'w-5 h-5 rounded border border-[var(--t-rule)] flex-none',
    flatHex: 't-metaMD text-[var(--t-graphite)]',
    flatSwatches: 'grid grid-cols-8 gap-1',
    flatSwatchStyle: 'swatch',
    flatSwatchOnStyle: 'swatchOn',
    flatFull: 'mt-3 flex flex-col gap-3',
    flatSaturation: 'relative w-full rounded-md border border-[var(--t-rule)] select-none',   // height: 100 inline (the drag maths)
  }],
};

export default colorPickerTheme;
