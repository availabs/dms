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
            disabled: 'opacity-50 pointer-events-none cursor-not-allowed',

            // Trigger / input shell.
            inputWrapper: [
                'relative flex flex-wrap items-center gap-1 w-full min-h-9 rounded-md cursor-pointer',
                'pl-3 pr-7 py-1.5',
                'border border-[var(--t-rule-strong)] hover:border-[var(--t-graphite)]',
                'bg-[var(--t-panel)]',
                'font-sans text-sm text-[var(--t-ink)]',
                'focus-within:ring-1 focus-within:ring-[var(--t-cobalt)] focus-within:border-[var(--t-cobalt)]',
                'transition-colors duration-150',
            ].join(' '),

            // Caret-down chevron, absolutely positioned at the right edge.
            caretWrapper: 'pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2',
            caretIcon: 'w-4 h-4 stroke-[var(--t-graphite)]',

            // Search input inside the open menu.
            input: [
                'block w-full appearance-none rounded-none focus:outline-none',
                'px-3 py-1.5',
                'font-sans text-sm',
                'border-b border-[var(--t-rule)]',
                'bg-[var(--t-panel)] text-[var(--t-ink)] placeholder:text-[var(--t-pencil)]',
            ].join(' '),

            // Status line when displayDetailedValues is false ("N selected").
            statusWrapper: 'flex items-center font-sans text-sm text-[var(--t-graphite)]',

            // Single-select mode (singleSelectOnly=true). The selected value
            // renders as inline text in the trigger — no pill chip, no remove
            // button — mirroring Catalyst Listbox / Select trigger typography.
            singleValue: 'truncate font-sans text-sm text-[var(--t-ink)]',
            singlePlaceholder: 'truncate font-sans text-sm text-[var(--t-pencil)]',

            // Clear × for single-select with allowDeselect — absolutely positioned
            // just left of the caret (which sits at right-0). Glyph reuses
            // removeIconName / removeIconClass.
            singleClearWrapper: 'absolute inset-y-0 right-6 flex items-center cursor-pointer text-zinc-500 hover:text-red-600',

            // Selected-value chip.
            tokenWrapper: [
                'inline-flex items-center gap-x-1 rounded-full px-2 py-0.5',
                'font-mono text-xs font-normal',
                'bg-[var(--t-well)] text-[var(--t-ink)]',
                'border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)]',
                'transition-colors duration-150',
                'whitespace-nowrap',
            ].join(' '),

            // Clickable × button on each chip — styles the wrapper button; the
            // actual glyph is rendered as `<Icon icon={removeIconName} ... />`
            // (see `removeIconName` / `removeIconClass`).
            removeIcon: 'inline-flex items-center self-center cursor-pointer text-[var(--t-pencil)] hover:text-[var(--t-brick)]',
            removeIconName: 'XMark',
            removeIconClass: 'w-3 h-3',

            // Dropdown menu shells. menuWrapper is the floating popup;
            // alwaysOpenMenuWrapper is rendered inline below the input when
            // keepMenuOpen is true; tabularMenuWrapper lays options out as a
            // flat row of pills inline.
            menuWrapper: [
                'isolate min-w-[var(--button-width,12rem)] p-1 rounded-lg',
                'bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)]',
            ].join(' '),
            alwaysOpenMenuWrapper: [
                'w-full p-1 rounded-lg z-20',
                'bg-[var(--t-panel)] border border-[var(--t-rule)]',
            ].join(' '),
            tabularMenuWrapper: [
                'flex flex-row flex-wrap gap-1.5 p-1.5 w-full rounded-lg z-20',
                'bg-[var(--t-panel)] border border-[var(--t-rule)]',
            ].join(' '),

            // Scrollable list of options inside the menu (compact / expanded modes).
            // mt-1 separates it from the search input above.
            optionsWrapper: 'mt-1 max-h-[300px] overflow-auto',

            // A single option row.
            menuItem: [
                'flex items-center gap-2 rounded-md cursor-pointer outline-none',
                'px-2 py-1.5',
                'font-sans text-sm text-[var(--t-ink)]',
                'hover:bg-[var(--t-well)]',
                'transition-colors duration-150',
            ].join(' '),

            // Tabular mode container + per-pill option.
            smartMenuWrapper: 'flex flex-wrap gap-1',
            smartMenuItem: [
                'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-xs font-normal cursor-pointer',
                'bg-[var(--t-well)] text-[var(--t-ink)]',
                'hover:border-[var(--t-rule-strong)] border border-[var(--t-rule)]',
                'transition-colors duration-150',
            ].join(' '),

            // Error / invalid-values display.
            error: 'p-1 font-sans text-xs text-[var(--t-brick)] font-medium',

            // Selected-row check icon shown when displayDetailedValues=false.
            selectedValueIconName: 'Check',
            selectedValueIcon: 'w-4 h-4 text-[var(--t-cobalt)]',
        },
        // A cobalt-accented chip variant — opt in per-column via `activeStyle:
        // 'accent'` on the column config (forwarded through by TableCell.jsx,
        // resolved by MultiSelectView/MultiSelectEdit via getComponentTheme).
        // Only `tokenWrapper` differs; every other key inherits from styles[0].
        // Added for the auth manage pages' Groups column (2026-09-16) — kept
        // here rather than in `authPages.manage` since it's a MultiSelect
        // variant, not page chrome, and any other page can opt into the same
        // accent chip without duplicating it.
        {
            name: 'accent',
            tokenWrapper: [
                'inline-flex items-center gap-x-1 rounded-full px-2 py-0.5',
                'font-mono text-xs font-normal',
                'bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]',
                'border border-[var(--t-cobalt-line)] hover:border-[var(--t-cobalt)]',
                'transition-colors duration-150',
                'whitespace-nowrap',
            ].join(' '),
        },
        // A chromeless trigger — no border, no ring, no panel background —
        // for a MultiSelect used as an ALREADY-SET value editor sitting
        // inline in a row that has its own visual boundary (e.g. Permissions.
        // jsx's per-grant permission-domain pills: "public [View Page] …" —
        // the row itself, not each control in it, should read as the
        // boundary). Only the trigger + caret differ; the dropdown menu
        // itself (menuWrapper/menuItem/etc.) still inherits styles[0]'s
        // normal panel/border look once open (2026-09-20).
        {
            name: 'plain',
            inputWrapper: [
                'relative flex flex-wrap items-center gap-1 w-full min-h-0 rounded-md cursor-pointer',
                'pl-0 pr-5 py-0.5',
                'bg-transparent',
                'font-sans text-sm text-[var(--t-ink)]',
                'transition-colors duration-150',
            ].join(' '),
            singlePlaceholder: 'truncate font-sans text-sm text-[var(--t-pencil)]',
            caretIcon: 'w-3.5 h-3.5 stroke-[var(--t-pencil)]',
        },
        // Small pill-button trigger for Permissions.jsx's "add user access" /
        // "add group access" pickers, matching design_system_v6/pages/
        // admin-pattern-access.html's `<button class="... border ...
        // rounded-md px-2 py-1">add user/group access <chevron></button>`
        // exactly — a self-contained bordered pill (not a full-width input),
        // auto-sized to its own label. One shared style for both pickers
        // (was two — a cobalt-accented 'addUserAccess' and a neutral
        // 'addGroupAccess' — the neutral one was correct per design, so
        // that's the only look now). `caretWrapper` is a plain sibling flex
        // item here (not the default style's absolutely-positioned overlay,
        // which only makes sense inside a `w-full` box) so text+chevron lay
        // out side by side inside ONE bordered `mainWrapper`. `menuWrapper`
        // gets a wider min-width than styles[0]'s 12rem default: the open
        // menu's inline `width` (MultiSelect.jsx's `computeMenuStyle`) is
        // set to the TRIGGER's own bounding width, and this trigger is
        // narrow (`w-fit`, sized to its own short label) — CSS min-width
        // still wins over a smaller inline width, so this is enough to stop
        // long emails/group names from needing horizontal scroll without
        // touching that positioning logic (2026-09-20).
        {
            name: 'addAccess',
            mainWrapper: 'group relative inline-flex items-center gap-1 w-fit h-fit rounded-md border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] px-2 py-1 cursor-pointer transition-colors duration-150',
            inputWrapper: 'relative flex items-center gap-1 w-fit min-h-0 cursor-pointer',
            singlePlaceholder: 't-metaXS text-[var(--t-graphite)] whitespace-nowrap',
            caretWrapper: 'flex items-center',
            caretIcon: 'w-3 h-3 stroke-[var(--t-graphite)]',
            menuWrapper: [
                'isolate min-w-[22rem] p-1 rounded-lg',
                'bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)]',
            ].join(' '),
        },
    ],
};
