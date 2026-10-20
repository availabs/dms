// The page editor's drawer panes, v3 — Settings, Filters, Section groups (extras), Pages, History
// (pages/edit/editPane/*.jsx). tessera v6, 2026-10-08, from
// src/themes/tessera/design_system_v6/pages/page-edit.html (Settings) + page-edit-panes.html.
// Same data and actions as the pre-v3 panes; presentation only, plus the approved additions (page
// find + status marks, history filter + day groups). No accent colour.
//
// Each pane renders its v3 layout only when its gate key (settingsWrap, filtersWrap, pagesWrap,
// historyWrap, groupMeta) is set. src/themes/_legacy/pages.js sets them to '' for every
// project theme, so those keep the pre-v3 panes.
// Controls follow the shared v6 looks (2026-10-13, ui-control-consistency-audit.md; spec
// design_system_v6/pages/ui-controls.html): fields 32px with a rule-strong hairline and ink focus;
// buttons = UI.Button action / primary; inputs UI.Input (2026-10-16: no raw controls left in the panes).
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';
const EYEBROW = 't-metaXS text-[var(--t-pencil)]';

export const editPanesTheme = {
    // shared bits
    eyebrow: EYEBROW,
    intro: 't-proseSM text-[var(--t-graphite)] mt-3 mb-3',
    icon: 'size-3.5',

    // ── Settings ── (gate: settingsWrap)
    settingsWrap: 'flex flex-col w-full',
    identity: 'pt-1 pb-4',
    identityRow: 'flex items-start gap-3',
    iconTileIcon: 'size-5',
    identityBody: 'flex-1 min-w-0',
    statusRow: 'flex items-center gap-2 min-w-0',
    statusDraft: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-amber)] bg-[var(--t-amber-soft)] rounded px-1.5 py-0.5',
    statusPublished: 'inline-flex items-center gap-1 t-metaXS text-[var(--t-go)] bg-[var(--t-go-soft)] rounded px-1.5 py-0.5',
    statusDot: 'size-1.5 rounded-full bg-current',
    parentPath: 't-metaXS text-[var(--t-pencil)] truncate',
    slugRow: 'flex items-center gap-1.5 mt-1 min-w-0',
    slug: 't-metaMD text-[11px] text-[var(--t-pencil)] truncate',
    slugOld: 't-metaMD text-[11px] text-[var(--t-pencil)] line-through truncate',
    slugNew: 't-metaMD text-[11px] text-[var(--t-ink)] truncate',
    renameRow: 'flex gap-1.5 mt-2',
    description: 'mt-3',
    iconPicker: 'mt-2 p-2 border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)] shadow-[var(--t-shadow-drag)]',
    iconGrid: 'grid grid-cols-8 gap-1 max-h-48 overflow-y-auto scrollbar-xs',
    // the icon search field: a UI.Input 'search' with its leading icon (2026-10-16, raw-HTML swap)
    iconSearchWrap: 'relative mb-2',
    searchFieldIcon: 'absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[var(--t-pencil)] pointer-events-none z-10',
    iconNoneWrap: 'mt-2 flex justify-center',   // the 'no icon' UI.Button linkProse
    // collapsible sections: title · closed-state summary · chevron
    sect: 'border-t border-[var(--t-rule)]',
    sectSummary: 'flex items-center gap-2 py-3 cursor-pointer list-none select-none',
    sectTitle: 't-proseSM font-medium text-[var(--t-ink)]',
    sectValue: 'flex-1 min-w-0 truncate text-right t-metaMD text-[11px] text-[var(--t-pencil)]',
    sectChevron: 'size-3.5 text-[var(--t-pencil)] transition-transform',
    sectBody: 'pb-4 flex flex-col gap-3',
    line: 'flex items-center gap-3 min-h-8',
    lineLabel: 'flex-1 min-w-0',
    lineText: 'block t-proseSM text-[var(--t-graphite)]',
    lineHint: 'block t-proseXS text-[var(--t-pencil)]',
    hint: 't-proseXS text-[var(--t-pencil)] mt-1.5',
    code: 't-metaMD text-[11px]',
    // layout choices drawn as tiny pages
    thumbs: 'flex gap-2',
    // a layout thumb is a UI.Button 'bare' (2026-10-16): the cell takes the row's flex-1, the inner span lays out frame + label
    thumbCell: 'flex-1 min-w-0 flex flex-col',
    thumbInner: 'flex flex-col items-center gap-1.5',
    thumbFrame: 'w-full h-12 rounded-md border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] bg-[var(--t-panel)] p-1.5 flex gap-1',
    thumbFrameActive: 'w-full h-12 rounded-md border border-[var(--t-ink)] ring-1 ring-[var(--t-ink)] bg-[var(--t-panel)] p-1.5 flex gap-1',
    thumbNav: 'w-2.5 h-full bg-[var(--t-rule-strong)] opacity-70 rounded-sm',
    thumbRail: 'w-3.5 h-full bg-[var(--t-graphite)] opacity-40 rounded-sm',
    thumbBody: 'flex-1 flex flex-col gap-1',
    thumbLine: 'h-1 w-full bg-[var(--t-rule-strong)] opacity-60 rounded-sm',
    thumbHead: 'h-1.5 w-4/5 bg-[var(--t-rule-strong)] rounded-sm',
    thumbLabel: 't-proseXS text-[var(--t-graphite)]',
    thumbLabelActive: 't-proseXS font-medium text-[var(--t-ink)]',
    select: 'min-w-[130px]',
    templateMsg: 't-proseXS text-[var(--t-amber)] flex-1',
    templateOk: 't-proseXS text-[var(--t-go)] flex-1',
    templateErr: 't-proseXS text-[var(--t-brick)] flex-1',

    // ── Filters ── (gate: filtersWrap)
    filtersWrap: 'flex flex-col w-full pb-4',
    filterList: 'border border-[var(--t-rule)] rounded-lg overflow-hidden',
    filterRow: 'border-t border-[var(--t-rule)] first:border-t-0',
    filterSummaryCell: 'flex flex-col',   // holds the summary row's UI.Button 'bare' at full width (2026-10-16)
    filterSummary: 'w-full flex items-center gap-2 px-3 py-2.5 text-left',   // the row inside that button
    filterKey: 't-metaMD text-[var(--t-ink)] truncate',
    filterChip: 'inline-flex items-center gap-1 h-[18px] t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded px-1.5 whitespace-nowrap',   // marker (2026-10-13)
    filterValue: 'flex-1 min-w-0 truncate text-right t-metaMD text-[12px] text-[var(--t-graphite)]',
    filterBody: 'px-3 pb-3 pt-3 flex flex-col gap-2.5 bg-[var(--t-well)] border-t border-[var(--t-rule)]',
    filterRemoveWrap: 'self-end',   // 'remove filter' = UI.Button linkMetaDanger
    filterEmpty: 'border border-dashed border-[var(--t-rule-strong)] rounded-lg px-4 py-6 text-center t-proseSM text-[var(--t-graphite)]',
    filterAddWrap: 'mt-2 self-start',   // 'add filter' = UI.Button linkProse
    filterAddForm: 'mt-2 border border-[var(--t-ink)] rounded-lg p-3 flex flex-col gap-2',
    filterClearWrap: 'mt-3 self-start',   // 'remove all filters' = UI.Button linkMetaDanger
    field: 'block',
    grid2: 'grid grid-cols-2 gap-2',
    autoVars: 'mt-4 pt-3 border-t border-[var(--t-rule)] flex flex-col gap-1',
    autoVarsTitle: 't-proseXS font-medium text-[var(--t-graphite)]',
    autoVarRow: 'grid grid-cols-3 gap-1 t-proseXS text-[var(--t-graphite)]',

    // ── Section groups ── (gate: groupMeta — extras on top of pages.sectionGroupsPane)
    groupMeta: 'flex items-center gap-1 shrink-0',
    groupFlag: 'size-5 rounded inline-flex items-center justify-center text-[var(--t-graphite)] bg-[var(--t-well)]',
    groupFlagIcon: 'size-3',
    groupTheme: 't-metaXS text-[var(--t-pencil)] border border-[var(--t-rule)] rounded px-1',
    groupCount: 't-metaMD text-[11px] text-[var(--t-pencil)]',
    sectionHidden: 'size-3 text-[var(--t-amber)] shrink-0',

    // ── Pages ── (gate: pagesWrap)
    pagesWrap: 'flex flex-col w-full pb-4',
    pagesBar: 'flex items-center gap-2 mt-1 mb-2',
    pagesFind: 'relative flex-1 min-w-0',   // holds the UI.Input 'search' + its icon (searchFieldIcon), 2026-10-16
    pagesTree: 'max-w-full',
    pagesTreeList: 'pt-1',
    pagesTreeStyle: 'indent',             // nestableInHouse style: sub-pages indented, no left rule
    pageRow: 'group/p flex items-center gap-1 pr-1 py-1 rounded-md hover:bg-[var(--t-well)]',
    pageRowActive: 'group/p flex items-center gap-1 pr-1 py-1 rounded-md bg-[var(--t-well)]',
    pageLink: 'flex-1 min-w-0 truncate t-proseSM text-[var(--t-ink)]',
    pageLinkActive: 'flex-1 min-w-0 truncate t-proseSM font-medium text-[var(--t-ink)]',
    pageCaretIcon: 'size-3.5',
    pageCaretSpacer: 'w-5 shrink-0',
    pageMarks: 'flex items-center gap-1.5',
    pageMarkDraft: 'size-1.5 rounded-full bg-[var(--t-amber)]',
    pageMarkIcon: 'size-3 text-[var(--t-pencil)]',
    pageMenuBtn: `size-6 rounded inline-flex items-center justify-center text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-panel)] opacity-0 group-hover/p:opacity-100 focus-visible:opacity-100 cursor-pointer ${FOCUS}`,
    pageMenuIcon: 'size-3.5',
    pagesLegend: 'flex flex-wrap items-center gap-x-3 gap-y-1 t-proseXS text-[var(--t-pencil)] mt-3',
    pagesLegendItem: 'inline-flex items-center gap-1',
    pagesNoMatch: 'px-2 py-3 t-proseSM text-[var(--t-pencil)]',
    pageIndent: 14,                       // px per level
    // row actions: rename dialog (delete uses UI.DeleteModal)
    // the rename dialog's body inside UI.Modal (its positioner centres text)
    modalBody: 'text-left',
    modalTitle: 't-displaySM text-[var(--t-ink)] mb-3',
    modalActions: 'flex justify-end gap-2 mt-5',

    // ── History ── (gate: historyWrap)
    historyWrap: 'flex flex-col w-full pb-4',
    composer: 'mt-1 border border-[var(--t-rule)] rounded-lg focus-within:border-[var(--t-ink)]',
    composerBar: 'flex items-center gap-2 px-2 pb-2',
    composerHint: 't-proseXS text-[var(--t-pencil)] flex-1',
    historyFilter: 'mt-3',
    historyDay: `${EYEBROW} mt-4 mb-2`,
    historyList: 'relative',
    historyLine: 'absolute left-[9.5px] top-1 bottom-4 w-px bg-[var(--t-rule)]',
    historyEntry: 'relative flex gap-3 pb-4',
    historyDotWrap: 'relative z-[1] w-5 flex justify-center pt-0.5 shrink-0',
    historyDot: 'size-2 mt-1 rounded-full bg-[var(--t-panel)] ring-1 ring-[var(--t-rule-strong)]',
    historyDotComment: 'size-5 rounded-full bg-[var(--t-well)] text-[var(--t-graphite)] flex items-center justify-center',
    historyDotPublish: 'size-5 rounded-full bg-[var(--t-go)] text-[var(--t-paper)] flex items-center justify-center',
    historyDotCreate: 'size-5 rounded-full bg-[var(--t-well)] text-[var(--t-graphite)] flex items-center justify-center',
    historyDotIcon: 'size-3',
    historyText: 't-proseXS text-[var(--t-graphite)]',
    historyWho: 'font-medium text-[var(--t-ink)]',
    historyWhen: 'text-[var(--t-pencil)]',
    historyComment: 'mt-1.5 t-proseSM text-[var(--t-ink)] bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-md px-2.5 py-1.5 break-words',
    historyEmpty: 'mt-4 t-proseSM text-[var(--t-pencil)]',
}
