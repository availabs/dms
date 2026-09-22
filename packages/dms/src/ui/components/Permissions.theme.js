// v6-token theme for the shared Permissions grants editor (users/groups ×
// permission-domain, inherited-from-parent rows with disable/undo). Flat map
// (no styles[]/activeStyle) — this component has no visual variants, just one
// look, consistent everywhere it's used (page pane, section-menu popup,
// dataset source uacPanel, admin pattern's Access page). Previously this
// component never read the theme registry at all (a local hardcoded
// `permissionsTheme` with raw grays) — registered here like every other
// ported v6 primitive (2026-09-20).
export const permissionsTheme = {
    componentWrapper: 'flex flex-col gap-4',
    selectWrapper: 'flex flex-col gap-2',
    // Label + "add access" picker inline on one row, matching the mockup's
    // small `+ add group/user access` pill button. `<MultiSelect>`'s
    // 'addUserAccess'/'addGroupAccess' styles (MultiSelect.theme.js) size
    // themselves to their own content (`w-fit`) — this wrapper just keeps
    // it from being stretched by the flex row.
    headerRow: 'flex items-center gap-3',
    selectLabel: 't-metaSM text-[var(--t-graphite)]',
    addAccessWrapper: 'w-fit flex-none',
    valueWrapper: 'flex flex-col divide-y divide-[var(--t-rule)]',
    valueWrapperInherited: 'flex flex-col divide-y divide-[var(--t-rule)] bg-[var(--t-well)] rounded-md',
    valueSubWrapper: 'flex items-center gap-2.5 py-2 px-1',
    valueSubWrapperInherited: 'flex flex-col gap-1.5 py-2 px-2.5',
    // `min-w-[25%]` keeps the name column aligned across rows even when a
    // name is short (e.g. "public") — `flex-none` alone sizes purely to
    // content, so short and long names lined up at different widths.
    title: 't-metaMD text-[var(--t-ink)] flex-none min-w-[25%] max-w-[220px] truncate',
    // The permission-domain multiselect (ColumnTypes.multiselect.EditComp)
    // defaults to `w-full` with no width prop of its own — wrapping it here
    // constrains it to the ROW's leftover space instead of the full row
    // width, so name + editor + remove sit on one line instead of each
    // wrapping onto its own (found 2026-09-20). `max-w-[50%]` on top of that
    // stops it from stretching edge-to-edge on wide rows (still `flex-1`, so
    // it grows to fill up to that cap, just never past it — 2026-09-20).
    valueEditorWrapper: 'flex-1 min-w-0 max-w-[50%]',
    disabledLabel: 't-metaXS text-[var(--t-brick)] font-semibold',
    // Icon-only remove button, matching the mockup's Trash icon
    // (`text-pencil hover:text-brick`) instead of a plain "remove" text link.
    removeBtn: 'w-fit p-1 rounded-md text-[var(--t-pencil)] hover:text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] transition-colors duration-150',
    removeIcon: 'w-4 h-4',
}

export default permissionsTheme
