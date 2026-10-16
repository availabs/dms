// Theme for the TimePicker editor used by `op: 'time'` filter leaves.
// Pattern-tied — registered into page/defaultTheme.js (as `pages.timePicker`; the components read the top-level
// `timePicker` key — a known path mismatch, left as is). v6 (2026-10-16, ui-raw-html-to-ui-components.md), from the
// approved spec block design_system_v6/pages/ui-controls.html#time-filter (controls.py TP_*). The controls are UI
// components picking their look by named style (chip / chipOn, segment / segmentOn, small, iconInline,
// iconInlineDanger, Input compact, UI.Select, UI.Switch, Pill tag, ColumnTypes.checkbox rowLabel); these keys are
// the panel's layout and text. Project themes keep the pre-v6 slate layout via src/themes/_legacy/ui.js `timePicker`.
export const timePickerTheme = {
    // the panel: a stack of sections, each separated by a rule
    wrapper: 'w-full max-w-[360px] flex flex-col bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg',
    firstSection: 'flex flex-col gap-2 px-3 py-3',
    sectionDivider: 'flex flex-col gap-2 px-3 py-3 border-t border-[var(--t-rule)] first:border-t-0',

    // row heading: caption (not a <label>: a row has no single control) + the current value on the right
    presetsLabel: 't-metaXS text-[var(--t-pencil)]',
    rowHeader: 'flex items-baseline justify-between gap-2 min-w-0',
    rowLabel: 't-metaXS text-[var(--t-pencil)]',
    rowSummary: 't-proseXS text-[var(--t-graphite)] truncate',
    rowSummaryAny: 't-proseXS text-[var(--t-pencil)]',      // "Any" / "Off"
    rowEditor: 'flex flex-wrap items-center gap-1.5',
    clearIcon: 'size-3.5',                                  // the XMark in each row's clear (iconInline)

    // PresetBar
    presetWrapper: 'flex flex-wrap items-center gap-1.5',

    // RangeRow
    rangeContainer: 'flex flex-col gap-2',
    rangeDirWrap: 'w-20 flex-none',                         // Last / Next (UI.Select)
    rangeNumberWrap: 'w-16 flex-none',                      // count (Input compact)
    rangeUnitWrap: 'w-24 flex-none',                        // unit (UI.Select)
    customIcon: 'size-3',                                   // the Plus in "Custom relative range" (small)

    // DowRow: the seven days are one segmented control
    dowContainer: 'flex flex-col gap-2',
    dowDayGrid: 'inline-flex p-0.5 gap-0.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-well)]',

    // TimeOfDayRow
    todContainer: 'flex flex-col gap-2',
    todInputWrap: 'w-32 flex-none',                         // w-32: a 12-hour "06:00 AM" clipped at w-28
    todSeparator: 't-metaXS text-[var(--t-pencil)] px-0.5',
    todWarning: 't-proseXS text-[var(--t-amber)]',

    // InstantRow
    instantContainer: 'flex flex-col gap-2',
    instantHintLabel: 't-metaXS text-[var(--t-pencil)] pl-1',
    instantSelectWrap: 'flex-1 min-w-0',
    instantHelpText: 't-proseXS text-[var(--t-pencil)]',

    // Chips: the active constraints as Pill 'tag's
    chipsLabel: 't-metaXS text-[var(--t-pencil)]',          // '' → no "Active" caption
    chipWrapper: 'flex flex-wrap gap-1.5',
    chipIcon: 'w-3.5 h-3.5 text-[var(--t-pencil)] flex-none',
    chipRemoveIcon: 'size-3',
    // icon names per axis (UI.Icon; '' → none). The library icon set has no calendar icon — a theme whose
    // Icons carry one (e.g. tessera's 'Calendar') can set dowChipIcon.
    rangeChipIcon: 'ClockIcon',
    dowChipIcon: '',
    todChipIcon: 'ClockIcon',

    // Exposure footer (author mode only)
    exposureFooter: 'flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 border-t border-[var(--t-rule)] bg-[var(--t-well)] rounded-b-lg',
    exposureLabel: 't-metaXS text-[var(--t-pencil)]',
};
