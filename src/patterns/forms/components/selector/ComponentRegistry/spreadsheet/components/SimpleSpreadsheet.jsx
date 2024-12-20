import React, {useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router-dom"
import DataTypes from "../../../../../../../data-types";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";
import Icons, {TrashCan, Add} from "../../../../../ui/icons";
import {convertToUrlParams, formatFunctions} from "../utils";
const actionsColSize = 80;
const numColSize = 20;
const gutterColSize = 20;
const minColSize = 50
const frozenColClass = '' //'sticky left-0 z-10'
const stringifyIfObj = obj => typeof obj === "object" ? JSON.stringify(obj) : obj;
const LoadingComp = ({className}) => <div className={className}>loading...</div>
const getEdge = ({startI, endI, startCol, endCol}, i, attrI) => {
    const e =
    startI === endI && startCol === endCol ? 'all' :
    startCol === endCol && startI === i ? 'ltr' :
    startCol === endCol && endI === i ? 'lbr' :
    startCol === endCol && startI !== i && endI !== i ? 'x' :
        startI === endI && attrI === startCol ? 'tlb' :
        startI === endI && attrI === endCol ? 'trb' :
        startI === endI && startCol !== attrI && endCol !== attrI ? 'y' :
    startI === i && startCol === attrI ? 'top-left' :
        startI === i && endCol === attrI ? 'top-right' :
            startI === i && startCol !== attrI && endCol !== attrI ? 'top' :
                endI === i && startCol === attrI ? 'bottom-left' :
                    endI === i && endCol === attrI ? 'bottom-right' :
                        endI === i && startCol !== attrI && endCol !== attrI ? 'bottom' :
                            startCol === attrI && startI !== i && endI !== i ? 'left' :
                                endCol === attrI && startI !== i && endI !== i ? 'right' : '';

    return e;
}

function usePaste(callback) {
    useEffect(() => {
        function handlePaste(event) {
            const pastedText = event.clipboardData.getData('Text');
            if (pastedText) {
                callback(pastedText, event);
            }
        }

        window.addEventListener('paste', handlePaste);

        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [callback]);
}
const updateItemsOnPaste = ({pastedContent, e, index, attrI, data, visibleAttributes, updateItem}) => {
    const paste = pastedContent?.split('\n').filter(row => row.length).map(row => row.split('\t'));
    if(!paste) return;

    const rowsToPaste = [...new Array(paste.length).keys()].map(i => index + i).filter(i => i < data.length)
    const columnsToPaste = [...new Array(paste[0].length).keys()]
        .map(i => visibleAttributes[attrI + i])
        .filter(i => i);

    const itemsToUpdate = rowsToPaste.map((row, rowI) => (
        {
            ...data[row],
            ...columnsToPaste.reduce((acc, col, colI) => ({...acc, [col]: paste[rowI][colI]}), {})
        }
    ));

    updateItem(undefined, undefined, itemsToUpdate);
}
function useCopy(callback) {
    useEffect(() => {
        function handleCopy(event) {
            const dataToCopy = callback();
            // event.clipboardData.setData('text/plain', dataToCopy)
            return navigator.clipboard.writeText(dataToCopy)
        }

        window.addEventListener('copy', handleCopy);

        return () => {
            window.removeEventListener('copy', handleCopy);
        };
    }, [callback]);
}
const getIcon = ({icon, name}) => (icon) ? Icons[icon] : () => name;

const RenderActions = ({isLastCell, newItem, removeItem, groupBy=[], filters=[], actions=[]}) => {
    if(!isLastCell || !actions.length) return null;
    const searchParams = groupBy.length ?
        convertToUrlParams(
            [...groupBy.filter(col => newItem[col]).map(column => ({column, values: [newItem[column]]})),
            ...filters]
        ) : `id=${newItem.id}`
    // console.log('SP?', searchParams, groupBy)
    return (
        <div className={'flex items-center border'}>
            <div className={'flex flex-row h-fit justify-evenly'} style={{width: actionsColSize}}>
                {
                    actions.map(action => {
                        const Icon = getIcon({name: action.name, icon: action.icon || (action.type === 'delete' && 'TrashCan')})
                        return action.type === 'url' ? (
                            <Link
                                key={`${action.name}`}
                                title={action.name}
                                className={'flex items-center w-fit p-0.5 mx-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                                to={`${action.url}?${searchParams}`}>
                                <Icon className={'text-white'}/>
                            </Link>
                        ) : groupBy.length ? null :(
                            <button
                                key={`delete`}
                                title={'delete'}
                                className={'w-fit p-0.5 mx-0.5 bg-red-300 hover:bg-red-500 text-white rounded-lg'}
                                onClick={e => {removeItem(newItem)}}>
                                <Icon className={'text-white'}/>
                            </button>
                        )
                    })
                }
            </div>
        </div>
    )
}
const validate = ({value, required, options, name}) => {
    const requiredValidation = !required || (required && value && value !== '')
    const optionsValidation = !options || !options?.length || (
        Array.isArray(options) && typeof value === "string" ? // select
            options.map(o => o.value || o).includes(value) :
            Array.isArray(options) && Array.isArray(value) ?  // multiselect
                value.reduce((acc, v) => acc && options.map(o => o.value || o).includes(v.value || v), true) :
                false
    );
    // if (!(requiredValidation && optionsValidation)) console.log('----', name, requiredValidation, optionsValidation, options, value)
    return requiredValidation && optionsValidation;
}

const DisplayCalculatedCell = ({value, className}) => <div className={className}>{value}</div>
const RenderCell = ({
                        attribute, justify, formatFn, fontSize,
                        i, item, updateItem, width, onPaste,
                        isFrozen, isSelected, isSelecting, editing, edge, loading, allowEdit, striped,
                        onClick, onDoubleClick, onMouseDown, onMouseMove, onMouseUp}) => {
    // const [editing, setEditing] = useState(false);
    const [newItem, setNewItem] = useState(item);
    // const Comp = DataTypes[attribute.type]?.[isSelecting ? 'ViewComp' : 'EditComp'];
    const Comp = loading ? LoadingComp : (DataTypes[attribute.type]?.[editing && allowEdit ? 'EditComp' : 'ViewComp'] || DisplayCalculatedCell);
    const justifyClass = {
        left: 'justify-start',
        right: 'justify-end',
        center: 'justify-center'
    }
    const selectionColor = '#2100f8'
    const selectionEdgeClassNames = {
        top: {borderTopColor: selectionColor},
        bottom: {borderBottomColor: selectionColor},
        left: {borderLeftColor: selectionColor},
        right: {borderRightColor: selectionColor},
        'top-left': {borderTopColor: selectionColor, borderLeftColor: selectionColor},
        'top-right': {borderTopColor: selectionColor, borderRightColor: selectionColor},
        'bottom-left': {borderBottomColor: selectionColor, borderLeftColor: selectionColor},
        'bottom-right': {borderBottomColor: selectionColor, borderRightColor: selectionColor},
        'ltr': {borderTopColor: selectionColor, borderLeftColor: selectionColor, borderRightColor: selectionColor},
        'lbr': {borderBottomColor: selectionColor, borderLeftColor: selectionColor, borderRightColor: selectionColor},
        'tlb': {borderTopColor: selectionColor, borderLeftColor: selectionColor, borderBottomColor: selectionColor},
        'trb': {borderTopColor: selectionColor, borderRightColor: selectionColor, borderBottomColor: selectionColor},
        'x': {borderLeftColor: selectionColor, borderRightColor: selectionColor},
        'y': {borderTopColor: selectionColor, borderBottomColor: selectionColor},
        'all': {borderColor: selectionColor},
    }
    const classNames = {
        text: 'flex no-wrap truncate',
        isSelected: edge => `bg-blue-50`,
    }
    useEffect(() => setNewItem(item), [item])

    useEffect(() => {
        // send update to api
        if (stringifyIfObj(newItem[attribute.name]) !== stringifyIfObj(item[attribute.name])){
            updateItem(undefined, undefined, newItem)
        }

    }, [newItem]);
    const isValid = validate({
        value: newItem[attribute.name],
        options: attribute.options,
        required: attribute.required === "yes"
    });

    return (
        <div
            className={`relative flex items-center min-h-[35px] 
            ${isFrozen ? frozenColClass : ''} ${isSelecting ? 'select-none' : ``}
            ${isSelected ? 'bg-blue-50' : 'bg-white'}
            `}
            style={{
                width,
                ...isSelected && {borderWidth: '1px', ...selectionEdgeClassNames[edge]}
        }}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={onDoubleClick}
            onPaste={onPaste}
        >
            {
                isValid ? null : <span className={'absolute top-0 right-0 text-red-900 font-bold h-fit w-fit'} title={'Invalid Value'}>*</span>
            }
            <Comp key={`${attribute.name}-${i}`}
                  onClick={onClick}
                  autoFocus={editing}
                  className={`
                  min-w-full min-h-full flex flex-wrap ${justifyClass[justify]} items-center truncate
                  ${striped && i % 2 !== 0 ? 'bg-gray-50' : isSelected ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-50 
                  ${attribute.type === 'multiselect' && newItem[attribute.name]?.length ? 'p-0.5' :
                      attribute.type === 'multiselect' && !newItem[attribute.name]?.length ? 'p-0.5' : 'p-0.5'
                  } 
                
                  `}
                  // displayInvalidMsg={false}
                  {...attribute}
                  value={formatFn ? formatFunctions[formatFn](newItem[attribute.name], attribute.isDollar) : newItem[attribute.name]}
                  onChange={e => {
                      setNewItem({...newItem, [attribute.name]: e})
                  }}
                  // onPaste={onPaste}
            />
        </div>
    )
}

const getLocation = selectionPoint => {
    let {index, attrI} = typeof selectionPoint === 'number' ? { index: selectionPoint, attrI: undefined } : selectionPoint;
    return {index, attrI}
}
export const RenderSimple = ({
                                 visibleAttributes,
                                 attributes,
                                 customColNames,
                                 isEdit,
                                 orderBy,
                                 setOrderBy,
                                 filters,
                                 setFilters,
                                 groupBy,
                                 updateItem,
                                 removeItem,
                                 addItem,
                                 newItem,
                                 setNewItem,
                                 data,
                                 colSizes,
                                 setColSizes,
                                 currentPage,
                                 pageSize,
                                 loading,
                                 allowEdit,
                                 actions,
                                 loadMoreId,
                                 striped,
                                 format,
                                 colJustify,
                                 setColJustify,
                                 formatFn, setFormatFn,
                                 fontSize, setFontSize,
                             }) => {
    const gridRef = useRef(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [editing, setEditing] = useState({}); // {index, attrI}
    const [selection, setSelection] = useState([]);
    const [triggerSelectionDelete, setTriggerSelectionDelete] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const startCellRow = useRef(null);
    const startCellCol = useRef(null);
    const selectionRange = useMemo(() => {
        const rows = [...new Set(selection.map(s => s.index !== undefined ? s.index : s))].sort((a,b) => a-b);
        const cols = [...new Set(selection.map(s => s.attrI).sort((a,b) => a-b) || visibleAttributes.map((v, i) => i))];
        return {
            startI: rows[0],
            endI: rows[rows.length - 1],
            startCol: cols[0],
            endCol: cols[cols.length - 1]
        }
    }, [selection])

    usePaste((pastedContent, e) => {
        let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
            { index: selection[selection.length - 1], attrI: undefined } :
            selection[selection.length - 1];
       updateItemsOnPaste({pastedContent, e, index, attrI, data, visibleAttributes, updateItem})
    });

    useCopy(() => {
        return Object.values(
            selection.sort((a,b) => {
            const {index: rowA, attrI: colA} = getLocation(a);
            const {index: rowB, attrI: colB} = getLocation(b);

            return (rowA - rowB) || (colA - colB);
            })
                .reduce((acc, s) => {
                    const {index, attrI} = getLocation(s);
                    acc[index] = acc[index] ? `${acc[index]}\t${data[index][visibleAttributes[attrI]]}` : data[index][visibleAttributes[attrI]]; // join cells of a row
                    return acc;
                }, {})).join('\n') // join rows
    })
    useEffect(() => {
        if (gridRef.current && (!Object.keys(colSizes).length || Object.keys(colSizes).length !== visibleAttributes.length)) {
            const availableVisibleAttributesLen = visibleAttributes.filter(v => attributes.find(attr => attr.name === v)).length; // ignoring the once not in attributes anymore
            const gridWidth = gridRef.current.offsetWidth - numColSize - gutterColSize - (allowEdit ? actionsColSize : 0);
            const initialColumnWidth = Math.max(minColSize, gridWidth / availableVisibleAttributesLen);
            setColSizes(
                visibleAttributes.map(va => attributes.find(attr => attr.name === va)).filter(a => a).reduce((acc, attr) => ({...acc, [attr.name]: initialColumnWidth}) , {})
            );
        }
    }, [visibleAttributes.length, attributes.length, Object.keys(colSizes).length]);

    useEffect(() => {
        async function deleteFn(){
            if(triggerSelectionDelete){
                const selectionRows = data.filter((d,i) => selection.find(s => (s.index || s) === i))
                const selectionCols = visibleAttributes.filter((v,i) => selection.map(s => s.attrI).includes(i))

                if(selectionCols.length){
                    // partial selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...selectionCols.reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                }else{
                    // full row selection
                    updateItem(undefined, undefined, selectionRows.map(row => ({...row, ...visibleAttributes.reduce((acc, curr) => ({...acc, [curr]: ''}), {})})))
                }
            }
        }

        deleteFn()
    }, [triggerSelectionDelete])

    //============================================ Keyboard Controls begin =============================================
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.shiftKey) {
                setIsDragging(true)
                let lastSelected = selection[selection.length - 1]; // [int or {index, attrI}]
                let attrIRange = selection.map(s => s.attrI).filter(s => s !== undefined).sort((a,b) => a-b);
                if(!attrIRange?.length){
                    attrIRange = visibleAttributes.map((va, i) => i);
                }
                attrIRange = [...new Set(attrIRange)].sort((a,b) => a-b);
                let indexRange = [...new Set(selection.map(s => s.index !== undefined ? s.index : s))].sort((a,b) => a-b);

                if (typeof lastSelected === 'number') {
                    lastSelected = { index: lastSelected, attrI: undefined };
                }

                switch (e.key) {
                    case 'ArrowUp':
                        if (lastSelected.index > 0) {
                            setSelection(prevSelection => {
                                const newindex = lastSelected.index - 1;
                                const newSelection = attrIRange.map(r => ({ index: newindex, attrI: r })); // for all attributes, add a selection
                                return prevSelection.find(sel => sel.index <= newindex)
                                    ? prevSelection.filter(sel => !(sel.index > newindex))
                                    : [...prevSelection, ...newSelection];
                            });
                        }
                        break;
                    case 'ArrowDown':
                        if (lastSelected.index < data.length - 1) {
                            setSelection(prevSelection => {
                                const newindex = lastSelected.index + 1;
                                const newSelection = attrIRange.map(r => ({ index: newindex, attrI: r })); // for all attributes, add a selection
                                return prevSelection.find(sel => sel.index >= newindex)
                                    ? prevSelection.filter(sel => !(sel.index < newindex))
                                    : [...prevSelection, ...newSelection];
                            });
                        }
                        break;
                    case 'ArrowLeft':
                        if (lastSelected.attrI > 0) {
                            setSelection(prevSelection => {
                                const newattrI = lastSelected.attrI - 1;
                                const newSelection = indexRange.map(ir => ({ index: ir, attrI: newattrI }));
                                return prevSelection.find(sel => sel.attrI <= newattrI)
                                    ? prevSelection.filter(sel => !(sel.attrI > newattrI))
                                    : [...prevSelection, ...newSelection];
                            });
                        }
                        break;
                    case 'ArrowRight':
                        if (lastSelected.attrI < visibleAttributes.length - 1) {
                            setSelection(prevSelection => {
                                const newattrI = lastSelected.attrI + 1;
                                const newSelection = indexRange.map(ir => ({ index: ir, attrI: newattrI }));
                                return prevSelection.find(sel => sel.attrI >= newattrI)
                                    ? prevSelection.filter(sel => !(sel.attrI < newattrI))
                                    : [...prevSelection, ...newSelection];
                            });
                        }
                        break;
                    default:
                        break;
                }
            } else if (e.ctrlKey) {
                setIsSelecting(true);
            } else if (e.key === 'Delete'){
                setTriggerSelectionDelete(true)
            } else if (e.key.includes('Arrow')){
                let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
                                            { index: selection[selection.length - 1], attrI: undefined } :
                                                selection[selection.length - 1];

                switch (e.key){
                    case "ArrowUp":
                        index > 0 && setSelection([{index: index - 1, attrI: attrI || 0}]);
                        setEditing({})
                        break;
                    case "ArrowDown":
                        index < Math.min(pageSize, data.length) - 1 && setSelection([{index: index + 1, attrI: attrI || 0}]);
                        setEditing({})
                        break;
                    case "ArrowLeft":
                        attrI > 0 && setSelection([{index, attrI: attrI - 1}]);
                        setEditing({})
                        break;
                    case "ArrowRight":
                        attrI < visibleAttributes.length - 1 && setSelection([{index, attrI: attrI + 1}]);
                        setEditing({})
                        break;

                }
            } else if (e.key === 'Enter'){
                let {index, attrI} = typeof selection[selection.length - 1] === 'number' ?
                    { index: selection[selection.length - 1], attrI: undefined } :
                    selection[selection.length - 1];

                if(index === editing.index && attrI === editing.attrI){
                    // move to cell below if editing
                    setEditing({});
                    setSelection([{index: index + 1, attrI}]);
                }else{
                    // enter edit mode
                    setEditing({index, attrI});
                }
            }
        };

        const handleKeyUp = () => {
            setIsSelecting(false)
            setIsDragging(false)
            setTriggerSelectionDelete(false);
        }

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selection, editing, data.length]);
    //============================================ Keyboard Controls end ===============================================

    //============================================ Mouse Controls begin ================================================
    const handleMouseDownHeader = (col) => (e) => {
        const startX = e.clientX;
        const startWidth = colSizes[col] || 0;

        const handleMouseMove = (moveEvent) => {
            const newWidth = Math.max(minColSize, startWidth + moveEvent.clientX - startX);
            const gridWidth = gridRef.current.offsetWidth - numColSize - gutterColSize - (allowEdit ? actionsColSize : 0) - newWidth;
            const restColsWidthSum = Object.keys(colSizes).filter(k => k !== col).reduce((acc, curr) => acc + (colSizes[curr] || 0), 0);

            if(restColsWidthSum > gridWidth){
                const availableVisibleAttributesLen = visibleAttributes.filter(v => attributes.find(attr => attr.namr === v)).length;

                const diff = (restColsWidthSum - gridWidth) / availableVisibleAttributesLen;
                const newColSizes = Object.keys(colSizes).reduce((acc, curr) => {
                    acc[curr] = curr === col ? newWidth : colSizes[curr] - diff;
                    return acc;
                }, {});
               setColSizes(newColSizes);
            }
            setColSizes({...colSizes, [col]: newWidth});
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };


    const handleMouseDown = (e, index, attrI) => {
        if(attrI !== undefined /*&& e.ctrlKey*/) {
            setSelection([{index, attrI}]);
            setIsDragging(true)
            startCellRow.current = index;
            startCellCol.current = attrI
            return;
        }

        if(attrI !== undefined) return;

        if (e.ctrlKey) {
            // Toggle selection with ctrl key
            e.preventDefault();
            setSelection(selection.includes(index) ? selection.filter(v => v !== index) : [...selection, index]);
            setIsDragging(true);
            startCellRow.current = index;
        } else {
            // Start dragging selection
            setSelection([index]);
            setIsDragging(true);
            startCellRow.current = index;
        }
    };

    const handleMouseMove = (e, index, attrI) => {
        if(/*e.ctrlKey && */attrI !== undefined && isDragging) {
            // Determine the range

            const rangeRow = [startCellRow.current, index].sort((a, b) => a - b);
            const rangeCol = [startCellCol.current, attrI].sort((a, b) => a - b);
            const newSelection = [];
            for (let i = rangeRow[0]; i <= rangeRow[1]; i++) {
                for (let j = rangeCol[0]; j <= rangeCol[1]; j++) {
                    newSelection.push({index: i, attrI: j});
                }
            }
            setSelection(newSelection);
            return;
        }
        if (isDragging) {
            // Determine the range
            const endCellIndex = index;
            const range = [startCellRow.current, endCellIndex].sort((a, b) => a - b);
            const newSelection = [];
            for (let i = range[0]; i <= range[1]; i++) {
                newSelection.push(i);
            }
            setSelection(newSelection);
        }
    };

    const handleMouseUp = () => {
        // Stop dragging
        setIsDragging(false);
    };
    //============================================ Mouse Controls end ==================================================
    const c = {
        1: 'grid grid-cols-1',
        2: 'grid grid-cols-2',
        3: 'grid grid-cols-3',
        4: 'grid grid-cols-4',
        5: 'grid grid-cols-5',
        6: 'grid grid-cols-6',
        7: 'grid grid-cols-7',
        8: 'grid grid-cols-8',
        9: 'grid grid-cols-9',
        10: 'grid grid-cols-10',
        11: 'grid grid-cols-11',
    };

    if(!visibleAttributes.length) return <div className={'p-2'}>No columns selected.</div>;
    const frozenCols = [0,1]
    return (
        <div className={`flex flex-col w-full h-full overflow-x-auto scrollbar-sm`} ref={gridRef}>
            <div className={'flex flex-col no-wrap text-sm max-h-[calc(87vh_-_10px)] overflow-y-auto scrollbar-sm'}
                 onMouseLeave={handleMouseUp}>
                {/*Header*/}
                <div className={`sticky top-0 grid ${allowEdit ? c[visibleAttributes.length + 3] : c[visibleAttributes.length + 2]}`} style={{
                    zIndex: 5,
                    gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`
                }}>
                    <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                        <div key={'#'}
                             className={`w-full font-semibold border bg-gray-50 text-gray-500 ${frozenColClass}`}>
                        </div>
                    </div>
                    {visibleAttributes.map(va => attributes.find(attr => attr?.name === va))
                        .filter(a => a)
                        .map((attribute, i) =>
                            <div key={i} className={`flex justify-between ${frozenCols.includes(i) ? frozenColClass : ''}`}
                                 style={{width: colSizes[attribute?.name]}}>
                                <div key={`controls-${i}`}
                                     className={`w-full font-semibold  border ${selection.find(s => s.attrI === i) ? `bg-blue-100 text-gray-900` : `bg-gray-50 text-gray-500`}`}>
                                    <RenderInHeaderColumnControls
                                        isEdit={isEdit}
                                        attribute={attribute}
                                        orderBy={orderBy} setOrderBy={setOrderBy}
                                        filters={filters} setFilters={setFilters}
                                        colJustify={colJustify} setColJustify={setColJustify}
                                        formatFn={formatFn} setFormatFn={setFormatFn}
                                        fontSize={fontSize} setFontSize={setFontSize}
                                        customColName={customColNames[attribute.name]}
                                        format={format}
                                    />
                                </div>
                                <div key={`resizer-${i}`} className="z-5 -ml-2"
                                     style={{
                                         width: '3px',
                                         height: '100%',
                                         background: '#ddd',
                                         cursor: 'col-resize',
                                         position: 'relative',
                                         right: 0,
                                         top: 0
                                     }}
                                     onMouseDown={handleMouseDownHeader(attribute?.name)}/>
                            </div>)}
                    {
                        allowEdit && actions.length ? (
                            <div className={'flex shrink-0 justify-between'} style={{width: actionsColSize}}>
                                <div key={'actions'}
                                     className={'w-full flex items-center px-3 py-1 font-semibold border bg-gray-50 text-gray-900 select-none'}>
                                    Actions
                                </div>
                            </div>
                        ) : null
                    }
                    <div key={'##'}
                         className={`bg-gray-50 border z-[1] flex shrink-0 justify-between`}
                         style={{width: numColSize}}
                    > {` `}</div>
                </div>
                {/*Rows*/}
                {/*<div className={`max-h-[calc(87vh_-_10px)] overflow-y-auto scrollbar-sm`}>*/}
                    {data.map((d, i) => (
                        <div key={`data-${i}`}
                            className={`grid ${allowEdit ? c[visibleAttributes.length + 3] : c[visibleAttributes.length + 2]} 
                                        divide-x divide-y ${isDragging ? `select-none` : ``} ${striped ? `odd:bg-gray-50` : ``}`}
                            style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}
                        >
                            <div key={'#'}
                                 className={`p-1 flex text-xs items-center justify-center border cursor-pointer 
                             sticky left-0 z-[1]
                             ${selection.find(s => (s.index !== undefined ? s.index : s) === i) ? 'bg-blue-100 text-gray-900' : 'bg-gray-50 text-gray-500'}`}
                                 style={{width: numColSize}}
                                 onClick={e => {
                                     // single click = replace selection
                                     // click and mouse move = add to selection
                                     // ctrl + click add
                                     if (e.ctrlKey) {
                                         setSelection(selection.includes(i) ? selection.filter(v => v !== i) : [...selection, i])
                                     } else {
                                         setSelection([i])
                                     }
                                 }}
                                 onMouseDown={e => handleMouseDown(e, i)}
                                 onMouseMove={e => handleMouseMove(e, i)}
                                 onMouseUp={handleMouseUp}
                            >
                                {/*{(i + (currentPage * pageSize)) + 1}*/}
                                {i + 1}
                            </div>
                            {visibleAttributes
                                .filter(attribute => attributes.find(attr => attr.name === attribute))
                                .map((attribute, attrI) =>
                                    <RenderCell
                                        isSelecting={isSelecting}
                                        isSelected={selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i)}
                                        isFrozen={frozenCols.includes(attrI)}
                                        edge={
                                            selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i) ?
                                                getEdge(selectionRange, i, attrI) : null}
                                        editing={editing.index === i && editing.attrI === attrI}
                                        triggerDelete={triggerSelectionDelete}
                                        key={`cell-${i}-${attrI}`}
                                        width={colSizes[attributes.find(attr => attr.name === attribute).name]}
                                        attribute={attributes.find(attr => attr.name === attribute)}
                                        justify={colJustify[attribute]}
                                        formatFn={formatFn[attribute]}
                                        fontSize={fontSize[attribute]}
                                        loading={loading}
                                        updateItem={updateItem}
                                        removeItem={removeItem}

                                        i={i}
                                        item={d}
                                        onMouseDown={e => handleMouseDown(e, i, attrI)}
                                        onMouseMove={e => handleMouseMove(e, i, attrI)}
                                        onMouseUp={handleMouseUp}
                                        onClick={() => {
                                            setSelection([{index: i, attrI}]);
                                            setEditing({index: i, attrI});
                                        }}
                                        onDoubleClick={() => {
                                        }}
                                        allowEdit={allowEdit}
                                        striped={striped}
                                    />)}

                            <RenderActions allowEdit={allowEdit} isEdit={isEdit} isLastCell={true} newItem={d}
                                           groupBy={groupBy} filters={filters}
                                           removeItem={removeItem} actions={actions}/>

                            <div className={'flex items-center border'}>
                                <div key={'##'}
                                     className={`bg-gray-50 h-full flex shrink-0 justify-between`}
                                     style={{width: numColSize}}
                                > {` `}</div>
                            </div>
                        </div>
                    ))}
                    <div id={loadMoreId}></div>
                {/*</div>*/}

                {/*gutter*/}
                <div
                    className={`bg-white grid ${allowEdit ? c[visibleAttributes.length + 3] : c[visibleAttributes.length + 2]} divide-x divide-y ${isDragging ? `select-none` : ``} sticky bottom-0 z-[1]`}
                    style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}
                >
                    <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                        <div key={'#'}
                             className={`w-full font-semibold border bg-gray-50 text-gray-500`}>
                        </div>
                    </div>
                    {
                        visibleAttributes.map(va => attributes.find(attr => attr.name === va))
                            .filter(a => a)
                            .map((attribute, attrI) => {
                                return (
                                    <div
                                        key={`gutter-${attrI}`}
                                        className={`flex border bg-gray-50`}
                                        style={{width: colSizes[attribute.name]}}
                                    >
                                        {` `}
                                    </div>
                                )
                            })
                    }
                    <div key={`gutter-actions-column`} className={'bg-white flex flex-row h-fit justify-evenly'}
                         style={{width: actionsColSize}}>

                    </div>
                </div>

                {
                    allowEdit ?
                        <div
                            className={`bg-white grid ${allowEdit ? c[visibleAttributes.length + 3] : c[visibleAttributes.length + 2]} divide-x divide-y ${isDragging ? `select-none` : ``} sticky bottom-0 z-[1]`}
                            style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${allowEdit ? `${actionsColSize}px` : ``} ${gutterColSize}px`}}
                        >
                            <div className={'flex justify-between sticky left-0 z-[1]'} style={{width: numColSize}}>
                                <div key={'#'}
                                     className={`w-full font-semibold border bg-gray-50 text-gray-500`}>
                                </div>
                            </div>
                            {
                                visibleAttributes.map(va => attributes.find(attr => attr.name === va))
                                    .filter(a => a)
                                    .map((attribute, attrI) => {
                                        const Comp = DataTypes[attribute?.type || 'text']?.EditComp || DisplayCalculatedCell;
                                        return (
                                            <div
                                                key={`add-new-${attrI}`}
                                                className={`flex border`}
                                                style={{width: colSizes[attribute.name]}}
                                            >
                                                <Comp
                                                    key={`${attribute.name}`}
                                                    menuPosition={'top'}
                                                    className={'p-1 bg-white hover:bg-blue-50 w-full h-full'}
                                                    {...attribute}
                                                    value={newItem[attribute.name]}
                                                    placeholder={'+ add new'}
                                                    onChange={e => setNewItem({...newItem, [attribute.name]: e})}
                                                    onPaste={e => {
                                                        e.preventDefault();
                                                        e.stopPropagation();

                                                        const paste =
                                                            (e.clipboardData || window.clipboardData).getData("text")?.split('\n').map(row => row.split('\t'));
                                                        const pastedColumns = [...new Array(paste[0].length).keys()].map(i => visibleAttributes[attrI + i]).filter(i => i);
                                                        const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({
                                                            ...acc,
                                                            [c]: paste[0][i]
                                                        }), {})
                                                        setNewItem({...newItem, ...tmpNewItem})

                                                    }}
                                                />
                                            </div>
                                        )
                                    })
                            }
                            <div className={'bg-white flex flex-row h-fit justify-evenly'}
                                 style={{width: actionsColSize}}>
                                <button
                                    className={'w-fit p-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                                    onClick={e => {
                                        addItem()
                                    }}>
                                    <Add className={'text-white'} height={20} width={20}/>
                                </button>
                            </div>
                        </div> : null
                }

            </div>
        </div>
    )
}