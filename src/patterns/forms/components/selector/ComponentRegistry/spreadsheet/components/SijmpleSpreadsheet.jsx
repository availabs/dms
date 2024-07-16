import React, {useEffect, useState} from "react";
import {Link} from "react-router-dom"
import DataTypes from "../../../../../../../data-types";
import RenderInHeaderColumnControls from "./RenderInHeaderColumnControls";

const RenderCell = ({attribute, i, item, updateItem, removeItem, isLastCell}) => {
    const [newItem, setNewItem] = useState(item);
    const Comp = DataTypes[attribute.type]?.EditComp;

    useEffect(() => {
        setTimeout(updateItem(newItem[attribute.name], attribute, {...item, [attribute.name]: newItem[attribute.name]}), 1000)
    }, [newItem])
    return (
        <div className={`flex ${isLastCell ? `border border-r-0` : `border`}`}>
            <Comp key={`${attribute.name}-${i}`}
                  className={'p-1 hover:bg-blue-50 h-fit w-full h-full flex flex-wrap'}
                  displayInvalidMsg={false}
                  {...attribute}
                  value={newItem[attribute.name]}
                  onChange={e => {
                      setNewItem({...item, [attribute.name]: e})
                  }}
            />
            {
                isLastCell &&
                <>
                    <Link
                        className={'w-fit p-1 bg-blue-300 hover:bg-blue-500 text-white rounded-l-lg'}
                        to={`view/${newItem.id}`}>
                        view
                    </Link>
                    <button
                        className={'w-fit p-1 bg-red-300 hover:bg-red-500 text-white rounded-r-lg'}
                        onClick={e => {removeItem(newItem)}}>x
                    </button>
                </>
            }
        </div>
    )
}

export const RenderSimple = ({visibleAttributes, attributes, isEdit, orderBy, setOrderBy, updateItem, removeItem, addItem, newItem, setNewItem, data}) => (
    <div className={`grid grid-cols-${visibleAttributes.length}`}>

        {/*Header*/}
        {visibleAttributes.map(va => attributes.find(attr => attr.name === va)).map((attribute, i) =>
            <div key={i}
                 className={'p-0 font-semibold text-gray-500 border bg-gray-100'}>
                <RenderInHeaderColumnControls
                    isEdit={isEdit}
                    attribute={attribute}
                    orderBy={orderBy}
                    setOrderBy={setOrderBy}
                />
            </div>)}

        {/*Rows*/}
        {data.map((d, i) => (
            visibleAttributes.map((attribute, attrI) =>
                <RenderCell
                    key={`${i}-${attrI}`}
                    attribute={attributes.find(attr => attr.name === attribute)}
                    updateItem={updateItem}
                    removeItem={removeItem}
                    i={i}
                    item={d}
                    isLastCell={attrI === visibleAttributes.length - 1}
                />)
        ))}

        {/*Add new row*/}
        {
            visibleAttributes.map(va => attributes.find(attr => attr.name === va)).map((attribute, attrI) => {
                const Comp = DataTypes[attribute?.type || 'text']?.EditComp;
                return (
                    <div className={`flex ${attrI === visibleAttributes.length - 1 ? 'border border-r-0' : `border`}`}>
                        <Comp
                            key={`${attribute.name}`}
                            className={'p-1 hover:bg-blue-50 w-full h-full'}
                            {...attribute}
                            value={newItem[attribute.name]}
                            placeholder={'+ add new'}
                            onChange={e => setNewItem({...newItem, [attribute.name]: e})}
                            // onFocus={e => console.log('focusing', e)}
                            onPaste={e => {
                                e.preventDefault();
                                const paste =
                                    (e.clipboardData || window.clipboardData).getData("text")?.split('\n').map(row => row.split('\t'))
                                console.log('pasting', paste)
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
)