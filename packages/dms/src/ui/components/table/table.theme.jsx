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
            headerCellContainer: 'w-full font-semibold px-3 py-1 content-center text-sm font-semibold text-gray-600',
            headerCellContainerBgSelected: 'bg-blue-100 text-gray-900',
            headerCellContainerBg: 'bg-gray-50 text-gray-500',
            colResizer: "z-5 -ml-2 w-[1px] hover:w-[2px] bg-gray-200 hover:bg-gray-400",

            wrapText: 'whitespace-pre-wrap',
            cell: 'relative flex items-center min-h-[35px]  border border-slate-50',
            cellInner: `w-full min-h-full flex flex-wrap items-center truncate py-0.5 px-1 font-[400] text-[14px]  leading-[18px] text-slate-600`,
            cellBgOdd: 'bg-gray-50 hover:bg-gray-100',
            cellBgEven: 'bg-white hover:bg-gray-100',
            cellBg: 'bg-white hover:bg-gray-100',
            cellBgSelected: 'bg-blue-50 hover:bg-blue-100',
            totalCell: 'hover:bg-gray-150',
            cellEditableTextBox: 'absolute border focus:outline-none min-w-[180px] min-h-[50px] z-[10] whitespace-pre-wrap',
            cellFrozenCol: '',
            cellInvalid: 'bg-red-50 hover:bg-red-100',
            gutterCellWrapper: `flex text-xs items-center justify-center cursor-pointer sticky left-0 z-[1]`,
            gutterCellWrapperNotSelected: 'bg-gray-50 text-gray-500',
            gutterCellWrapperSelected: 'bg-blue-100 text-gray-900',

            paginationInfoContainer: '',
            paginationPagesInfo: 'font-[500] text-[12px] uppercase text-[#2d3e4c] leading-[18px]',
            paginationRowsInfo: 'text-xs',
            paginationContainer: 'w-full p-2 flex items-center justify-between',
            paginationControlsContainer: 'flex flex-row items-center overflow-hidden gap-0.5',
            pageRangeItem: 'cursor-pointer px-3  text-[#2D3E4C] py-1  text-[12px] hover:bg-slate-50 font-[500] rounded  uppercase leading-[18px]',
            pageRangeItemInactive: '',
            pageRangeItemActive: 'bg-slate-100 ',

            totalRow: 'bg-gray-100 sticky bottom-0 z-[3]',
            stripedRow: 'even:bg-gray-50',

            openOutContainer: 'w-[330px] overflow-auto scrollbar-sm flex flex-col gap-[12px] p-[16px] bg-white h-full float-right',
            openOutContainerWrapper: 'fixed inset-0 right-0 h-full w-full z-[100]',
            openOutHeader: 'font-semibold text-gray-600',
            openOutCloseIconContainer: 'w-full flex justify-end',
            openOutCloseIconWrapper: 'w-fit h-fit p-[8px] text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer',
            openOutCloseIcon: 'XMark',
            openOutContainerWrapperBgColor: '#00000066',
            openOutIconWrapper: 'px-2 cursor-pointer bg-transparent text-gray-500 hover:text-gray-600',

            headerCellWrapper: 'relative w-full',
            headerCellBtn: 'group inline-flex items-center w-full justify-between gap-x-1.5 rounded-md cursor-pointer',
            headerCellLabel: 'truncate select-none',
            headerCellBtnActive: 'bg-gray-300',
            headerCellFnIconClass: 'text-gray-400',
            headerCellCountIcon: 'TallyMark',
            headerCellListIcon: 'LeftToRightListBullet',
            headerCellSumIcon: 'Sum',
            headerCellAvgIcon: 'Avg',
            headerCellGroupIcon: 'Group',
            headerCellSortAscIcon: 'SortAsc',
            headerCellSortDescIcon: 'SortDesc',
            headerCellMenuIcon: 'ArrowDown',
            headerCellMenuIconClass: 'text-gray-400 group-hover:text-gray-600 transition ease-in-out duration-200 print:hidden',
            headerCellIconWrapper: 'flex items-center',
            headerCellMenu: 'py-0.5 flex flex-col gap-0.5 items-center px-1 text-xs text-gray-600 font-regular max-h-[500px] min-w-[180px] ' +
                'z-[10] overflow-auto scrollbar-sm bg-white divide-y divide-gray-100 rounded-md shadow-lg ring-1 ring-black ring-opacity-5',
            headerCellControlWrapper: 'w-full group px-2 py-1 flex justify-between items-center rounded-md hover:bg-gray-100',
            headerCellControlLabel: 'w-fit font-regular text-gray-500 cursor-default',
            headerCellControl: 'p-0.5 w-full rounded-md bg-white group-hover:bg-gray-100 cursor-pointer'
        }
    ]
}

// used in theme editor
export const tableSettings = (theme) => [
    {
        label: "Layout Group Styles",
        type: 'inline',
        controls: [
            {
                label: 'Style',
                type: 'Select',
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
                            draft.table.styles.splice(theme.table.options.activeStyle, 1)
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
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => !k.includes('Wrapper') && !k.startsWith('cell') && !k.includes('Cell') &&
                    !k.startsWith('openOut') && !k.startsWith('headerCell') && !k.startsWith('pagination') && !k.startsWith('pageRange') &&
                    !k.includes('Row'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Wrappers",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => k.includes('Wrapper'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Header Cell (Control)",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => k.startsWith('headerCell'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Cell",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => (k.startsWith('cell') || k.includes('Cell')) && !k.startsWith('headerCell'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Row",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => k.includes('Row'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Open out",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => k.startsWith('openOut'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Pagination",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.table?.styles?.[theme?.table?.options?.activeStyle || 0] )
                .filter(k => k.startsWith('pagination') || k.startsWith('pageRange'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `table.styles[${theme?.table?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
];

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
