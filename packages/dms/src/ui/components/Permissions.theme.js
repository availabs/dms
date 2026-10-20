// Theme for the shared Permissions grants editor (users/groups × permission-domain, plus
// inherited-from-parent rows with edit / reset / disable / undo). Flat map — one look,
// consistent everywhere it's used: page Permissions pane, section menu, datasets source Admin
// (SourceAccessEditor), admin pattern Access page.
//
// v3 layout (owner 2026-10-06, datasets-page-pattern-v6-port.md Decision 22): a header with
// "+ group" / "+ person"; one card of grants (name line, then permission pills); inherited grants
// collapsed into "Inherited from …" with a count; the keep-yourself-on note. The page pane adds its
// own "who can do what" summary above (passed in as `summary`). No project theme overrides this
// key (checked 2026-10-06), so the re-key below needs no per-project patches.
export const permissionsTheme = {
    componentWrapper: 'flex flex-col gap-3',

    // header: heading + the two add pickers (MultiSelect style 'addAccess')
    headerRow: 'flex items-center gap-2',
    // a UI.FieldLabel named style (2026-10-17, raw-HTML pass): 'permHeading' in FieldLabel.theme.js
    selectLabelStyle: 'permHeading',
    addAccessWrapper: 'w-fit flex-none',

    // the grants card
    grantList: 'border border-[var(--t-rule)] rounded-lg divide-y divide-[var(--t-rule)]',
    grantRow: 'px-3 py-2.5',
    grantHead: 'flex items-center gap-2 min-w-0',
    grantIcon: 'size-3.5 shrink-0 text-[var(--t-pencil)]',
    title: 't-proseSM font-medium text-[var(--t-ink)] flex-1 min-w-0 truncate',
    // the permission pills (ColumnTypes.multiselect.EditComp) sit under the name
    valueEditorWrapper: 'mt-1.5 pl-5 min-w-0',
    // named MultiSelect style for those pills (MultiSelect.theme.js)
    permEditorStyle: 'permissions',
    emptyText: 'px-3 py-3 t-proseXS text-[var(--t-pencil)]',
    removeIcon: 'size-3.5',

    // inherited grants — collapsed by default
    inheritedWrap: 'border border-[var(--t-rule)] rounded-lg',
    inheritedSummary: 'flex items-center gap-2 px-3 py-2.5 cursor-pointer list-none select-none',
    inheritedSummaryLabel: 't-proseSM text-[var(--t-ink)] flex-1',
    inheritedSummaryCount: 't-metaMD text-[11px] text-[var(--t-pencil)]',
    inheritedSummaryIcon: 'size-3.5 text-[var(--t-pencil)]',
    inheritedRow: 'px-3 py-2 border-t border-[var(--t-rule)]',
    inheritedHead: 'flex items-center gap-2 min-w-0',
    inheritedName: 't-proseSM text-[var(--t-graphite)] flex-1 min-w-0 truncate',
    inheritedNameDisabled: 't-proseSM text-[var(--t-pencil)] line-through flex-1 min-w-0 truncate',
    disabledLabel: 't-metaXS text-[var(--t-brick)]',
    overriddenLabel: 't-metaXS text-[var(--t-amber)]',
    // UI.Button named styles (2026-10-17, raw-HTML pass): 'permInherited' / 'permInheritedQuiet' in Button.theme.jsx
    inheritedActionStyle: 'permInherited',
    inheritedActionQuietStyle: 'permInheritedQuiet',

    note: 't-proseXS text-[var(--t-pencil)]',
}

export default permissionsTheme
