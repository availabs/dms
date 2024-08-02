import React, {useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router-dom"
import DataTypes from "../../../../../../../data-types";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";
import {Delete, ViewIcon, Add} from "../../../../../../admin/ui/icons";
const actionsColSize = 80;
const numColSize = 20;
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


    if(i === 10){
        console.log('edge', {startI, endI, startCol, endCol}, i, attrI, e)
    }

    return e;
}

const RenderActions = ({isLastCell, newItem, removeItem}) => {
    if(!isLastCell) return null;

    return (
            <div className={'flex flex-row h-fit justify-evenly'} style={{width: actionsColSize}}>
                <Link
                    title={'view'}
                    className={'w-fit p-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                    to={`view/${newItem.id}`}>
                    <ViewIcon className={'text-white'} height={20} width={20}/>
                </Link>
                <button
                    title={'delete'}
                    className={'w-fit p-0.5 bg-red-300 hover:bg-red-500 text-white rounded-lg'}
                    onClick={e => {
                        removeItem(newItem)
                    }}>
                    <Delete className={'text-white'} height={20} width={20}/>
                </button>
            </div>
    )
}
const RenderCell = ({attribute, i, item, updateItem, removeItem, isLastCell, width, onPaste, isSelected, isSelecting, editing, edge,
                    onClick, onDoubleClick, onMouseDown, onMouseMove, onMouseUp}) => {
    // const [editing, setEditing] = useState(false);
    const [newItem, setNewItem] = useState(item);
    // const Comp = DataTypes[attribute.type]?.[isSelecting ? 'ViewComp' : 'EditComp'];
    const Comp = DataTypes[attribute.type]?.[editing ? 'EditComp' : 'ViewComp'];
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
        if (newItem[attribute.name] === item[attribute.name]) return;
        setTimeout(
            updateItem(
                newItem[attribute.name],
                attribute,
                {...item, [attribute.name]: newItem[attribute.name]}
            ),
            1000);
    }, [newItem]);
    return (
        <div
            className={`relative flex items-center ${isSelecting ? 'select-none' : ``} ${isSelected ? classNames.isSelected(edge) : 'bg-white'}`}
            style={{
                width,
                ...isSelected && {borderWidth: '1px', ...selectionEdgeClassNames[edge]}
        }}
            onClick={onClick}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onDoubleClick={onDoubleClick}
        >
            <Comp key={`${attribute.name}-${i}`}
                  onClick={onClick}
                // disabled={!editing}
                  className={`
                  ${attribute.type === 'multiselect' && newItem[attribute.name]?.length ? 'p-0.5' :
                      attribute.type === 'multiselect' && !newItem[attribute.name]?.length ? 'p-4' : 'p-0.5'
                  } 
                  ${classNames[attribute.type] || `flex flex-wrap`}
                  ${isSelected ? 'bg-blue-50' : 'bg-white'} hover:bg-blue-50 h-[30px] w-full h-full 
                  `}
                  displayInvalidMsg={false}
                  {...attribute}
                  value={newItem[attribute.name]}
                  onChange={e => {
                      setNewItem({...item, [attribute.name]: e})
                  }}
                  onPaste={onPaste}
            />
        </div>
    )
}


