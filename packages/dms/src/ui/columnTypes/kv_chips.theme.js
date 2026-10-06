// Theme for the kv_chips column type (ui/columnTypes/kv_chips.jsx). Named styles, picked per column
// by its "Column Type Style" (`activeStyle`).
//   wrapper   the row of chips
//   chip      one chip
//   key       a chip's label (absent for an unlabeled entry)
//   value     a chip's value
//   empty     the column's `emptyText`, shown when there are no entries
export const kvChipsTheme = {
    options: { activeStyle: 0 },
    styles: [
        {
            name: 'default',
            wrapper: 'flex flex-wrap gap-1.5',
            chip: 'inline-flex items-center gap-1.5 rounded-md bg-[var(--t-well)] border border-[var(--t-rule)] px-2 py-0.5 t-metaSM normal-case tracking-normal text-[var(--t-graphite)]',
            key: 'text-[var(--t-pencil)]',
            value: 'break-all',
            empty: 't-proseSM text-[var(--t-pencil)]',
        },
    ],
};
