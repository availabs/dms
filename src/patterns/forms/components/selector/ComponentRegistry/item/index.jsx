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
        path: `/view/${itemId}`,
        params: {id: itemId}
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        params: {id: itemId},
        format,
        attributes,
        children
    });

  return {data: data.filter(d => d.id === itemId), attributes}
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
    const params = useParams();
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [data, setData] = useState([]);
    const [attributes, setAttributes] = useState([])
    const itemId = params['*']?.split('view/')[1];
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);
    // if(!value) return '';

    // useEffect(() => !visibleAttributes?.length && setVisibleAttributes(attributes.map(attr => attr.name)), [attributes]);
    useEffect(() => {
        onChange(JSON.stringify({
            ...cachedData, visibleAttributes
        }))
    }, [visibleAttributes]);

    useEffect(() => {
        async function load(){
            const {data, attributes} = await getData({format, apiLoad, itemId});
            setData(data)
            setAttributes(attributes)
        }

        load()
    }, [format])


    return (
        <div>
            <div className={'text-xl text-gray-300 font-semibold'}>Item Edit</div>
            <div className={`grid grid-cols-3 divide-x divide-y`}>
                {data.map(d => (
                    attributes.map(attribute => {
                        // const Comp = DataTypes[attribute.type]?.ViewComp;
                        return (
                            <>
                                <div className={'p-2 font-semibold text-gray-500'}>
                                    <input type={"checkbox"}
                                           checked={visibleAttributes.includes(attribute.name)}
                                           onChange={e => {
                                               setVisibleAttributes(
                                                   visibleAttributes.includes(attribute.name) ? visibleAttributes.filter(attr => attr !== attribute.name) :
                                                       [attribute.name, ...visibleAttributes]
                                               )
                                               // onChange(JSON.stringify({
                                               //     ...(value || {}),
                                               //     visibleAttributes: visibleAttributes.includes(attribute.name) ? visibleAttributes.filter(attr => attr !== attribute.name) :
                                               //         [...attribute.name, ...visibleAttributes]
                                               // }))
                                           }}
                                    />
                                </div>
                                <div className={'p-2 font-semibold text-gray-500'}>
                                    {attribute.display_name || attribute.name}
                                </div>

                                <div className={'p-2 text-gray-700'}>
                                    {typeof d[attribute.name] === "object" ? JSON.stringify(d[attribute.name]) : d[attribute.name]}
                                </div>
                            </>
                        )
                    })
                ))}
            </div>
        </div>
    )
}

const View = ({value, format, apiLoad, ...rest}) => {
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);
    const params = useParams();
    const [data, setData] = useState([]);
    const [attributes, setAttributes] = useState([])
    const itemId = params['*']?.split('view/')[1];

    // if(!value) return '';

    useEffect(() => {
        async function load(){
            const {data, attributes} = await getData({format, apiLoad, itemId});
            setData(data)
            setAttributes(attributes)
        }

        load()
    }, [format])

    return (
        <div>
            <div className={'text-xl text-gray-300 font-semibold'}>Item View</div>
            <div className={`grid grid-cols-2 divide-x divide-y`}>
                {data.map(d => (
                    attributes
                        .filter(attribute => visibleAttributes.includes(attribute.name))
                        .map(attribute => {
                        // const Comp = DataTypes[attribute.type]?.ViewComp;
                        return (
                            <>
                                <div className={'p-2 font-semibold text-gray-500'}>
                                    {attribute.display_name || attribute.name}
                                </div>

                                <div className={'p-2 text-gray-700'}>
                                    {typeof d[attribute.name] === "object" ? JSON.stringify(d[attribute.name]) : d[attribute.name]}
                                </div>
                            </>
                        )
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
    "variables": [],
    getData,
    "EditComp": Edit,
    "ViewComp": View
}