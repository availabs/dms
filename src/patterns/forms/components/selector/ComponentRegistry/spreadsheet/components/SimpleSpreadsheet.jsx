import React, {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom"
import DataTypes from "../../../../../../../data-types";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";
import {Delete, ViewIcon, Add} from "../../../../../../admin/ui/icons";
const actionsColSize = 80;
const numColSize = 20;

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
const RenderCell = ({attribute, i, item, updateItem, removeItem, isLastCell, width, onPaste, isSelected}) => {
    // const [editing, setEditing] = useState(false);
    const [newItem, setNewItem] = useState(item);
    const Comp = DataTypes[attribute.type]?.EditComp;

    useEffect(() => setNewItem(item), [item])

    useEffect(() => {
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
        <div className={`flex items-center ${isLastCell ? `border border-r-0` : `border`} ${isSelected ? 'bg-blue-50' : ''}`}
             style={{ width: width }}
        >
            <Comp key={`${attribute.name}-${i}`}
                  className={`${attribute.type === 'multiselect' && newItem[attribute.name]?.length ? 'p-0.5' :
                      attribute.type === 'multiselect' && !newItem[attribute.name]?.length ? 'p-4' : 'p-0.5'
                  } hover:bg-blue-50 h-[30px] w-full h-full flex flex-wrap`}
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


export const RenderSimple = ({visibleAttributes, attributes, isEdit, orderBy, setOrderBy, updateItem, removeItem, addItem, newItem, setNewItem, data, colSizes, setColSizes}) => {
    const gridRef = useRef(null);
    useEffect(() => {
        if (gridRef.current && !Object.keys(colSizes).length) {
            const gridWidth = gridRef.current.offsetWidth - numColSize - actionsColSize;
            const initialColumnWidth = gridWidth / visibleAttributes.length;
            setColSizes(
                visibleAttributes.map(va => attributes.find(attr => attr.name === va)).reduce((acc, attr) => ({...acc, [attr.name]: initialColumnWidth}) , {})
            );
        }
    }, [visibleAttributes.length, Object.keys(colSizes).length]);

    const handleMouseDown = (col) => (e) => {
        const startX = e.clientX;
        const startWidth = colSizes[col] || 0;

        const handleMouseMove = (moveEvent) => {
            const newWidth = startWidth + moveEvent.clientX - startX;
            const gridWidth = gridRef.current.offsetWidth - numColSize - actionsColSize - newWidth;
            const restColsWidthSum = Object.keys(colSizes).filter(k => k !== col).reduce((acc, curr) => acc + (colSizes[curr] || 0), 0);

            if(restColsWidthSum > gridWidth){
                const diff = (restColsWidthSum - gridWidth) / visibleAttributes.length;
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


    const handleSelection = (e) => {
        // e.preventDefault();
        // e.stopPropagation();
        // // setIsSelected(true)
        // console.log('e', e)
        //
        // const handleMouseMove = (moveEvent) => {
        //     console.log('moving', moveEvent)
        // };
        //
        // const handleMouseUp = () => {
        //     console.log('mouseup')
        //     document.removeEventListener('mousemove', handleMouseMove);
        //     document.removeEventListener('mouseup', handleMouseUp);
        // };
        //
        // document.addEventListener('mousemove', handleMouseMove);
        // document.addEventListener('mouseup', handleMouseUp);
    };
    return (
        <div className={`flex flex-col w-full`} ref={gridRef}>

            {/*Header*/}
            <div className={'flex no-wrap'}>
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
                                 className={'w-full font-semibold text-gray-500 border bg-gray-100'}>
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
                                 onMouseDown={handleMouseDown(attribute?.name)}/>
                        </div>)}
                <div className={'flex shrink-0 justify-between'} style={{width: actionsColSize}}>
                    <div key={'actions'}
                         className={'w-full font-semibold text-gray-500 border bg-gray-100'}>
                        Actions
                    </div>
                </div>
            </div>

            {/*Rows*/}
            <div className={'flex flex-col no-wrap max-h-[calc(100vh_-_250px)] overflow-auto scrollbar-sm'}>
                {data.map((d, i) => (
                    <div className={'flex'}>
                        <div key={'#'} className={'flex text-xs text-gray-500 items-center justify-center border'} style={{width: numColSize}}>
                            {i+1}
                        </div>
                        {visibleAttributes
                            .filter(attribute => attributes.find(attr => attr.name === attribute))
                            .map((attribute, attrI) =>
                            <RenderCell
                                key={`${i}-${attrI}`}
                                width={colSizes[attributes.find(attr => attr.name === attribute).name]}
                                attribute={attributes.find(attr => attr.name === attribute)}
                                updateItem={updateItem}
                                removeItem={removeItem}
                                i={i}
                                item={d}
                                // isLastCell={attrI === visibleAttributes.length - 1}
                                onPaste={e => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    const paste =
                                        (e.clipboardData || window.clipboardData).getData("text")?.split('\n').map(row => row.split('\t'));
                                    const pastedColumns = [...new Array(paste[0].length).keys()].map(i => visibleAttributes[attrI + i]).filter(i => i);
                                    const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({...acc, [c]: paste[0][i]}), {})
                                    updateItem(undefined, undefined, {...d, ...tmpNewItem})
                                }}
                            />)}
                        <div className={'flex items-center border'}>
                            <RenderActions isLastCell={true} newItem={d} removeItem={removeItem}/>
                        </div>
                    </div>
                ))}
            </div>

            {/*Add new row*/}
            <div className={'flex max-h-[30px]'}>
                <div style={{width: numColSize}} className={'flex text-xs text-gray-500 items-center justify-center border'}>
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
                                        className={'p-1 hover:bg-blue-50 w-full h-full'}
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