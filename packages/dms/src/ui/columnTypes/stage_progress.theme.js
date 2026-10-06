// Theme for the stage_progress column type (ui/columnTypes/stage_progress.jsx). Named styles, picked
// per column by its "Column Type Style" (`activeStyle`).
//
// styles[0] is empty on purpose: a style without `variant: 'meter'` renders the original node bar
// (20px dots, per-stage colours from the column's `stageHex`), unchanged.
//
// Meter keys (`variant: 'meter'`): one small segment per stage, filled up to the current one.
//   meter              the whole cell
//   segments           the row of segments
//   segment            every segment
//   segmentDone        a filled segment (before and at the current stage)
//   segmentCurrent     added to the current stage's segment (optional)
//   segmentUpcoming    a segment after the current stage
//   segmentColors      { [stage]: classes } a filled segment's own fill, in place of segmentDone (optional)
//   label              the current stage's name; absent = not shown
//   count              "4 of 6"; absent = not shown
// The column's `showLabel: false` hides the label and the count.
export const stageProgressTheme = {
    options: { activeStyle: 0 },
    styles: [
        { name: 'default' },
        {
            name: 'meter',
            variant: 'meter',
            meter: 'inline-flex items-center gap-2',
            segments: 'inline-flex gap-[3px]',
            segment: 'block w-3 h-1.5 rounded-[1px]',
            segmentDone: 'bg-[var(--t-cobalt)]',
            segmentUpcoming: 'bg-[var(--t-rule)]',
            label: 'font-sans text-xs font-medium text-[var(--t-ink)]',
            count: 'font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--t-pencil)]',
        },
    ],
};
