import React, { useMemo, useState, useEffect }from 'react'
import {useParams, useLocation} from "react-router"
import DataTypes from "../../../../../../data-types";
import {InfoCircle} from "../../../../../admin/ui/icons";
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
        action: 'edit',
        // path: `/`,
        path: `view/:id`, // trying to pass params. children need to match with path. this doesn't work.
        params: {id: itemId}
    }]
    const data = await apiLoad({
        app: format.app,
        type: format.type,
        params: {id: itemId},
        format,
        attributes,
        children,
        // path: `view/:id`,
    }, `/view/${itemId}`);

  // return {data: data[0], attributes}
  return {data: data.find(d => d.id === itemId), attributes}
}

const Edit = ({value, onChange, size, format, apiLoad, apiUpdate, ...rest}) => {
    const params = useParams();
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [attributes, setAttributes] = useState([]);
    const [orderedAttributes, setOrderedAttributes] = useState([]);
    const [newItem, setNewItem] = useState();
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);
    const [searchStr, setSearchStr] = useState('')

    const itemId = params['*']?.split('view/')[1];

    useEffect(() => {
        onChange(JSON.stringify({
            ...cachedData, visibleAttributes
        }))
    }, [visibleAttributes]);

    useEffect(() => {
        async function load(){
            const {data, attributes} = await getData({format, apiLoad, itemId});
            setNewItem(data)
            setAttributes(attributes)
        }

        load()
    }, [itemId])
    //console.log('new item', newItem)

    const updateItem = (value, attribute, d) => {
        return apiUpdate({data: {...d, [attribute.name]: value}, config: {format}})
    }

    if (!newItem || !itemId) return null;
    return (
        <div>
            <div className={`grid grid-cols-3 divide-x divide-y`} style={{gridTemplateColumns: "30px auto auto"}}>
                <input
                    className={'p-2 w-full col-span-3'}
                    type={'text'}
                    onChange={e => setSearchStr(e.target.value)}
                    placeholder={'search...'}
                />
                {
                    attributes
                        .filter(a => !searchStr.length || a.name.toLowerCase().includes(searchStr.toLowerCase()))
                        .map((attribute,i) => {
                        const Comp = DataTypes[attribute.type]?.EditComp || DataTypes.text.EditComp;
                        return (
                            <React.Fragment key={i}>
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
                                <div className={'flex items-center p-2 font-semibold text-gray-500'}>
                                    {attribute.display_name || attribute.name}
                                    {
                                        attribute.prompt && <InfoCircle className={'text-xs px-1 hover:text-gray-700'} title={attribute.prompt} />
                                    }
                                </div>

                                <div className={'relative p-2 text-gray-700 max-w-11/12'}>
                                    <Comp key={`${attribute.name}`} className={'border flex flex-wrap w-full p-2 bg-white hover:bg-blue-50 h-fit'}
                                          {...attribute}
                                          value={newItem[attribute.name]}
                                          onChange={e => {
                                              setNewItem({...newItem, [attribute.name]: e})
                                              updateItem(e, attribute, {...newItem, [attribute.name]: e})
                                          }}/>
                                    {/*{typeof newItem[attribute.name] === "object" ? JSON.stringify(newItem[attribute.name]) : newItem[attribute.name]}*/}
                                </div>
                            </React.Fragment>
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

    return (
        <div>
            <div className={`divide-y w-full`}>
                {
                    attributes
                        .filter(attribute => visibleAttributes.includes(attribute.name))
                        .filter(d => d)
                        .map((attribute,i) => {
                            const Comp = DataTypes[attribute.type]?.ViewComp || DataTypes.text.ViewComp;
                            return (
                                <div key={i}
                                     className={'w-full flex flex-row items-center hover:bg-blue-50 rounded-md'}>
                                    <div className={'p-2 w-2/5 truncate text-sm font-bold text-gray-500'}
                                         title={attribute.display_name || attribute.name}>
                                        {attribute.display_name || attribute.name}
                                    </div>
                                    <div className={'relative w-3/5 p-2 text-gray-700'}>
                                        <Comp key={`${attribute.name}`}
                                              className={'border flex flex-wrap w-full p-2 bg-white hover:bg-blue-50 h-fit'}
                                              {...attribute}
                                              value={data?.[attribute.name]}
                                        />
                                        {/*{typeof newItem[attribute.name] === "object" ? JSON.stringify(newItem[attribute.name]) : newItem[attribute.name]}*/}
                                    </div>
                                </div>
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