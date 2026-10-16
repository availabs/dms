// Default source Admin tab theme — tessera v6, ported 2026-10-06 from
// src/themes/tessera/design_system_v6/pages/datasets-source-admin.html. Used by
// dataTypes/default/admin.jsx (DAMA + DMS-default), dataTypes/internal/pages/admin.jsx and
// components/SourceAccessEditor.jsx. A site theme overrides via `datasets.admin`; project themes
// keep their pre-v6 look through src/themes/_legacy/datasets.js.
export const adminTheme = {
    // action buttons
    deleteBtnWrap: 'mt-1',          // Delete Source (UI.Button dangerFull)

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
    addVersionLabelWrap: 'mt-3',    // the UI.FieldLabel's top spacing
    addVersionHint: 'mt-1 t-proseXS text-[var(--t-pencil)]',
    addVersionError: 'mt-2 t-proseXS text-[var(--t-brick)]',
    addVersionFooter: 'mt-5 flex justify-end gap-2',

    // Delete-source modal (components/DeleteSource.jsx — DAMA + DMS; one hard delete, type-name confirm)
    deleteModalBody: 'text-left',
    deleteModalLink: 'text-[var(--t-cobalt)] hover:underline',
    deleteModalTitle: 't-displaySM text-[var(--t-ink)]',
    deleteModalDesc: 'mt-3 flex flex-col gap-2 t-proseSM text-[var(--t-graphite)]',
    deleteModalDescHard: '',
    deleteModalConfirmLabel: 'mt-4 t-proseSM text-[var(--t-graphite)]',
    deleteModalInputWrap: 'mt-2',   // the UI.Input's spacing (it fills its container)
    deleteModalFooter: 'mt-5 flex flex-row-reverse flex-wrap gap-2',

    // Inline text emphasis
    emphasisBold: 'font-medium text-[var(--t-ink)]',
    emphasisBoldDanger: 'font-medium text-[var(--t-brick)]',
    codeInline: 'ml-1 t-metaMD text-[var(--t-ink)] bg-[var(--t-well)] rounded px-1',
    errorText: 'mt-2 t-proseXS text-[var(--t-brick)]',
}
