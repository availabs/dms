import React, { useMemo, useState, useEffect }from 'react'
import {useParams, useLocation} from "react-router"
import DataTypes from "../../../../../../data-types";
export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const getData = async ({format, apiLoad, itemId}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const attributes = JSON.parse(format?.config || '{}')?.attributes || [];
    const children = [{
        type: () => {
        },
        action: 'view',
        path: '/',
        params: {id: itemId}
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        id: itemId,
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
            <Comp key={`${attribute.name}-${i}`} className={'p-1 hover:bg-blue-50 h-fit'}
                  value={newItem[attribute.name]} onChange={e => {
                      setNewItem({...item, [attribute]: e})
                      updateItem(e, attribute, {...item, [attribute]: e})
            }}/>
            {
                isLastCell &&
                <button
                    className={'w-fit p-1 bg-red-300 hover:bg-red-500 text-white'}
                    onClick={e => {
                        removeItem(newItem)
                    }}>x
                </button>
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
                    <div className={'p-2 font-semibold text-gray-500 border'}>
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
                                      className={'p-2 hover:bg-blue-50'}
                                      value={newItem[attribute.name]}
                                      onChange={e => setNewItem({...newItem, [attribute.name]: e})}
                                      onFocus={e => console.log('focusing')}
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
    const params = useParams();
    const [data, setData] = useState([]);
    const [attributes, setAttributes] = useState([])
    const itemId = params['*']?.split('view/')[1];
    console.log('item view', itemId)
    if(!value) return '';

    useEffect(() => {
        async function load(){
            const {data, attributes} = await getData({format, apiLoad, itemId});
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
    "name": 'Item',
    "type": 'table',
    "variables": [
    ],
    getData,
    "EditComp": Edit,
    "ViewComp": View
}