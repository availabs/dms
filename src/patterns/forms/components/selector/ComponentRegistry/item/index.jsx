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
        // path: `/`,
        path: `/form1/view/${itemId}`, // trying to pass params. children need to match with path. this doesn't work.
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

  return {data: data.find(d => d.id === itemId), attributes}
}

const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    const params = useParams();
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [loading, setLoading] = useState(false);
    const [attributes, setAttributes] = useState([]);
    const [newItem, setNewItem] = useState();
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);

    const itemId = params['*']?.split('view/')[1];

    useEffect(() => {
        onChange(JSON.stringify({
            ...cachedData, visibleAttributes
        }))
    }, [visibleAttributes]);

    useEffect(() => {
        async function load(){
            console.log('fetching data.......................')
            setLoading(true)
            const {data, attributes} = await getData({format, apiLoad, itemId});
            setNewItem(data)
            setAttributes(attributes)
            setLoading(false)
        }

        load()
    }, [])
    console.log('new item', newItem)

    const updateItem = (value, attribute, d) => {
        console.log('???????????', d, {...d, [attribute.name]: value})
        return apiUpdate({data: {...d, [attribute.name]: value}, config: {format}})
    }

    if (!newItem) return null;
    return (
        <div>
            <div className={'text-xl text-gray-300 font-semibold'}>Item Edit</div>
            {
                loading && <div className={'w-full h-full absolute'}>Loading...</div>
            }
            <div className={`grid grid-cols-3 divide-x divide-y`}>
                {
                    attributes.map(attribute => {
                        const Comp = DataTypes[attribute.type]?.EditComp;
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
                                           }}
                                    />
                                </div>
                                <div className={'p-2 font-semibold text-gray-500'}>
                                    {attribute.display_name || attribute.name}
                                </div>

                                <div className={'p-2 text-gray-700'}>
                                    <Comp key={`${attribute.name}`} className={'p-1 hover:bg-blue-50 h-fit'}
                                          value={newItem[attribute.name]} onChange={e => {
                                        setNewItem({...newItem, [attribute.name]: e})
                                        updateItem(e, attribute, {...newItem, [attribute.name]: e})
                                    }}/>
                                    {/*{typeof newItem[attribute.name] === "object" ? JSON.stringify(newItem[attribute.name]) : newItem[attribute.name]}*/}
                                </div>
                            </>
                        )
                    })
                }
            </div>
        </div>
    )
}

const View = ({value, format, apiLoad, ...rest}) => {
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);
    const params = useParams();
    const [data, setData] = useState({});
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
    }, [])
    console.log('data???????????????????', data)
    return (
        <div>
            <div className={'text-xl text-gray-300 font-semibold'}>Item View</div>
            <div className={`grid grid-cols-2 divide-x divide-y`}>
                {
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
                                        {typeof data?.[attribute.name] === "object" ? JSON.stringify(data[attribute.name]) : data?.[attribute.name]}
                                    </div>
                                </>
                            )
                        })
                }
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