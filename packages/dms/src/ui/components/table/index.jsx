import React, {createContext, useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getComponentTheme, ThemeContext} from '../../useTheme';
import DataTypes from "../../columnTypes"
import Icon from "../Icon";
import {handleMouseUp} from "./utils/mouse";
import {TableRow} from "./components/TableRow";
import {Header} from "./components/TableHeader";
import {VirtualList} from "./components/Virtual";
import {useCopy, usePaste, getLocation} from "./utils/hooks";
import {isEqualColumns, parseIfJson} from "./utils";
import {handleKeyDown} from "./utils/keyboard";
import {cloneDeep} from "lodash-es";

const defaultNumColSize = 0;
const defColSize = 250;
const minColSize = 50;

const windowFake = typeof window === "undefined" ? {} : window;
export const TableCellContext = createContext({});
export const TableStructureContext = createContext({});

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
const updateItemsOnPaste = ({pastedContent, index, attrI, data, visibleAttributes, updateItem, allowEdit, selection}) => {
    const paste = pastedContent?.split('\n').filter(row => row.length).map(row => row.split('\t'));
    if(!paste) return;

    const rows = [...new Set(selection.map(s => s?.index !== undefined ? s.index : s))].sort((a, b) => a - b);
    if(rows.length > paste.length){
        // repeat rows
        const extraRowsInSelection = rows.length - paste.length;
        const repeatCount = (extraRowsInSelection - ( extraRowsInSelection % paste.length )) / paste.length;
        const repeatArray = [];

        for (let i = 0; i < repeatCount; i++) {
            repeatArray.push(...paste);
        }

        paste.push(...repeatArray)
    }

    const rowsToPaste = [...new Array(paste.length).keys()].map(i => index + i).filter(i => i < data.length)

    const columnsToPaste = [...new Array(paste[0].length).keys()]
        .map(i => visibleAttributes[attrI + i]?.allowEditInView || allowEdit ? visibleAttributes[attrI + i]?.name : undefined)
        .filter(i => i);
    const itemsToUpdate = rowsToPaste.map((row, rowI) => {
        let rowData = {...data[row]};

        for(let colI = 0; colI < columnsToPaste.length; colI++){
            const col = columnsToPaste[colI];
            const attr = visibleAttributes[attrI + colI];
            const val = paste[rowI][colI];
            let finalValue = val;

            if(val === '<InvalidValue>'){
                if (['select', 'multiselect'].includes(attr?.type)) {
                    finalValue = [];
                } else if (attr?.type === 'lexical') {
                    finalValue = '';
                } else {
                    finalValue = '';
                }
            }

            if(attr?.type === 'lexical' && finalValue){
                finalValue = parseIfJson(finalValue)
            }

            rowData[col] = finalValue
        }
        return rowData;
    });

    updateItem(undefined, undefined, itemsToUpdate);
}

