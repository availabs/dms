// Theme for the `multiselect` column type. Mirrors the Catalyst design idiom
// used by `Select` / `Listbox` (inset border ring, soft focus ring, dark mode
// support) so a `multiselect` and a `Select` rendered side-by-side read as the
// same design language.
//
// Shape: matches the `dataCardTheme` convention — `options.activeStyle` selects
// which entry in `styles[]` to use. Site themes can register additional named
// styles and pick a default via `options.activeStyle`. Components accept an
// `activeStyle` prop that wins over `options.activeStyle`.
export const docs = {
    options: [
        { label: 'Option 1', value: 1 },
        { label: 'Option 2', value: 2 },
        { label: 'Option 3', value: 3 },
        { label: 'Option 4', value: 4 },
    ],
    singleSelectOnly: false,
};

export const multiselectTheme = {
    options: {
        activeStyle: 0,
    },
    styles: [
        {
            name: 'default',

            view: 'w-full h-full',
            mainWrapper: 'group relative block w-full h-full',

            // Trigger / input shell. Padding mirrors Catalyst's Listbox button —
            // `calc(theme(spacing.X)-1px)` so the inset border lines up at the
            // pixel grid; `pr-7` reserves space for the absolutely-positioned
            // caret on the right edge.
            inputWrapper: [
                'relative flex flex-wrap items-center gap-1 w-full min-h-11 sm:min-h-9 rounded-lg cursor-pointer',
                'pl-[calc(theme(spacing[3.5])-1px)] pr-[calc(theme(spacing.7)-1px)] sm:pl-[calc(theme(spacing.3)-1px)]',
                'py-[calc(theme(spacing[2.5])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]',
                'border border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10 dark:hover:border-white/20',
                'bg-white dark:bg-white/5',
                'text-base/6 sm:text-sm/6 text-zinc-950 dark:text-white',
                'focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-inset',
                'transition-colors duration-150 ease-in-out',
            ].join(' '),

            // Caret-down chevron, absolutely positioned at the right edge so it
            // sits flush against the trigger boundary (Catalyst pattern). The
            // `pr-2` matches Catalyst Select / Listbox; the icon itself sizes
            // via `size-5 sm:size-4` and uses zinc stroke for low contrast.
            caretWrapper: 'pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2',
            caretIcon: 'size-5 sm:size-4 stroke-zinc-500 dark:stroke-zinc-400',

            // Search input inside the open menu. Matches Catalyst Input padding
            // ramp so it feels like an input, not a cramped text field.
            input: [
                'block w-full appearance-none rounded-md focus:outline-none',
                'px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)]',
                'sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]',
                'text-base/6 sm:text-sm/6',
                'border border-zinc-950/10 hover:border-zinc-950/20 dark:border-white/10',
                'bg-white text-zinc-950 placeholder:text-zinc-500',
                'dark:bg-white/5 dark:text-white',
                'focus:ring-2 focus:ring-blue-500 focus:ring-inset',
            ].join(' '),

            // Status line when displayDetailedValues is false ("N selected").
            statusWrapper: 'flex items-center text-base/6 sm:text-sm/6 text-zinc-700 dark:text-zinc-300',

            // Single-select mode (singleSelectOnly=true). The selected value
            // renders as inline text in the trigger — no pill chip, no remove
            // button — mirroring Catalyst Listbox / Select trigger typography.
            singleValue: 'truncate text-base/6 sm:text-sm/6 text-zinc-950 dark:text-white',
            singlePlaceholder: 'truncate text-base/6 sm:text-sm/6 text-zinc-500 dark:text-zinc-400',

            // Clear × for single-select with allowDeselect — absolutely positioned
            // just left of the caret (which sits at right-0). Glyph reuses
            // removeIconName / removeIconClass.
            singleClearWrapper: 'absolute inset-y-0 right-6 flex items-center cursor-pointer text-zinc-500 hover:text-red-600',

            // Selected-value chip. Catalyst Badge `zinc` color set.
            tokenWrapper: [
                'inline-flex items-center gap-x-1 rounded-md px-1.5 py-0.5',
                'text-sm/5 sm:text-xs/5 font-medium',
                'bg-zinc-600/10 text-zinc-700 hover:bg-zinc-600/20',
                'dark:bg-white/5 dark:text-zinc-300 dark:hover:bg-white/10',
                'transition-colors duration-150 ease-in-out',
                'whitespace-nowrap',
            ].join(' '),

            // Clickable × button on each chip — styles the wrapper button; the
            // actual glyph is rendered as `<Icon icon={removeIconName} ... />`
            // (see `removeIconName` / `removeIconClass`).
            removeIcon: 'inline-flex items-center self-center cursor-pointer text-zinc-500 hover:text-red-600',
            removeIconName: 'XMark',
            removeIconClass: 'size-3.5 sm:size-3',

            // Dropdown menu shells. menuWrapper is the floating popup;
            // alwaysOpenMenuWrapper is rendered inline below the input when
            // keepMenuOpen is true; tabularMenuWrapper lays options out as a
            // flat row of pills inline. p-1 padding matches Catalyst
            // ListboxOptions; the menu items themselves provide the visual
            // breathing room via their own padding.
            menuWrapper: [
                'isolate min-w-[var(--button-width,8rem)] p-1 rounded-xl',
                'bg-white/95 backdrop-blur-xl dark:bg-zinc-800/95',
                'shadow-lg ring-1 ring-zinc-950/10 dark:ring-inset dark:ring-white/10',
            ].join(' '),
            alwaysOpenMenuWrapper: [
                'w-full p-1 rounded-xl z-20',
                'bg-white dark:bg-zinc-800',
                'ring-1 ring-zinc-950/10 dark:ring-inset dark:ring-white/10',
            ].join(' '),
            tabularMenuWrapper: [
                'flex flex-row flex-wrap gap-1.5 p-1.5 w-full rounded-xl z-20',
                'bg-white dark:bg-zinc-800',
                'ring-1 ring-zinc-950/10 dark:ring-inset dark:ring-white/10',
            ].join(' '),

            // Scrollable list of options inside the menu (compact / expanded modes).
            // mt-1 separates it from the search input above.
            optionsWrapper: 'mt-1 max-h-[300px] overflow-auto scrollbar-sm',

            // A single option row. Mirrors Catalyst ListboxOption density:
            // generous top/bottom padding on mobile, tighter on sm.
            menuItem: [
                'flex items-center gap-2 rounded-md cursor-pointer outline-none',
                'pl-2 pr-3.5 py-2.5 sm:pl-1.5 sm:pr-3 sm:py-1.5',
                'text-base/6 sm:text-sm/6 text-zinc-950 dark:text-white',
                'hover:bg-blue-500 hover:text-white',
                'transition-colors duration-100 ease-in-out',
            ].join(' '),

            // Tabular mode container + per-pill option.
            smartMenuWrapper: 'flex flex-wrap gap-1',
            smartMenuItem: [
                'inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium cursor-pointer',
                'bg-blue-500/10 text-blue-700 hover:bg-blue-500/20',
                'dark:bg-blue-500/15 dark:text-blue-300 dark:hover:bg-blue-500/25',
                'transition-colors duration-150 ease-in-out',
            ].join(' '),

            // Error / invalid-values display.
            error: 'p-1 text-xs text-red-700 dark:text-red-400 font-medium',

            // Selected-row check icon shown when displayDetailedValues=false.
            selectedValueIconName: 'CircleCheck',
            selectedValueIcon: 'size-4 text-blue-600 dark:text-blue-400',
        },
    ],
};
