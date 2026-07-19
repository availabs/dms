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
import {tableTheme} from "./table.theme";

const defaultNumColSize = 0;
const VIRTUAL_VIEWPORT_INCREASE = { top: 300, bottom: 300, left: 100, right: 100 };
const defColSize = 250;
const minColSize = 120;

// The table is a CSS grid, so `grid-template-columns` must declare a width per
// column. A column with an explicit author `size` (set in the toolbar or pinned by
// a drag-resize) gets a FIXED `${size}px` track; a column with no explicit size gets
// a `minmax(${default}px, 1fr)` track so it stretches to share leftover width while
// never shrinking below the default. This lets fixed and elastic columns coexist and
// the grid fill its container instead of leaving empty space. Returns the column
// augmented with `_hasFixedSize` (tells the cell whether to pin its width) and
// `_track` (the grid-template token). `size` stays defaulted for existing consumers.
const augmentColSizing = (c, defaultColumnSize, forceFixed = false) => {
    const sizeSet = c.size !== undefined && c.size !== null && c.size !== '' && !isNaN(+c.size);
    // `stretch:true` keeps the column's size as a *minimum* but lets it grow to
    // share leftover width (`minmax(size, 1fr)`) — e.g. the 12 month cells of a
    // heat grid filling the card. Without it a sized column is a rigid `${size}px`.
    const hasFixed = forceFixed || (sizeSet && !c.stretch);
    const size = sizeSet ? +c.size : defaultColumnSize;
    return {
        ...c,
        size,
        _hasFixedSize: hasFixed,
        _track: hasFixed ? `${size}px` : `minmax(${size}px, 1fr)`,
    };
};