const AddNew = ({allowAdddNew,
                    numColSize, defaultColumnSize,
                    isDragging, visibleAttrsWithoutOpenOut, startCol, endCol,
    newItem, setNewItem, theme, addItem
}) => {
    if(!allowAdddNew) return null;
    const addNewButtonWidth = 20;

    const attrsToRender = visibleAttrsWithoutOpenOut
        .slice(startCol, endCol + 1);

    const slicedGridTemplateColumns = useMemo(() => {
        const cols = attrsToRender
            .map((v, i) => v.size ?
                `${i === 0 ? (+v.size - addNewButtonWidth) : v.size}px` :
                `${i === 0 ? (defaultNumColSize - addNewButtonWidth) : defaultColumnSize}px`)
            .join(' ')


        return `${numColSize}px ${addNewButtonWidth}px ${cols}`;
    }, [ startCol, endCol, visibleAttrsWithoutOpenOut, numColSize ]);

    return (
        <div
            className={`grid bg-white divide-x divide-y border-slate-50 ${isDragging ? `select-none` : ``} sticky bottom-0 z-[3]`}
            style={{
                gridTemplateColumns: slicedGridTemplateColumns,
                gridColumn: `span ${attrsToRender.length + 3} / ${attrsToRender.length + 3}`
            }}
        >
            <div className={'flex justify-between sticky left-0 z-[3]'} style={{width: numColSize}}>
                <div key={'#'} className={`w-full font-semibold border border-slate-50 bg-gray-50 text-gray-500`}>

                </div>
            </div>

            <div className={'bg-white flex flex-row h-full justify-evenly items-center border-slate-50'}
                 style={{width: `${addNewButtonWidth}px`}}>
                <button
                    className={'w-fit h-fit bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                    onClick={e => {
                        addItem()
                    }}>
                    <Icon icon={'CirclePlus'} className={'text-white'} height={addNewButtonWidth} width={addNewButtonWidth}/>
                </button>
            </div>
            {
                attrsToRender
                    .map((attribute, attrI) => {
                        const Comp = DataTypes[attribute?.type || 'text']?.EditComp || (() => <div></div>);
                        const size = attrI === 0 ? (+attribute.size || defaultNumColSize) - 20 : (+attribute.size || defaultNumColSize)
                        let lexicalTheme = cloneDeep(theme || {});
                        if(attribute.type === 'lexical'){
                            if(!lexicalTheme.lexical) lexicalTheme.lexical = {}
                            lexicalTheme.lexical.editorScroller = "border-0 flex relative outline-0 z-0bh resize-y";
                            lexicalTheme.lexical.editorShell = "w-full h-full font-['Proxima_Nova'] font-[400] text-[1rem] text-slate-700 leading-[22.4px]";
                            lexicalTheme.lexical.editorContainer = "relative block rounded-[10px]";
                        }
                        return (
                            <div
                                key={`add-new-${attrI}`}
                                className={`flex border border-slate-50 p-1 bg-white hover:bg-blue-50 w-full h-full'`}
                                style={{width: size}}
                            >
                                <Comp
                                    key={`${attribute.name}`}
                                    menuPosition={'top'}
                                    className={'p-1 bg-white hover:bg-blue-50 w-full h-full'}
                                    {...attribute}
                                    size={size}
                                    value={newItem[attribute.name]}
                                    placeholder={'+ add new'}
                                    onChange={e => setNewItem({...newItem, [attribute.name]: e})}
                                    onPaste={e => {
                                        e.preventDefault();
                                        e.stopPropagation();

                                        const paste =
                                            (e.clipboardData || window.clipboardData).getData("text")?.split('\n').map(row => row.split('\t'));
                                        const pastedColumns = [...new Array(paste[0].length).keys()].map(i => attrsToRender[attrI + i]).filter(i => i);
                                        const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({
                                            ...acc,
                                            [c]: paste[0][i]
                                        }), {})
                                        setNewItem({...newItem, ...tmpNewItem})

                                    }}
                                    hideControls={attribute.type === 'lexical'}
                                    theme={attribute.type === 'lexical' ? lexicalTheme : undefined}
                                />
                            </div>
                        )
                    })
            }
        </div>
    )
}
const getKey = v => {
    if (v && typeof v === 'object') {
        return v.originalValue ?? v.value;
    }
    return v;
};
export default function ({
    paginationActive, gridRef,
    allowEdit,
    updateItem, removeItem, isEdit,
    numColSize=defaultNumColSize, frozenColClass, frozenCols=[],
    columns=[], data: unFilteredData=[], localFilteredData, fullData, display={}, controls={}, setState, isActive,
    addItem, newItem={}, setNewItem, infiniteScrollFetchData, currentPage, activeStyle
}) {
    const data = localFilteredData || unFilteredData;

    const { theme: themeFromContext = {table: tableTheme}} = React.useContext(ThemeContext) || {};
    const theme = getComponentTheme(themeFromContext,'table', activeStyle);

    const [defaultColumnSize, setDefaultColumnSize] = React.useState(defColSize);

    const structureValues = useMemo(() => {
        const visibleAttributes = columns.filter(c => c.show).map(c => ({...c, size: c.size || defaultColumnSize}));
        const visibleAttrsWithoutOpenOut = visibleAttributes.filter(c => !c.openOut || c.actionType);
        const openOutAttributes = visibleAttributes.filter(c => c.openOut);

        const columnSizes = visibleAttrsWithoutOpenOut.map(v => v.size);

        return {
            visibleAttributes,
            visibleAttrsWithoutOpenOut,
            columnSizes,
            visibleAttrsWithoutOpenOutLength: visibleAttrsWithoutOpenOut.length,
            openOutAttributes,
            showGutters: display.showGutters,
            striped: display.striped,
            hideIfNullOpenouts: display.hideIfNullOpenouts,
        };
    }, [columns, defaultColumnSize, display]);
    const {
        visibleAttributes,
        visibleAttrsWithoutOpenOut,
        visibleAttrsWithoutOpenOutLength,
        openOutAttributes,
        columnSizes
    } = structureValues;

    // =================================================================================================================
    // ======================================= selection variables begin ===============================================
    // =================================================================================================================
    const [isSelecting, setIsSelecting] = useState(false);
    const [editing, setEditing] = useState({}); // {index, attrI}
    const [isDragging, setIsDragging] = useState(false);
    const [selection, setSelection] = useState([]);

    const [triggerSelectionDelete, setTriggerSelectionDelete] = useState(false);
    const startCellRow = useRef(null);
    const startCellCol = useRef(null);
    const selectionRange = useMemo(() => {
        const rows = [...new Set(selection.map(s => s?.index !== undefined ? s.index : s))].sort((a, b) => a - b);
        const cols = [...new Set(selection.map(s => s.attrI).sort((a, b) => a - b) || columns.filter(({show}) => show).map((v, i) => i))];
        return {
            startI: rows[0],
            endI: rows[rows.length - 1],
            startCol: cols[0],
            endCol: cols[cols.length - 1]
        }
    }, [selection]);
    const selectedCols = useMemo(() => selection.map(s => s.attrI), [selection]);
    // ======================================== selection variables end ================================================

    // =================================================================================================================
    // =========================================== copy/paste begin ====================================================
    // =================================================================================================================
    usePaste((pastedContent, e) => {
        if(!allowEdit && !columns.some(c => c.allowEditInView)) return;
        // first cell of selection
        let {index, attrI} = typeof selection[0] === 'number' ? {index: selection[0], attrI: undefined} : selection[0];
        updateItemsOnPaste({pastedContent, e, index, attrI, data, visibleAttributes, allowEdit, selection, updateItem})
    }, windowFake, isActive);

    useCopy(() => {
        return Object.values(
            selection.sort((a, b) => {
                const {index: rowA, attrI: colA} = getLocation(a);
                const {index: rowB, attrI: colB} = getLocation(b);

                return (rowA - rowB) || (colA - colB);
            })
                .reduce((acc, s) => {
                    const {index, attrI} = getLocation(s);
                    const currColName = visibleAttributes[attrI]?.name;
                    const isLexical = visibleAttributes[attrI]?.type === 'lexical';
                    let currData = data[index][currColName]?.originalValue || data[index][currColName] || '<InvalidValue>';
                    if(isLexical && typeof currData === 'object'){
                        currData = JSON.stringify(currData)
                    }
                    acc[index] = acc[index] ? `${acc[index]}\t${currData}` : currData; // join cells of a row
                    return acc;
                }, {})).join('\n') // join rows
    }, windowFake, isActive)
    // ============================================ copy/paste end =====================================================

    useEffect(() => {
        if(!gridRef?.current) return;

        const gridWidth = gridRef?.current?.offsetWidth || 1;
        setDefaultColumnSize(Math.max(50, gridWidth / columns.length) - 5)
    }, [gridRef?.current, columns.length]);

    // =================================================================================================================
    // =========================================== Mouse Controls begin ================================================
    // =================================================================================================================
    const colResizer = (attribute) => (e) => {
        const element = gridRef?.current;
        if(!element) return;

        const column = visibleAttributes.find(va => isEqualColumns(va, attribute));
        const startX = e.clientX;
        const startWidth = column.size || 0;
        const handleMouseMove = (moveEvent) => {
            if(!setState) return;

            const newWidth = Math.max(minColSize, startWidth + moveEvent.clientX - startX);
            setState(draft => {
                const idx = draft.columns.findIndex(column => isEqualColumns(column, attribute));
                draft.columns[idx].size = newWidth;
            })
        };

        const handleMouseUp = () => {
            element.removeEventListener('mousemove', handleMouseMove);
            element.removeEventListener('mouseup', handleMouseUp);
        };

        element.addEventListener('mousemove', handleMouseMove);
        element.addEventListener('mouseup', handleMouseUp);
    };
    // =========================================== Mouse Controls end ==================================================

    // =================================================================================================================
    // =========================================== Keyboard Controls begin =============================================
    // =================================================================================================================

    useEffect(() =>  {
        if(!isActive && selection?.length) {
            setSelection([])
        }
    }, [isActive]);

    useEffect(() => {
        const element = document //gridRef?.current;
        if(!element || !selection?.length || !isActive) {
            return;
        }

        const handleKeyUp = () => {
            if(!editing?.index >= 0){
                setIsSelecting(false)
                setIsDragging(false)
                setTriggerSelectionDelete(false);
            }
        }

        const keyDownListener = e => handleKeyDown({
            e, dataLen: data.length, selection, setSelection, setIsSelecting,
            editing, setEditing, setTriggerSelectionDelete,
            visibleAttributes, pageSize: display.pageSize, setIsDragging
        })

        element.addEventListener('keydown', keyDownListener);
        element.addEventListener('keyup', handleKeyUp);

        return () => {
            element.removeEventListener('keydown', keyDownListener);
            element.removeEventListener('keyup', handleKeyUp);
        };
    }, [selection, editing, data?.length, isActive]);
    // =========================================== Keyboard Controls end ===============================================

    // =================================================================================================================
    // =========================================== Trigger delete begin ================================================
    // =================================================================================================================
    useEffect(() => {
        async function deleteFn() {
            if (triggerSelectionDelete && (allowEdit || columns.some(c => c.allowEditInView))) {
                const selectionRows = data.filter((d, i) => selection.some(s => (s.index ?? s) === i))
                const selectionCols =
                    visibleAttributes
                        .filter((c, i) => (allowEdit || c.allowEditInView) && selection.map(s => s.attrI).includes(i))
                        .map(c => c.name)

                if (selectionCols.length) {
                    // partial selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...selectionCols.reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                } else{
                    // full row selection
                    // this script can be reached by selecting only non deletable columns and pressing delete
                    const deletableCols = visibleAttributes.filter(c => (allowEdit || c.allowEditInView));
                    const allNonDeletableColsSelected = selection.every(s => !allowEdit && !visibleAttributes[s.attrI]?.allowEditInView);

                    if(deletableCols.length && !allNonDeletableColsSelected){
                        // find other ways user can trigger a full row deletion accidentally before allowing it.
                        // since column numbers are not shown, this feature should not be triggered.
                        // safest option is to set another trigger for full row deletion on click, instead of trying to identify it.
                        // updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...deletableCols.reduce((acc, curr) => ({...acc, [curr.name]: ''}), {})})))
                    }
                }
            }
        }

        deleteFn()
    }, [triggerSelectionDelete, allowEdit])
    // ============================================ Trigger delete end =================================================

    const onClickRowNum = useCallback(
        (e, i) => {
            if (!setSelection || !display.showGutters) return;

            if (e.ctrlKey) {
                setSelection(selection =>
                    selection.includes(i)
                        ? selection.filter((v) => v !== i)
                        : [...selection, i]
                );
            } else {
                setSelection([i]);
            }
        },
        [setSelection, display.showGutters]
    );
    // const isRowSelected = useCallback(
    //     (i) => selection?.some((s) => (s.index ?? s) === i),
    //     [selection]
    // );

    const showTotal = (display.showTotal || columns.some(c => c.showTotal)) && !localFilteredData?.length;
    const { rows, totalRow } = useMemo(() => {
        const rows = [];
        let totalRow = {};

        for (const d of data) {
            if(!d.totalRow) rows.push(d);
            if(d.totalRow && showTotal) totalRow = d;
        }

        return { rows, totalRow };
    }, [data, showTotal]);

    const rowTheme = useMemo(() => ({
        totalRow: theme?.totalRow,
        stripedRow: theme?.stripedRow,
        gutterCellWrapper: theme?.gutterCellWrapper,
        gutterCellWrapperNotSelected: theme?.gutterCellWrapperNotSelected,
        gutterCellWrapperSelected: theme?.gutterCellWrapperSelected,
        openOutContainerWrapper: theme?.openOutContainerWrapper,
        openOutContainer: theme?.openOutContainer,
        openOutIconContainer: theme?.openOutIconContainer,
        openOutIconWrapper: theme?.openOutIconWrapper,
        openOutCloseIconContainer: theme?.openOutCloseIconContainer,
        openOutCloseIconWrapper: theme?.openOutCloseIconWrapper,
        openOutCloseIcon: theme?.openOutCloseIcon,
        openOutContainerWrapperBgColor: theme?.openOutContainerWrapperBgColor
    }), [theme]);

    const itemContent = useCallback(
        (index, startCol, endCol, ref) => (
            <TableRow
                rowRef={ref}
                index={index}
                rowData={rows[index]}
                startCol={startCol}
                endCol={endCol}
                theme={rowTheme}
            />
        ),
        [rows, rowTheme]
    );
    const localFilterData = useMemo(() => {
        const dataToReturn = {};

        const columns = visibleAttrsWithoutOpenOut
            .filter(attribute => ['select', 'multiselect', 'radio'].includes(attribute.type))
            .map(attribute => attribute.name);

        (fullData || unFilteredData).forEach(row => {
            columns.forEach(column => {
                const values = Array.isArray(row[column])  ? row[column] : [row[column]];

                values.forEach(v => {
                    if (v == null) return;
                    const key = getKey(v);

                    if (!dataToReturn[column]) { dataToReturn[column] = new Map(); }

                    dataToReturn[column].set(key, v); // uniq by value or originalValue
                });
            })
        })

        return dataToReturn;
    }, [fullData, unFilteredData, visibleAttrsWithoutOpenOut]);

    const components = useMemo(() => ({
        Header: ({start, end}) => (
            <Header tableTheme={theme}
                    visibleAttrsWithoutOpenOut={visibleAttrsWithoutOpenOut}
                    numColSize={numColSize}
                    frozenCols={frozenCols}
                    frozenColClass={frozenColClass}
                    selectedCols={selectedCols}
                    isEdit={isEdit}
                    columns={columns}
                    display={display}
                    controls={controls}
                    setState={setState}
                    colResizer={colResizer}
                    start={start}
                    end={end}
                    localFilterData={localFilterData}
                    activeStyle={activeStyle}
            />
        ),
        Footer: () => paginationActive || rows.length === display.totalLength || !infiniteScrollFetchData ? null : <div>loading...</div>,
        bottomFrozen: ({start, end}) => (
            <>
                {
                    showTotal ? (
                        <TableRow key={'total-row'}
                                  index={'total-row'}
                                  rowData={totalRow}
                                  startCol={start}
                                  endCol={end}
                                  theme={rowTheme}
                                  isTotalRow={true}
                        />
                    ) : null
                }
                <AddNew startCol={start} endCol={end} numColSize={numColSize}
                        visibleAttrsWithoutOpenOut={visibleAttrsWithoutOpenOut}
                        allowAdddNew={display.allowAdddNew}
                        newItem={newItem} setNewItem={setNewItem} isDragging={isDragging} theme={theme}
                        addItem={addItem}
                />
            </>
        )
    }), [
        theme, rowTheme, visibleAttrsWithoutOpenOut,
        numColSize, frozenCols, frozenColClass, selectedCols,
        isEdit, columns, display, controls, setState, colResizer, showTotal, totalRow,
        display.allowAdddNew, isDragging, theme, localFilterData, paginationActive
    ]);

    return (
        <div className={`${theme?.tableContainer} ${!paginationActive && theme?.tableContainerNoPagination}`}
             ref={gridRef}
             onMouseLeave={e => handleMouseUp({setIsDragging})}
        >
                <TableStructureContext.Provider value={structureValues}>
                    <TableCellContext.Provider value={{
                        frozenCols, allowEdit, editing, setEditing, isDragging, isSelecting,
                        setSelection, setIsDragging, startCellCol, startCellRow, selection, selectionRange,
                        updateItem, removeItem, theme, columns, display
                    }}>
                        <VirtualList
                            rowCount={rows.length}
                            columnCount={visibleAttrsWithoutOpenOutLength}
                            columnSizes={columnSizes}
                            increaseViewportBy={{ top: 300, bottom: 300, left: 100, right: 100 }}
                            endReached={() => {
                                if(display.usePagination) return;
                                infiniteScrollFetchData && infiniteScrollFetchData( currentPage + 1 )
                            }}
                            renderItem={itemContent}
                            components={components}
                        />
                    </TableCellContext.Provider>
                </TableStructureContext.Provider>
        </div>
    )
}
