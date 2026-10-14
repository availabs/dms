import { getComponentTheme } from '../../useTheme';

// The list table (2026-10-14, ui-controls.html "List table", ui-control-tables.md): a short read-only
// list in a card — well header band, mono labels, row rules + row hover, no zebra, no cell lines and no
// selection look. Admin / auth / datasets lists use it; an author can pick it for a Spreadsheet section.
const LIST = {
    // contain:inline-size — the list's width comes from its parent, never from its columns' minimum widths
    // (those otherwise widen a min-width:auto flex ancestor: TNY's layout column)
    tableContainer: 'flex flex-col overflow-x-auto min-h-[40px] max-h-[calc(78vh_-_10px)] overflow-y-auto [contain:inline-size]',
    stickyHeader: 'top-0 sticky z-[5] bg-[var(--t-well)]',
    headerCellContainer: 'w-full px-4 py-2 content-center t-metaXS text-[var(--t-pencil)] whitespace-nowrap border-b border-[var(--t-rule)]',
    headerCellContainerBg: 'bg-[var(--t-well)]',
    headerCellContainerBgSelected: 'bg-[var(--t-well)]',
    headerCellBtnActive: '',
    colResizer: 'z-5 -ml-2 w-[1px] hover:w-[2px] bg-transparent hover:bg-[var(--t-rule-strong)]',
    row: 'group/row',
    cell: 'relative flex items-center border-b border-[var(--t-rule)]',
    cellInner: 'w-full min-h-full flex flex-wrap items-center truncate px-4 py-2.5 t-proseSM text-[var(--t-ink)]',
    cellBg: 'bg-[var(--t-panel)] group-hover/row:bg-[var(--t-paper)]',
    cellBgOdd: 'bg-[var(--t-panel)] group-hover/row:bg-[var(--t-paper)]',
    cellBgEven: 'bg-[var(--t-panel)] group-hover/row:bg-[var(--t-paper)]',
    cellBgSelected: 'bg-[var(--t-panel)] group-hover/row:bg-[var(--t-paper)]',
    stripedRow: '',
    emptyRow: 'px-4 py-6 text-center t-proseSM text-[var(--t-pencil)]',   // display.emptyRowMode 'placeholder'
};