export const RenderSimple = ({
                                 visibleAttributes,
                                 attributes,
                                 isEdit,
                                 orderBy,
                                 setOrderBy,
                                 updateItem,
                                 removeItem,
                                 addItem,
                                 newItem,
                                 setNewItem,
                                 data,
                                 colSizes,
                                 setColSizes
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
        const rows = [...new Set(selection.map(s => s.index || s))].sort((a,b) => a-b);
        const cols = [...new Set(selection.map(s => s.attrI) || visibleAttributes.map((v, i) => i))];

        return {
            startI: rows[0],
            endI: rows[rows.length - 1],
            startCol: cols[0],
            endCol: cols[cols.length - 1]
        }
    }, [selection])
    useEffect(() => {
        if (gridRef.current && (!Object.keys(colSizes).length || Object.keys(colSizes).length !== visibleAttributes.length)) {
            const availableVisibleAttributesLen = visibleAttributes.filter(v => attributes.find(attr => attr.name === v)).length; // ignoring the once not in attributes anymore
            const gridWidth = gridRef.current.offsetWidth - numColSize - actionsColSize;
            const initialColumnWidth = gridWidth / availableVisibleAttributesLen;
            setColSizes(
                visibleAttributes.map(va => attributes.find(attr => attr.name === va)).filter(a => a).reduce((acc, attr) => ({...acc, [attr.name]: initialColumnWidth}) , {})
            );
        }
    }, [visibleAttributes.length, Object.keys(colSizes).length]);

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
    }, [selection, data.length]);
    //============================================ Keyboard Controls end ===============================================

    //============================================ Mouse Controls begin ================================================
    const handleMouseDownHeader = (col) => (e) => {
        const startX = e.clientX;
        const startWidth = colSizes[col] || 0;

        const handleMouseMove = (moveEvent) => {
            const newWidth = startWidth + moveEvent.clientX - startX;
            const gridWidth = gridRef.current.offsetWidth - numColSize - actionsColSize - newWidth;
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
    

    const handlePaste = (attrI, d) => (e) => {
        {
            e.preventDefault();
            e.stopPropagation();

            const paste = (e.clipboardData || window.clipboardData)
                                                    .getData("text")?.split('\n')
                                                    .map(row => row.split('\t'));

            const pastedColumns = [...new Array(paste[0].length).keys()]
                                                    .map(i => visibleAttributes[attrI + i])
                                                    .filter(i => i);

            const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({...acc, [c]: paste[0][i]}), {});

            updateItem(undefined, undefined, {...d, ...tmpNewItem})
        }
    }

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
    console.log('selection', selection)
    return (
        <div className={`flex flex-col w-full`} ref={gridRef}

        >

            {/*Header*/}
            <div className={`grid ${c[visibleAttributes.length + 2]}`} style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${actionsColSize}px`}}>
                <div className={'flex justify-between'} style={{width: numColSize}}>
                    <div key={'#'}
                         className={'w-full font-semibold text-gray-500 border bg-gray-100'}>
                    </div>
                </div>
                {visibleAttributes.map(va => attributes.find(attr => attr?.name === va))
                    .filter(a => a)
                    .map((attribute, i) =>
                        <div className={'flex justify-between'} style={{width: colSizes[attribute?.name]}}>
                            <div key={i}
                                 className={`w-full font-semibold  border ${selection.find(s => s.attrI === i) ? `bg-blue-100 text-gray-900` : `bg-gray-50 text-gray-500`}`}>
                                <RenderInHeaderColumnControls
                                    isEdit={isEdit}
                                    attribute={attribute}
                                    orderBy={orderBy}
                                    setOrderBy={setOrderBy}
                                />
                            </div>
                            <div className="z-5"
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
                <div className={'flex shrink-0 justify-between'} style={{width: actionsColSize}}>
                    <div key={'actions'}
                         className={'w-full font-semibold text-gray-500 border bg-gray-100'}>
                        Actions
                    </div>
                </div>
            </div>

            {/*Rows*/}
            <div className={'flex flex-col no-wrap max-h-[calc(100vh_-_250px)] overflow-auto scrollbar-sm'} onMouseLeave={handleMouseUp}>
                {data.map((d, i) => (
                    <div className={`grid ${c[visibleAttributes.length + 2]} divide-x divide-y ${isDragging ? `select-none` : ``}`}
                         style={{gridTemplateColumns: `${numColSize}px ${visibleAttributes.map(v => `${colSizes[v]}px` || 'auto').join(' ')} ${actionsColSize}px`}}
                    >
                        <div key={'#'}
                             className={`p-1 flex text-xs items-center justify-center border cursor-pointer 
                             ${selection.find(s => (s.index !== undefined ? s.index : s) === i) ? 'bg-blue-100 text-gray-900' : 'bg-gray-50 text-gray-500'}`}
                             style={{width: numColSize}}
                             onClick={e => {
                                 // single click = replace selection
                                 // click and mouse move = add to selection
                                 // ctrl + click add
                                 if(e.ctrlKey) {
                                     setSelection(selection.includes(i) ? selection.filter(v => v !== i) : [...selection, i])
                                 }else {
                                     setSelection([i])
                                 }
                             }}
                             onMouseDown={e => handleMouseDown(e, i)}
                             onMouseMove={e => handleMouseMove(e, i)}
                             onMouseUp={handleMouseUp}
                             onPaste={handlePaste(0, d)}
                        >
                            {i+1}
                        </div>
                        {visibleAttributes
                            .filter(attribute => attributes.find(attr => attr.name === attribute))
                            .map((attribute, attrI) =>
                            <RenderCell
                                isSelecting={isSelecting}
                                isSelected={selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i)}
                                edge={
                                    selection.find(s => s.index === i && s.attrI === attrI) || selection.includes(i) ?
                                getEdge(selectionRange, i, attrI) : null}
                                editing={editing.index === i && editing.attrI === attrI}
                                triggerDelete={triggerSelectionDelete}
                                key={`${i}-${attrI}`}
                                width={colSizes[attributes.find(attr => attr.name === attribute).name]}
                                attribute={attributes.find(attr => attr.name === attribute)}
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
                                onDoubleClick={() => {}}
                                onPaste={handlePaste(attrI, d)}
                            />)}
                        <div className={'flex items-center border'}>
                            <RenderActions isLastCell={true} newItem={d} removeItem={removeItem}/>
                        </div>
                    </div>
                ))}
            </div>

            {/*Add new row*/}
            <div className={'flex max-h-[30px]'}>
                <div style={{width: numColSize}} className={'p-1 flex text-xs text-gray-500 items-center justify-center border'}>
                    {data.length + 1}
                </div>
                {
                    visibleAttributes.map(va => attributes.find(attr => attr.name === va))
                        .filter(a => a)
                        .map((attribute, attrI) => {
                            const Comp = DataTypes[attribute?.type || 'text']?.EditComp;
                            return (
                                <div
                                    className={`flex border`}
                                    style={{width: colSizes[attribute.name]}}
                                >
                                    <Comp
                                        key={`${attribute.name}`}
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
                <div className={'flex flex-row h-fit justify-evenly'} style={{width: actionsColSize}}>
                    <button
                        className={'w-fit p-0.5 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                        onClick={e => addItem()}>
                        <Add className={'text-white'} height={20} width={20}/>
                    </button>
                </div>
            </div>
        </div>
    )
}