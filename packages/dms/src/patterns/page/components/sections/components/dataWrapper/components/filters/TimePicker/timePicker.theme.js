// Theme for the TimePicker editor used by `op: 'time'` filter leaves.
// Pattern-tied — registered into page/defaultTheme.js so site themes can
// override individual keys via theme.timePicker.<key>.
export const timePickerTheme = {
    // top-level container
    wrapper: 'flex flex-col gap-2 p-2 bg-white border border-slate-200 rounded-md shadow-sm text-xs',
    sectionDivider: 'border-t border-slate-100 pt-2',

    // section headers
    presetsLabel: 'block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1',
    rowHeader: 'flex items-center justify-between',
    rowLabel: 'text-xs font-medium text-slate-600',
    rowSummary: 'text-xs text-slate-500',
    rowEditor: 'flex flex-wrap items-center gap-1 text-xs',

    // PresetBar
    presetWrapper: 'flex flex-wrap gap-1',
    presetButton: 'px-2 py-1 text-xs rounded-md border cursor-pointer transition-colors',
    presetButtonActive: 'bg-blue-600 text-white border-blue-600',
    presetButtonIdle: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',

    // RangeRow
    rangeContainer: 'flex flex-col gap-1.5',
    rangeSelect: 'px-1.5 py-1 rounded border border-slate-300 bg-white',
    rangeNumberInput: 'w-16 px-1.5 py-1 rounded border border-slate-300 bg-white',
    rangeClearButton: 'ml-1 px-1.5 py-1 text-slate-400 hover:text-slate-700 cursor-pointer',
    rangeCustomButton: 'self-start px-2 py-1 text-xs rounded-md border border-dashed border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer',

    // DowRow / preset toggle
    dowContainer: 'flex flex-col gap-1.5',
    dowPresetButton: 'px-2 py-1 rounded-md border cursor-pointer',
    dowPresetActive: 'bg-blue-600 text-white border-blue-600',
    dowPresetIdle: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
    dowDayGrid: 'flex items-center gap-0.5 ml-2',
    dowDayButton: 'w-7 h-7 text-xs rounded-md border cursor-pointer',
    dowDayActive: 'bg-blue-600 text-white border-blue-600',
    dowDayIdle: 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50',

    // TimeOfDayRow
    todContainer: 'flex flex-col gap-1.5',
    todInput: 'px-1.5 py-1 rounded border border-slate-300 bg-white',
    todSeparator: 'text-slate-500',
    todWarning: 'text-[11px] text-amber-700',

    // InstantRow
    instantContainer: 'flex flex-col gap-1.5',
    instantSwitchOn: 'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer bg-blue-600',
    instantSwitchOff: 'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-pointer bg-slate-300',
    instantSwitchKnobOn: 'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform translate-x-5',
    instantSwitchKnobOff: 'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform translate-x-1',
    instantSelect: 'px-1.5 py-1 rounded border border-slate-300 bg-white',
    instantHelpText: 'text-[11px] text-amber-700',
    instantHintLabel: 'text-slate-500',

    // Chips
    chipWrapper: 'flex flex-wrap items-center gap-1 text-xs',
    chip: 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-blue-300 bg-blue-50 text-blue-700',
    chipIcon: 'text-[11px]',
    chipRemoveButton: 'ml-0.5 text-blue-400 hover:text-blue-700 cursor-pointer',

    // Exposure footer (author-mode only)
    exposureFooter: 'flex flex-wrap items-center gap-2 text-[11px] text-slate-600',
    exposureLabel: 'font-medium uppercase tracking-wide text-slate-500',
    exposureToggle: 'inline-flex items-center gap-1 cursor-pointer',
};
