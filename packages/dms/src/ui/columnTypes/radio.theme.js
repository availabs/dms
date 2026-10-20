// Theme for the radio column type (ui/columnTypes/radio.jsx). Named styles, picked per column by
// its "Column Type Style" (`activeStyle`); styles[0] is today's look, and a named style inherits
// any key it leaves out from styles[0].
//
// Keys (only the first six are in the default; every other key is optional and absent = no change):
//   wrapper, input, label, error     one option's row, its <input>, its text, the invalid-value note
//   listRow, listCol                 the options' container, by the column's `inline` (default true = row)
//   wrapperChecked, labelChecked     added to the checked option
//   marker                           a <span> drawn between input and text; absent = no marker
//   markerChecked                    added to the checked option's marker
//   markers                          { [optionValue]: classes } per-option marker look (e.g. its colour)
//   ordered                          true: options before the checked one are "done", after it "upcoming"
//   wrapperDone, labelDone, markerDone,
//   wrapperUpcoming, labelUpcoming, markerUpcoming
//                                    added in ordered mode; an upcoming marker skips `markers`
//   doneTick                         classes for a tick drawn in a done marker; absent = no tick
//   tag                              classes for the column's `checkedTag` text after the checked option
//   viewAsList                       true: view mode shows the same list, disabled, instead of the bare value
// v6 default (2026-10-15, ui-raw-html-to-ui-components.md; controls.py RADIO): a 16px radio in the ink accent with
// prose text. The pre-v6 plain row is frozen for project themes in src/themes/_legacy/ui.js `radio`.
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';

export const radioTheme = {
    options: { activeStyle: 0 },
    styles: [
        {
            name: 'default',
            wrapper: 'inline-flex items-center gap-2 py-1 pr-4 cursor-pointer',
            input: `size-4 flex-none cursor-pointer accent-[var(--t-ink)] disabled:cursor-default ${FOCUS}`,
            label: 't-proseSM text-[var(--t-ink)]',
            error: 't-proseXS text-[var(--t-brick)]',
            listRow: 'flex flex-row flex-wrap',
            listCol: 'flex flex-col',
        },
    ],
};