const windowFake = typeof window === "undefined" ? {} : window;
export const TableCellContext = createContext({});
export const TableStructureContext = createContext({});


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
        .slice(startCol, endCol + 1)
        .filter(attr => !attr._isActionsColumn);

    const slicedGridTemplateColumns = useMemo(() => {
        // i===0 carries the add-new button, so its track is the column width minus the
        // button (kept fixed-px for a definite button slot); the rest use the shared
        // `_track` so the add-new row aligns with the body's fixed/flex columns.
        const cols = attrsToRender
            .map((v, i) => i === 0 ? `${(+v.size || defaultColumnSize) - addNewButtonWidth}px` : v._track)
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
                                style={{width: attrI === 0 ? size : (attribute._hasFixedSize ? attribute.size : undefined)}}
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

// Shown when emptyRowMode === 'placeholder' and data is empty.
const PlaceholderRow = ({ rowRef }) => (
    <div ref={rowRef} className="border-b border-slate-100 p-2 text-sm text-gray-400 italic">
        No data
    </div>
);

// Shown when emptyRowMode === 'inline_add'. Looks like a normal data row but
// cells are editable inputs bound to newItem. Enter commits via addItem().
// All columns get EditComp (same as AddNew) — allowEditInView only governs
// editing existing rows, not entering a new one. Paste is handled at the cell
// level so the global usePaste handler does not double-fire (see inlineAddRef).
const InlineAddRow = ({ rowRef, containerRef, numColSize, defaultColumnSize, visibleAttrsWithoutOpenOut, startCol, endCol, newItem, setNewItem, addItem, theme }) => {
    const attrsToRender = visibleAttrsWithoutOpenOut
        .slice(startCol, endCol + 1)
        .filter(attr => !attr._isActionsColumn);

    const gridTemplateColumns = useMemo(() => {
        const cols = attrsToRender.map(c => c._track || `${c.size || defaultColumnSize}px`).join(' ');
        return `${numColSize}px ${cols}`;
    }, [startCol, endCol, visibleAttrsWithoutOpenOut, numColSize, defaultColumnSize]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addItem?.();
        }
    };

    return (
        <div ref={rowRef} className="relative">
            <div
                ref={containerRef}
                className="grid divide-x divide-y border-slate-50"
                style={{ gridTemplateColumns, gridColumn: `span ${attrsToRender.length + 2} / ${attrsToRender.length + 2}` }}
                onKeyDown={handleKeyDown}
            >
                <div
                    className="bg-gray-50 border border-slate-50 flex items-center justify-center"
                    style={{ width: numColSize }}
                >
                    {numColSize > 0 && (
                        <button
                            className="flex items-center justify-center text-green-500 hover:text-green-700"
                            onClick={() => addItem?.()}
                            title="Save row (or press Enter)"
                        >
                            <Icon icon="Check" height={14} width={14} />
                        </button>
                    )}
                </div>
                {attrsToRender.map((attribute, i) => {
                    let lexicalTheme = null;
                    if (attribute.type === 'lexical') {
                        lexicalTheme = cloneDeep(theme || {});
                        if (!lexicalTheme.lexical) lexicalTheme.lexical = {};
                        lexicalTheme.lexical.editorScroller = "border-0 flex relative outline-0 z-0 resize-y";
                        lexicalTheme.lexical.editorShell = "w-full h-full font-['Proxima_Nova'] font-[400] text-[1rem] text-slate-700 leading-[22.4px]";
                        lexicalTheme.lexical.editorContainer = "relative block rounded-[10px]";
                    }
                    const Comp = DataTypes[attribute.type || 'text']?.EditComp || (() => <div />);
                    return (
                        <div
                            key={`inline-add-${i}`}
                            className="flex border border-slate-50 p-1 w-full h-full bg-white hover:bg-blue-50"
                            style={{ width: attribute._hasFixedSize ? attribute.size : undefined }}
                        >
                            <Comp
                                key={attribute.name}
                                menuPosition="top"
                                className="p-1 bg-white hover:bg-blue-50 w-full h-full"
                                {...attribute}
                                size={attribute.size || defaultColumnSize}
                                value={newItem[attribute.name]}
                                placeholder="+ add new"
                                onChange={v => setNewItem(prev => ({ ...prev, [attribute.name]: v }))}
                                onPaste={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const paste = (e.clipboardData || window.clipboardData)
                                        .getData('text')
                                        ?.split('\n')
                                        .filter(row => row.length)
                                        .map(row => row.split('\t'));
                                    if (!paste?.length) return;
                                    const pastedCols = [...new Array(paste[0].length).keys()]
                                        .map(j => attrsToRender[i + j])
                                        .filter(Boolean);
                                    const updates = pastedCols.reduce((acc, c, j) => ({
                                        ...acc,
                                        [c.name]: paste[0][j]
                                    }), {});
                                    setNewItem(prev => ({ ...prev, ...updates }));
                                }}
                                hideControls={attribute.type === 'lexical'}
                                theme={lexicalTheme || undefined}
                            />
                        </div>
                    );
                })}
            </div>
            {numColSize === 0 && (
                <button
                    className="absolute top-1/2 right-2 -translate-y-1/2 z-10 bg-green-500 hover:bg-green-600 text-white rounded text-xs px-1.5 py-0.5 shadow"
                    onClick={() => addItem?.()}
                    title="Save row"
                >
                    ✓
                </button>
            )}
        </div>
    );
};
export default function Table ({
    paginationActive, gridRef,
    allowEdit,
    updateItem, removeItem, isEdit,
    numColSize=defaultNumColSize, frozenColClass, frozenCols=[],
    columns=[], data: unFilteredData=[], localFilteredData, fullData, display={}, controls={}, setState, isActive,
    addItem, newItem={}, setNewItem, infiniteScrollFetchData, currentPage, activeStyle,
    highlightedRow,
    conditionalRowStyle,
    onRowMouseClick,
    onRowMouseEnter,
    onRowMouseLeave,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onRowDragEnd,
}) {
    const data = localFilteredData || unFilteredData;

    const { theme: themeFromContext = {table: tableTheme}} = React.useContext(ThemeContext) || {};
    const tableStyle = getComponentTheme(themeFromContext,'table', activeStyle);
    const textSettingsStyle = getComponentTheme(themeFromContext, 'textSettings', 0);
    // textSettings provides typography defaults; table style wins on key conflicts.
    const theme = { ...textSettingsStyle, ...tableStyle };

    // conditional_row_style provider: resolve the accent class from the live table theme
    // (styleKey → theme[styleKey], falling back to the neutral library `rowAccent`) once here,
    // then thread the descriptor + resolved className to each TableRow via context. TableRow
    // evaluates the per-row condition; no descriptor → rows render exactly as before.
    const resolvedConditionalRowStyle = useMemo(() => {
        const { column, styleKey } = conditionalRowStyle || {};
        if (!column) return undefined;
        return { ...conditionalRowStyle, className: theme?.[styleKey] || theme?.rowAccent || '' };
    }, [conditionalRowStyle, theme]);

    // row_highlight 'accent' style: resolve the themed row-level class here (TableRow's curated
    // `rowTheme` doesn't carry it), same pattern as conditional_row_style. Non-accent styles
    // (bg/bold/border) stay per-cell in TableCell and need no resolution — pass through as-is.
    const resolvedHighlightedRow = useMemo(() => {
        if (highlightedRow?.style !== 'accent') return highlightedRow;
        const accentClass = theme?.[highlightedRow.styleKey] || theme?.rowHighlightAccent || theme?.rowAccent || '';
        return { ...highlightedRow, accentClass };
    }, [highlightedRow, theme]);

    const [defaultColumnSize, setDefaultColumnSize] = React.useState(defColSize);

    const actionsColSize = 50;
    const structureValues = useMemo(() => {
        // selectOnly columns participate in the query (fetched into the row) but
        // render no cell — so a column type can read them off `row` (e.g. a data_bar
        // scaling to a sibling `max() over ()` column) without showing a column.
        const visibleAttributes = columns.filter(c => c.show && !c.selectOnly && !c.actionType).map(c => augmentColSizing(c, defaultColumnSize));
        const actionColumns = columns.filter(c => c.show && c.actionType && (c.display === 'both' || isEdit)).map(c => augmentColSizing(c, defaultColumnSize));
        const regularAttrsWithoutOpenOut = visibleAttributes.filter(c => !c.openOut);
        // The actions column is always a fixed, narrow utility column.
        const actionsCol = augmentColSizing({ _isActionsColumn: true, name: '_actions', display_name: ' ', actionColumns, size: actionsColSize }, defaultColumnSize, true);
        const visibleAttrsWithoutOpenOut = actionColumns.length
            ? [actionsCol, ...regularAttrsWithoutOpenOut]
            : regularAttrsWithoutOpenOut;
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
            openOutDefaultOpen: display.openOutDefaultOpen,
            // 'drawer' (default) → floating right-side drawer; 'inline' → panel inserted
            // as a full-width row beneath the clicked row. Only 'inline' changes behaviour.
            openOutMode: display.openOutMode,
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
    const inlineAddRef = useRef(null);
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
        // Let the inline-add row's own onPaste handler take over when focused there.
        if (inlineAddRef.current?.contains(document.activeElement)) return;
        if(!allowEdit && !columns.some(c => c.allowEditInView)) return;
        if(!selection.length) return;
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
        setDefaultColumnSize(Math.max(minColSize, gridWidth / columns.length) - 5)
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
        openOutContainerWrapperBgColor: theme?.openOutContainerWrapperBgColor,
        openOutHideTitle: theme?.openOutHideTitle,
        openOutBelowRow: theme?.openOutBelowRow,
        // inline openOut panel containers (openOutMode === 'inline'); the per-field
        // label/value classes are read by TableCell off the full theme in TableCellContext.
        openOutInlineRow: theme?.openOutInlineRow,
        openOutInlinePanel: theme?.openOutInlinePanel,
    }), [theme]);

    const showInlineAdd = display.emptyRowMode === 'inline_add'
        && (allowEdit || columns.some(c => c.allowEditInView));
    const showPlaceholder = display.emptyRowMode === 'placeholder' && rows.length === 0;
    const effectiveRowCount = showPlaceholder ? 1 : showInlineAdd ? rows.length + 1 : rows.length;

    const itemContent = useCallback(
        (index, startCol, endCol, ref) => {
            if (showPlaceholder && index === 0) {
                return <PlaceholderRow rowRef={ref} />;
            }
            if (showInlineAdd && index === rows.length) {
                return (
                    <InlineAddRow
                        rowRef={ref}
                        containerRef={inlineAddRef}
                        startCol={startCol}
                        endCol={endCol}
                        numColSize={numColSize}
                        defaultColumnSize={defaultColumnSize}
                        visibleAttrsWithoutOpenOut={visibleAttrsWithoutOpenOut}
                        newItem={newItem}
                        setNewItem={setNewItem}
                        addItem={addItem}
                        theme={theme}
                    />
                );
            }
            return (
                <TableRow
                    rowRef={ref}
                    index={index}
                    rowData={rows[index]}
                    startCol={startCol}
                    endCol={endCol}
                    theme={rowTheme}
                />
            );
        },
        [rows, rowTheme, showPlaceholder, showInlineAdd, numColSize, defaultColumnSize,
         visibleAttrsWithoutOpenOut, newItem, setNewItem, addItem, theme]
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

    const endReached = useCallback(() => {
        if (display.usePagination) return;
        infiniteScrollFetchData && infiniteScrollFetchData(currentPage + 1);
    }, [display.usePagination, infiniteScrollFetchData, currentPage]);

    return (
        <div className={`${theme?.tableContainer} ${!paginationActive && theme?.tableContainerNoPagination}`}
             ref={gridRef}
             onMouseLeave={e => handleMouseUp({setIsDragging})}
             style={{maxHeight: !paginationActive && display.maxHeight ? `${display.maxHeight}px` : undefined}}
        >
                <TableStructureContext.Provider value={{...structureValues, highlightedRow: resolvedHighlightedRow, conditionalRowStyle: resolvedConditionalRowStyle, onRowMouseClick, onRowMouseEnter, onRowMouseLeave, onRowDragStart, onRowDragOver, onRowDrop, onRowDragEnd}}>
                    <TableCellContext.Provider value={{
                        frozenCols, allowEdit, editing, setEditing, isDragging, isSelecting,
                        setSelection, setIsDragging, startCellCol, startCellRow, selection, selectionRange,
                        updateItem, removeItem, theme, columns, display
                    }}>
                        <VirtualList
                            rowCount={effectiveRowCount}
                            columnCount={visibleAttrsWithoutOpenOutLength}
                            columnSizes={columnSizes}
                            increaseViewportBy={VIRTUAL_VIEWPORT_INCREASE}
                            endReached={endReached}
                            virtualizeColumns={display.virtualizeColumns}
                            renderItem={itemContent}
                            components={components}
                        />
                    </TableCellContext.Provider>
                </TableStructureContext.Provider>
        </div>
    )
}
