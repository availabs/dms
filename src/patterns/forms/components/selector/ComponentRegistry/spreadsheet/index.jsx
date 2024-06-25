import React, { useMemo, useState, useEffect }from 'react'
import {Link} from "react-router-dom"
import DataTypes from "../../../../../../data-types";
export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const getData = async ({format, apiLoad}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const children = [{
        type: () => {
        },
        action: 'list',
        path: '/',
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        format,
        attributes,
        children
    });
  return {data, attributes}
}

const RenderCell = ({attribute, i, item, updateItem, removeItem, isLastCell}) => {
    const [newItem, setNewItem] = useState(item);
    const Comp = DataTypes[attribute.type]?.EditComp;
    return (
        <div className={'flex border'}>
            <Comp key={`${attribute.name}-${i}`} className={'p-1 hover:bg-blue-50 h-full w-full '}
                  value={newItem[attribute.name]} onChange={e => {
                      setNewItem({...item, [attribute.name]: e})
                      updateItem(e, attribute, {...item, [attribute.name]: e})
            }}/>
            {
                isLastCell &&
                <>
                    <Link
                        className={'w-fit p-1 bg-blue-300 hover:bg-blue-500 text-white'}
                        to={`view/${newItem.id}`}>
                        view
                    </Link>
                    <button
                        className={'w-fit p-1 bg-red-300 hover:bg-red-500 text-white'}
                        onClick={e => {
                            removeItem(newItem)
                        }}>x
                    </button>
                </>
            }
        </div>
    )
}
const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    const [data, setData] = useState([]);
    const [attributes, setAttributes] = useState([])
    const [newItem, setNewItem] = useState({})
    async function load(){
        const {data, attributes} = await getData({format, apiLoad});
        setData(data)
        setAttributes(attributes)
    }
    if(!value) return ''
    useEffect(() => {
        load()
    }, [format])

    const updateItem = (value, attribute, d) => {
        return apiUpdate({data: {...d, [attribute.name]: value}, config: {format}})
    }

    const addItem = () => {
        return apiUpdate({data: newItem, config: {format}}) && setNewItem({})
    }

    const removeItem = item => {
        console.log('data to remove', item)
        setData(data.filter(d => d.id !== item.id))
        return apiUpdate({data:item, config: {format}, requestType: 'delete'})
    }

    return (
        <div>
            <div className={'text-xl text-gray-300 font-semibold'}>Spreadsheet view</div>
            <div className={` grid grid-cols-${attributes.length}`}>

                {attributes.map(attribute =>
                    <div className={'p-2 font-semibold text-gray-500 border bg-gray-200'}>
                        {attribute.display_name || attribute.name}
                    </div>)}

                {data.map((d, i) => (
                    attributes.map((attribute, attrI) =>
                        <RenderCell
                            attribute={attribute}
                            updateItem={updateItem}
                            removeItem={removeItem}
                            i={i}
                            item={d}
                            isLastCell={attrI === attributes.length - 1}
                        />)
                ))}

                {
                    attributes.map((attribute, attrI) => {
                        const Comp = DataTypes[attribute.type]?.EditComp;
                        return (
                            <div className={'flex border'}>
                                <Comp key={`${attribute.name}`}
                                      className={'p-2 hover:bg-blue-50 w-full'}
                                      value={newItem[attribute.name]}
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
                                    attrI === attributes.length - 1 &&
                                    <button
                                        className={'w-fit p-1 bg-blue-300 hover:bg-blue-500 text-white'}
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

const View = ({value, format, apiLoad, ...rest}) => {
    const [data, setData] = useState([]);
    const [attributes, setAttributes] = useState([])
    console.log('spreadsheet view', rest)
    if(!value) return ''
    useEffect(() => {
        async function load(){
            const {data, attributes} = await getData({format, apiLoad});
            setData(data)
            setAttributes(attributes)
        }

        load()
    }, [format])
    console.log('data', data, attributes)
    return (
        <div>
            <div className={'text-xl text-gray-300 font-semibold'}>Spreadsheet view</div>
            <div className={`grid grid-cols-${attributes.length} divide-x divide-y`}>
                {attributes.map(attribute =>
                    <div className={'p-2 font-semibold text-gray-500'}>
                        {attribute.display_name || attribute.name}
                    </div>)}
                {data.map(d => (
                        attributes.map(attribute => {
                            const Comp = DataTypes[attribute.type]?.ViewComp;
                            return (<Comp className={'p-2 hover:bg-blue-50'} value={d[attribute.name] || ' '} />)
                        })
                    ))}
            </div>
        </div>
    )
             
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}


export default {
    "name": 'Spreadsheet',
    "type": 'table',
    "variables": [
    ],
    getData,
    "EditComp": Edit,
    "ViewComp": Edit
}