export const tableTheme = {
    options: {
        activeStyle: 0
    },
    styles: [
        {
            name: 'default',
            tableContainer: 'flex flex-col overflow-x-auto min-h-[40px] max-h-[calc(78vh_-_10px)] overflow-y-auto',
            tableContainerNoPagination: '',

            headerContainer: 'sticky top-0 grid',
            headerLeftGutter: 'flex justify-between sticky left-0 z-[1]',
            headerWrapper: 'flex justify-between',
            // The sticky header / footer bands of a scrolling table (Virtual.jsx).
            // Opaque so rows cannot show through; dark themes repaint them. Ported
            // from tessera-theme-v6.js's `table` (2026-09-16) — var(--t-*) tokens so
            // this, the library's own base/fallback table, is dark-mode aware like
            // every other Phase-A-ported component instead of hardcoded light grays.
            stickyHeader: 'top-0 sticky z-[5] bg-[var(--t-panel)]',
            stickyBottom: 'bottom-0 sticky z-[5] bg-[var(--t-panel)]',
            headerCellContainer: 'w-full font-mono px-3 py-1 content-center text-[10px] uppercase tracking-[0.08em] text-[var(--t-pencil)]',
            // chosen states are ink (2026-10-14, ui-control-tables.md step 4); pre-v6 cobalt frozen in _legacy/ui.js
            headerCellContainerBgSelected: 'bg-[var(--t-rule)] !text-[var(--t-ink)]',
            headerCellContainerBg: 'bg-[var(--t-well)] text-[var(--t-pencil)]',
            colResizer: "z-5 -ml-2 w-[1px] hover:w-[2px] bg-[var(--t-rule)] hover:bg-[var(--t-rule-strong)]",

            wrapText: 'whitespace-pre-wrap',
            cell: 'relative flex items-center min-h-[35px] border border-[var(--t-rule)]',
            cellInner: `w-full min-h-full flex flex-wrap items-center truncate py-0.5 px-1 font-sans font-[400] text-[14px] leading-[18px] text-[var(--t-graphite)]`,
            cellBgOdd: 'bg-[var(--t-well)] hover:bg-[var(--t-rule)]',
            cellBgEven: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
            cellBg: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
            cellBgSelected: 'bg-[var(--t-rule)] hover:bg-[var(--t-rule)]',
            // the selected range's outline (an inline border colour, so any CSS colour / var)
            selectionColor: 'var(--t-ink)',
            totalCell: 'hover:bg-[var(--t-well)]',
            cellEditableTextBox: 'absolute border border-[var(--t-ink)] bg-[var(--t-panel)] focus:outline-none min-w-[180px] min-h-[50px] z-[10] whitespace-pre-wrap',
            cellFrozenCol: '',
            cellInvalid: 'bg-[var(--t-brick-soft)] hover:bg-[var(--t-brick-soft)]',
            gutterCellWrapper: `flex font-mono text-[10px] items-center justify-center cursor-pointer sticky left-0 z-[1]`,
            gutterCellWrapperNotSelected: 'bg-[var(--t-well)] text-[var(--t-pencil)]',
            gutterCellWrapperSelected: 'bg-[var(--t-rule)] !text-[var(--t-ink)]',

            paginationInfoContainer: '',
            paginationPagesInfo: 'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--t-graphite)]',
            paginationRowsInfo: 'font-mono text-[11px] text-[var(--t-pencil)]',
            paginationContainer: 'w-full p-2 flex items-center justify-between border-t border-[var(--t-rule)]',
            paginationControlsContainer: 'flex flex-row items-center overflow-hidden gap-0.5',
            pageRangeItem: 'cursor-pointer px-3 text-[var(--t-graphite)] py-1 font-mono text-[11px] hover:bg-[var(--t-well)] uppercase tracking-[0.06em] rounded-md',
            pageRangeItemInactive: '',
            pageRangeItemActive: 'bg-[var(--t-ink)] text-[var(--t-paper)]',

            totalRow: 'bg-[var(--t-well)] sticky bottom-0 z-[3] border-t border-[var(--t-rule-strong)]',
            stripedRow: 'even:bg-[var(--t-well)]',
            // empty-table placeholder row (display.emptyRowMode 'placeholder')
            emptyRow: 'border-b border-[var(--t-rule)] p-2 t-proseSM text-[var(--t-pencil)] italic',

            // add-row bar (display.allowAdddNew) and inline add row (emptyRowMode 'inline_add') — was
            // hardcoded white / gray / blue / green markup (2026-10-14, step 5; old strings frozen in _legacy/ui.js)
            addRowGrid: 'bg-[var(--t-panel)] divide-x divide-y divide-[var(--t-rule)]',
            addRowGutterCell: 'w-full border border-[var(--t-rule)] bg-[var(--t-well)]',
            addRowButtonCell: 'bg-[var(--t-panel)] flex flex-row h-full justify-evenly items-center',
            addRowButton: 'w-fit h-fit rounded-md text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer',
            addRowButtonIcon: '',
            addRowCell: 'flex border border-[var(--t-rule)] p-1 bg-[var(--t-panel)] hover:bg-[var(--t-well)] w-full h-full',
            addRowInput: 'p-1 bg-[var(--t-panel)] hover:bg-[var(--t-well)] w-full h-full',
            inlineAddGrid: 'divide-x divide-y divide-[var(--t-rule)]',
            inlineAddGutter: 'bg-[var(--t-well)] border border-[var(--t-rule)] flex items-center justify-center',
            inlineAddSave: 'flex items-center justify-center text-[var(--t-go)] hover:text-[var(--t-ink)] cursor-pointer',
            inlineAddSaveFloating: 'absolute top-1/2 right-2 -translate-y-1/2 z-10 bg-[var(--t-ink)] hover:opacity-90 text-[var(--t-paper)] rounded text-xs px-1.5 py-0.5 shadow cursor-pointer',

            // actions column (RenderActions.jsx): url / delete buttons and the ⋯ menu
            actionLinkBtn: 'flex items-center w-fit px-1.5 py-0.5 mx-0.5 rounded-md border border-[var(--t-rule-strong)] bg-[var(--t-panel)] text-[var(--t-ink)] t-metaXS hover:bg-[var(--t-well)]',
            actionDeleteBtn: 'w-fit p-0.5 mx-0.5 rounded-md text-[var(--t-pencil)] hover:text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] cursor-pointer',
            actionBtnIcon: '',
            actionsMenuTrigger: 'flex items-center justify-center w-full h-full cursor-pointer',
            actionsMenuTriggerIcon: 'text-[var(--t-pencil)] hover:text-[var(--t-ink)] size-4',
            actionsMenu: 'flex flex-col bg-[var(--t-panel)] border border-[var(--t-rule)] shadow-[var(--t-shadow-drag)] rounded-md p-1 min-w-[100px]',
            actionsMenuItem: 'flex items-center gap-2 px-2 py-1.5 t-proseSM text-[var(--t-ink)] hover:bg-[var(--t-well)] rounded cursor-pointer whitespace-nowrap',
            actionsMenuItemDanger: 'flex items-center gap-2 px-2 py-1.5 t-proseSM text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] rounded cursor-pointer whitespace-nowrap w-full text-left',
            // Neutral default accent applied to a whole row by the `conditional_row_style`
            // Spreadsheet provider (left edge + faint tint). A brand theme overrides this by
            // defining its own `styleKey` (e.g. `rowAccentAmber`) and pointing the provider at it.
            rowAccent: 'border-l-4 border-[var(--t-pencil)] bg-[var(--t-well)]',
            // Default accent for the `row_highlight` provider's 'accent' style (the active
            // master-detail row, e.g. a click-to-switch selector). Its cells go transparent
            // (TableCell) so this tint + left edge shows.
            rowHighlightAccent: 'bg-[var(--t-well)] shadow-[inset_3px_0_0_var(--t-ink)]',

            openOutContainer: 'w-[330px] overflow-auto scrollbar-sm flex flex-col gap-[12px] p-[16px] bg-[var(--t-panel)] h-full float-right border-l border-[var(--t-rule)]',
            openOutContainerWrapper: 'fixed inset-0 right-0 h-full w-full z-[100]',
            openOutHeader: 'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--t-graphite)]',
            openOutCloseIconContainer: 'w-full flex justify-end',
            openOutCloseIconWrapper: 'w-fit h-fit p-[8px] text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-full cursor-pointer hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]',
            openOutCloseIcon: 'XMark',
            openOutContainerWrapperBgColor: 'var(--t-scrim)',
            openOutIconWrapper: 'px-2 cursor-pointer bg-transparent text-[var(--t-pencil)] hover:text-[var(--t-graphite)]',
            openOutBelowRow: false,
            openOutHideTitle: false,

            // Inline openOut (display.openOutMode === 'inline'): the detail renders as a
            // full-width panel inserted directly beneath the clicked row (pushing rows down)
            // instead of the floating right-side drawer. Neutral library defaults — a brand
            // theme overrides these keys to restyle the panel. Same openOut fields as the
            // drawer (label + value), reusing TableCell's extraction.
            openOutInlineRow: 'w-full bg-[var(--t-well)] border-y border-[var(--t-rule)]',
            openOutInlinePanel: 'grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 p-4',
            openOutInlineField: 'flex flex-col gap-0.5',
            openOutInlineLabel: 'font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--t-pencil)]',
            openOutInlineValue: 'font-sans text-sm text-[var(--t-ink)]',

            pivotGroupHeader: 'bg-[var(--t-well)] text-[var(--t-graphite)] text-center border-b border-r border-[var(--t-rule)]',

            headerCellWrapper: 'relative w-full',
            headerCellBtn: 'group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md cursor-pointer',
            headerCellLabel: 'truncate select-none',
            headerCellBtnActive: 'bg-[var(--t-rule)]',
            headerCellFnIconClass: 'text-[var(--t-pencil)]',
            headerCellCountIcon: 'TallyMark',
            headerCellListIcon: 'LeftToRightListBullet',
            headerCellSumIcon: 'Sum',
            headerCellAvgIcon: 'Avg',
            headerCellGroupIcon: 'Group',
            headerCellSortAscIcon: 'SortAsc',
            headerCellSortDescIcon: 'SortDesc',
            headerCellMenuIcon: 'ChevronDown',
            headerCellMenuIconClass: 'text-[var(--t-pencil)] group-hover:text-[var(--t-graphite)] transition ease-in-out duration-200 print:hidden',
            headerCellIconWrapper: 'flex items-center',
            headerCellMenu: 'py-0.5 flex flex-col gap-0.5 items-center px-1 font-mono text-[11px] text-[var(--t-graphite)] max-h-[500px] min-w-[180px] ' +
                'z-[10] overflow-auto scrollbar-sm bg-[var(--t-panel)] divide-y divide-[var(--t-rule)] rounded-md shadow-[var(--t-shadow-drag)] border border-[var(--t-rule)]',
            headerCellControlWrapper: 'w-full group px-2 py-1 flex justify-between items-center rounded-md hover:bg-[var(--t-well)]',
            headerCellControlLabel: 'w-fit font-mono text-[11px] text-[var(--t-pencil)] cursor-default',
            headerCellControl: 'p-0.5 w-full rounded-md bg-[var(--t-panel)] group-hover:bg-[var(--t-well)] cursor-pointer'
        },
        // 'roomy' and 'rules' were the admin / auth lists' looks; since 2026-10-14 they are the list
        // table. Kept (not deleted) so a stored style index after them doesn't move.
        { name: 'roomy', ...LIST },
        { name: 'rules', ...LIST },
        {
            name: 'below-row',
            // The list table, with openOut opening inline below the row instead of a fixed
            // right-side drawer (admin Pages tree). All other keys inherit from styles[0].
            ...LIST,
            openOutContainer: 'w-full flex flex-col bg-[var(--t-panel)]',
            openOutContainerWrapper: 'w-full',
            openOutContainerWrapperBgColor: 'transparent',
            openOutHeader: 'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--t-graphite)]',
            openOutCloseIconContainer: 'hidden',
            openOutCloseIconWrapper: '',
            openOutCloseIcon: 'XMark',
            openOutIconWrapper: 'hidden',
            openOutBelowRow: true,
            openOutHideTitle: true,
        },
        { name: 'list', ...LIST },
    ]
}

