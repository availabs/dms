import React, {useEffect, useRef, useState} from "react";
import {Link} from "react-router-dom"
import DataTypes from "../../../../../../../data-types";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";
import {Delete, ViewIcon, DotsInCircle} from "../../../../../../admin/ui/icons";

const RenderActions = ({isLastCell, newItem, removeItem}) => {
    if(!isLastCell) return null;

    return (
            <div className={'flex flex-row h-fit'}>
                <Link
                    title={'view'}
                    className={'w-fit p-1 bg-blue-300 hover:bg-blue-500 text-white rounded-lg'}
                    to={`view/${newItem.id}`}>
                    <ViewIcon className={'text-white'}/>
                </Link>
                <button
                    title={'delete'}
                    className={'w-fit p-1 bg-red-300 hover:bg-red-500 text-white rounded-lg'}
                    onClick={e => {
                        removeItem(newItem)
                    }}>
                    <Delete className={'text-white'}/>
                </button>
            </div>
    )
}
const RenderCell = ({attribute, i, item, updateItem, removeItem, isLastCell, width, onPaste}) => {
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
    }, [newItem])
    return (
        <div className={`flex items-center ${isLastCell ? `border border-r-0` : `border`}`}
             style={{ width: width }}
             // onClick={() => setEditing(true)}
             // onBlur={() => setEditing(false)}
        >
            <Comp key={`${attribute.name}-${i}`}
                  className={`${attribute.type === 'multiselect' && newItem[attribute.name]?.length ? 'p-1' :
                      attribute.type === 'multiselect' && !newItem[attribute.name]?.length ? 'p-4' : 'p-1'
                  } hover:bg-blue-50 h-fit w-full h-full flex flex-wrap`}
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
            const gridWidth = gridRef.current.offsetWidth;
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
            setColSizes({...colSizes, [col]: newWidth});
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    console.log('attrts', attributes)
    return (
        <div className={`flex flex-col w-full`} ref={gridRef}>

            {/*Header*/}
            <div className={'flex no-wrap'}>
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
                                 width: '5px',
                                 height: '100%',
                                 background: '#ddd',
                                 cursor: 'col-resize',
                                 position: 'relative',
                                 right: 0,
                                 top: 0
                             }}
                             onMouseDown={handleMouseDown(attribute?.name)}/>
                    </div>)}
                <div className={'flex justify-between'} style={{width: '100'}}>
                    <div key={'actions'}
                         className={'w-full font-semibold text-gray-500 border bg-gray-100'}>
                        Actions
                    </div>
                </div>
            </div>

            {/*Rows*/}
            <div className={'flex flex-col no-wrap max-h-[calc(100vh_-_450px)] overflow-auto scrollbar-sm'}>
                {data.map((d, i) => (
                    <div className={'flex'}>
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
                                isLastCell={attrI === visibleAttributes.length - 1}
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
                        <RenderActions isLastCell={true} newItem={d} removeItem={removeItem}/>
                    </div>
                ))}
            </div>

            {/*Add new row*/}
            <div className={'flex'}>
                {
                    visibleAttributes.map(va => attributes.find(attr => attr.name === va))
                        .filter(a => a)
                        .map((attribute, attrI) => {
                        const Comp = DataTypes[attribute?.type || 'text']?.EditComp;
                        return (
                            <div
                                className={`flex ${attrI === visibleAttributes.length - 1 ? 'border border-r-0' : `border`}`}
                                style={{ width: colSizes[attribute.name] }}
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
                                        const tmpNewItem = pastedColumns.reduce((acc, c, i) => ({...acc, [c]: paste[0][i]}), {})
                                        setNewItem({...newItem, ...tmpNewItem})

                                    }}
                                />
                                {
                                    attrI === visibleAttributes.length - 1 &&
                                    <button
                                        className={'w-fit p-1 bg-blue-300 hover:bg-blue-500 text-white rounded-r-lg'}
                                        onClick={e => addItem()}>+
                                    </button>
                                }
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )
}