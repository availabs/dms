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
export const radioTheme = {
    options: { activeStyle: 0 },
    styles: [
        {
            name: 'default',
            wrapper: 'p-1 flex',
            input: 'self-center p-1',
            label: 'text-sm font-light p-1 self-center',
            error: 'text-xs text-red-700 font-bold',
            listRow: 'flex flex-row',
            listCol: 'flex flex-col',
        },
    ],
};