// used in theme editor
export const tableSettings = (theme) => {
  const activeStyle = theme?.table?.options?.activeStyle || 0;
  // getComponentTheme resolves the active style (inheriting from styles[0]) and
  // always returns {} rather than undefined, so the key listing below is crash-safe
  // even when the selected theme has no table styles.
  const styleKeys = Object.keys(getComponentTheme(theme, 'table', activeStyle));
  return [
    {
        label: "Layout Group Styles",
        type: 'inline',
        controls: [
            {
                label: 'Style',
                type: 'MultiSelect',
                singleSelectOnly: true,
                searchable: false,
                options: (theme?.table?.styles || [{}])
                    .map((k, i) => ({ label: k?.name || i, value: i })),
                path: `table.options.activeStyle`,
            },
            {
                label: 'Add Style',
                type: 'Button',
                children: <div>Add Style</div>,
                onClick: (e, setState) => {
                    setState(draft => {
                        draft.table.styles.push({ ...draft.table.styles[0], name: 'new style', })

                    })
                }
            },
            {
                label: 'Remove Style',
                type: 'Button',
                children: <div>Remove Style</div>,
                //disabled:
                onClick: (e, setState) => {
                    setState(draft => {
                        if (draft.table.styles.length > 1) {
                            draft.table.styles.splice(activeStyle, 1)
                            draft.table.options.activeStyle = 0
                        }
                    })
                }
                //path: `sidenav.styles[${activeStyle}].outerWrapper`,
            },
        ]
    },
    {
        label: "Table",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => !k.includes('Wrapper') && !k.startsWith('cell') && !k.includes('Cell') &&
                    !k.startsWith('openOut') && !k.startsWith('headerCell') && !k.startsWith('pagination') && !k.startsWith('pageRange') &&
                    !k.includes('Row'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Wrappers",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => k.includes('Wrapper'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Header Cell (Control)",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => k.startsWith('headerCell'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Cell",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => (k.startsWith('cell') || k.includes('Cell')) && !k.startsWith('headerCell'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Row",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => k.includes('Row'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Open out",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => k.startsWith('openOut'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Pagination",
        type: 'inline',
        controls: [
            ...styleKeys
                .filter(k => k.startsWith('pagination') || k.startsWith('pageRange'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${activeStyle}].${k}`
                    }
                })
        ]
    },
  ];
};

export const docs = {
    columns: [
        { "name": "first_name", "display_name": "First Name", "show": true, "type": "text" },
        { "name": "last_name", "display_name": "Last Name", "show": true, "type": "text" },
        { "name": "email", "display_name": "Email Address", "show": true, "type": "text" },
        { "name": "city", "display_name": "City", "show": true, "type": "text" }
    ],
    data: [
        {
            "first_name": "Alice",
            "last_name": "Johnson",
            "email": "alice.johnson@example.com",
            "city": "New York"
        },
        {
            "first_name": "Bob",
            "last_name": "Smith",
            "email": "bob.smith@example.com",
            "city": "Los Angeles"
        },
        {
            "first_name": "Carol",
            "last_name": "Davis",
            "email": "carol.davis@example.com",
            "city": "Chicago"
        },
        {
            "first_name": "David",
            "last_name": "Brown",
            "email": "david.brown@example.com",
            "city": "Houston"
        }
    ]
}
