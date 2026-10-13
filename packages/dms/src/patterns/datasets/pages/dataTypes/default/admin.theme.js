// Default source Admin tab theme — tessera v6, ported 2026-10-06 from
// src/themes/tessera/design_system_v6/pages/datasets-source-admin.html. Used by
// dataTypes/default/admin.jsx (DAMA + DMS-default), dataTypes/internal/pages/admin.jsx and
// components/SourceAccessEditor.jsx. A site theme overrides via `datasets.admin`; project themes
// keep their pre-v6 look through src/themes/_legacy/datasets.js.
export const adminTheme = {
    // action buttons
    buttonRed: 'w-full h-8 mt-1 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-[var(--t-brick)] t-proseSM text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] cursor-pointer',
    buttonGreen: 'w-full h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer disabled:opacity-40',
    // shared Button (Advanced metadata, external Add version) — passed as className
    actionBtn: 'w-full h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',

    // Admin page layout
    adminWrapper: 'w-full max-w-[1200px] pl-6 lg:pl-12 pr-6 lg:pr-8 py-6',
    adminRow: 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-6 items-start',
    adminMain: 'min-w-0',
    adminSidebar: 'min-w-0',

    // Access card (SourceAccessEditor) — wraps the shared Permissions component
    uacPanel: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4 flex flex-col gap-3',
    uacPanelLabel: 't-proseSM font-medium text-[var(--t-ink)]',
    uacMultiSelect: 'w-1/2',
    uacGrid: 'grid grid-cols-3',
    uacGroupPanel: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4 w-full',

    // Sidebar actions
    sidebarActionsPanel: 'rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-4 flex flex-col gap-2',

    // EditableToggle
    editableToggleRow: 'flex items-start gap-2 py-3 my-1 border-y border-[var(--t-rule)]',
    editableToggleMain: 'flex-1 min-w-0',
    editableToggleLabel: 't-proseSM text-[var(--t-ink)]',
    editableToggleHint: 't-proseXS text-[var(--t-pencil)] mt-0.5',
    editableToggleSavingIcon: 'text-[var(--t-pencil)] size-4 animate-spin',

    // Tasks
    tasksWrapper: 'w-full mt-6 rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] overflow-hidden',
    tasksLabel: 'px-4 py-3 border-b border-[var(--t-rule)] t-proseSM font-medium text-[var(--t-ink)]',

    // icons on the sidebar action buttons ('' → no icon)
    actionIcon: 'size-3.5',
    actionIconMetadata: 'Columns',
    actionIconAdd: 'Add',
    actionIconDelete: 'TrashCan',

    // AddViewBtn (DMS) modal — addVersionTitle '' → the bare input + add button (pre-v6 markup)
    addVersionBody: 'text-left',
    addVersionTitle: 't-displaySM text-[var(--t-ink)]',
    addVersionLabel: 'block mt-3 mb-1 t-metaXS text-[var(--t-pencil)]',
    addVersionHint: 'mt-1 t-proseXS text-[var(--t-pencil)]',
    addVersionInput: 'w-full h-8 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] outline-none focus:border-[var(--t-cobalt)]',
    addVersionError: 'mt-2 t-proseXS text-[var(--t-brick)]',
    addVersionFooter: 'mt-5 flex justify-end gap-2',
    addVersionCancelBtn: 'h-8 inline-flex items-center px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',
    addVersionBtn: 'h-8 inline-flex items-center px-3.5 rounded-md t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] disabled:opacity-40 cursor-pointer',

    // Delete-source modal (components/DeleteSource.jsx — DAMA + DMS; one hard delete, type-name confirm)
    deleteModalBody: 'text-left',
    deleteModalLink: 'text-[var(--t-cobalt)] hover:underline',
    deleteModalTitle: 't-displaySM text-[var(--t-ink)]',
    deleteModalDesc: 'mt-3 flex flex-col gap-2 t-proseSM text-[var(--t-graphite)]',
    deleteModalDescHard: '',
    deleteModalConfirmLabel: 'mt-4 t-proseSM text-[var(--t-graphite)]',
    deleteModalInput: 'mt-2 w-full h-8 px-2.5 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM outline-none focus:border-[var(--t-brick)]',
    deleteModalFooter: 'mt-5 flex flex-row-reverse flex-wrap gap-2',
    deleteModalHardBtn: 'h-8 inline-flex items-center px-3 rounded-md t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-brick)] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed',
    deleteModalCancelBtn: 'h-8 inline-flex items-center px-3 rounded-md border border-[var(--t-rule)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer',

    // Inline text emphasis
    emphasisBold: 'font-medium text-[var(--t-ink)]',
    emphasisBoldDanger: 'font-medium text-[var(--t-brick)]',
    codeInline: 'ml-1 t-metaMD text-[var(--t-ink)] bg-[var(--t-well)] rounded px-1',
    errorText: 'mt-2 t-proseXS text-[var(--t-brick)]',
}
