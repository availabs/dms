// Theme for the checkbox column type (ui/columnTypes/checkbox.jsx, 2026-10-15). Named styles, picked per column by
// its "Column Type Style" (`activeStyle`); a named style inherits any key it leaves out from styles[0]. Like the
// radio column type, the look comes only from here: a `className` from the host (e.g. the table cell) is ignored.
//   input     the <input type=checkbox> (edit and view)
//   wrapper   the view's container around the disabled checkbox
// v6 (controls.py CHECK): 16px, ink when checked. Project themes keep the pre-theme look (src/themes/_legacy/ui.js).
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';

export const checkboxTheme = {
    options: { activeStyle: 0 },
    styles: [
        {
            name: 'default',
            input: `size-4 rounded-sm cursor-pointer accent-[var(--t-ink)] disabled:cursor-default ${FOCUS}`,
            wrapper: 'flex items-center',
        },
    ],
};
