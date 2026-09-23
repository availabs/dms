import { getComponentTheme } from '../../useTheme';

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
            headerCellContainerBgSelected: 'bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]',
            headerCellContainerBg: 'bg-[var(--t-well)] text-[var(--t-pencil)]',
            colResizer: "z-5 -ml-2 w-[1px] hover:w-[2px] bg-[var(--t-rule)] hover:bg-[var(--t-rule-strong)]",

            wrapText: 'whitespace-pre-wrap',
            cell: 'relative flex items-center min-h-[35px] border border-[var(--t-rule)]',
            cellInner: `w-full min-h-full flex flex-wrap items-center truncate py-0.5 px-1 font-sans font-[400] text-[14px] leading-[18px] text-[var(--t-graphite)]`,
            cellBgOdd: 'bg-[var(--t-well)] hover:bg-[var(--t-rule)]',
            cellBgEven: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
            cellBg: 'bg-[var(--t-panel)] hover:bg-[var(--t-well)]',
            cellBgSelected: 'bg-[var(--t-cobalt-soft)] hover:bg-[var(--t-cobalt-soft)]',
            totalCell: 'hover:bg-[var(--t-well)]',
            cellEditableTextBox: 'absolute border border-[var(--t-cobalt)] bg-[var(--t-panel)] focus:outline-none min-w-[180px] min-h-[50px] z-[10] whitespace-pre-wrap',
            cellFrozenCol: '',
            cellInvalid: 'bg-[var(--t-brick-soft)] hover:bg-[var(--t-brick-soft)]',
            gutterCellWrapper: `flex font-mono text-[10px] items-center justify-center cursor-pointer sticky left-0 z-[1]`,
            gutterCellWrapperNotSelected: 'bg-[var(--t-well)] text-[var(--t-pencil)]',
            gutterCellWrapperSelected: 'bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]',

            paginationInfoContainer: '',
            paginationPagesInfo: 'font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--t-graphite)]',
            paginationRowsInfo: 'font-mono text-[11px] text-[var(--t-pencil)]',
            paginationContainer: 'w-full p-2 flex items-center justify-between border-t border-[var(--t-rule)]',
            paginationControlsContainer: 'flex flex-row items-center overflow-hidden gap-0.5',
            pageRangeItem: 'cursor-pointer px-3 text-[var(--t-graphite)] py-1 font-mono text-[11px] hover:bg-[var(--t-well)] uppercase tracking-[0.06em] rounded-md',
            pageRangeItemInactive: '',
            pageRangeItemActive: 'bg-[var(--t-cobalt-soft)] text-[var(--t-cobalt)]',

            totalRow: 'bg-[var(--t-well)] sticky bottom-0 z-[3] border-t border-[var(--t-rule-strong)]',
            stripedRow: 'even:bg-[var(--t-well)]',
            // Neutral default accent applied to a whole row by the `conditional_row_style`
            // Spreadsheet provider (left edge + faint tint). A brand theme overrides this by
            // defining its own `styleKey` (e.g. `rowAccentAmber`) and pointing the provider at it.
            rowAccent: 'border-l-4 border-[var(--t-pencil)] bg-[var(--t-well)]',
            // Default accent for the `row_highlight` provider's 'accent' style (the active
            // master-detail row, e.g. a click-to-switch selector). Its cells go transparent
            // (TableCell) so this tint + left edge shows.
            rowHighlightAccent: 'bg-[var(--t-cobalt-soft)] shadow-[inset_3px_0_0_var(--t-cobalt)]',

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
            headerCellBtnActive: 'bg-[var(--t-cobalt-soft)]',
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
        {
            // A roomier cell style — opt in per-`<Table>` via `activeStyle="roomy"`
            // (forwarded straight through by TableCell.jsx like any other
            // activeStyle). Only `cell`/`cellInner` differ; every other key
            // inherits from styles[0]. Matches the tessera design-system
            // mockups' own table density (`px-3 py-2.5`, e.g.
            // design_system_v6/pages/admin-users.html), which is roomier than
            // this base/fallback table's compact default (`py-0.5 px-1`) —
            // added for the auth manage pages' Users/Groups tables
            // (2026-09-17) rather than changing the shared default, since that
            // default is used by every table across the whole app.
            // Horizontal rules only, 0.5px each side (1px seam between rows).
            name: 'roomy',
            cell: 'relative flex items-center min-h-[42px] border-x-0 border-y-[0.5px] border-[var(--t-rule)]',
            cellInner: 'w-full min-h-full flex flex-wrap items-center truncate px-3 py-2.5 font-sans font-[400] text-[14px] leading-[18px] text-[var(--t-graphite)]',
        },
        {
            // The default density with horizontal rules only — admin Themes list.
            name: 'rules',
            cell: 'relative flex items-center min-h-[35px] border-x-0 border-y-[0.5px] border-[var(--t-rule)]',
        },
        {
            name: 'below-row',
            // openOut opens inline below the row instead of a fixed right-side drawer.
            // Horizontal rules only, 0.5px each side so stacked rows meet at a 1px seam.
            // All other keys inherit from styles[0].
            cell: 'relative flex items-center min-h-[35px] border-x-0 border-y-[0.5px] border-[var(--t-rule)]',
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
        }
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
