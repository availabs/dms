import React, {useMemo, useState, useEffect, useRef} from 'react'
import {useParams, useLocation} from "react-router"
import DataTypes from "../../../../../../data-types";
import {InfoCircle} from "../../../../../admin/ui/icons";
import RenderSwitch from "../shared/Switch";
import {FormsSelector} from "../../FormsSelector";
import {useSearchParams} from "react-router-dom";
import {ColumnControls} from "../shared/ColumnControls";
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
    const attributes = JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [];
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

const Edit = ({value, onChange, size, format: formatFromProps, pageFormat, apiLoad, apiUpdate, siteType, ...rest}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [format, setFormat] = useState(formatFromProps || cachedData.format);
    const [view, setView] = useState(cachedData.view);
    const [showChangeFormatModal, setShowChangeFormatModal] = useState(!formatFromProps); // if you don't get format from props, default set to true
    const [attributes, setAttributes] = useState([]);
    const [orderedAttributes, setOrderedAttributes] = useState(cachedData.orderedAttributes || []);
    const [newItem, setNewItem] = useState();
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);

    const [isSearching, setIsSearching] = useState(false);
    const [searchStr, setSearchStr] = useState('');
    const searchItemsRef = useRef(null);
    const [renderAbove, setRenderAbove] = useState(false);
    const inputRef = useRef(null);

    const [allowEditInView, setAllowEditInView] = useState(cachedData.allowEditInView || false);
    const itemId = searchParams.get('id');
    const dragItem = useRef();
    const dragOverItem = useRef();

    useEffect(() => {
        // if there's no format passed, the user should be given option to select one. to achieve thia, format needs to be a state variable.
        formatFromProps && setFormat(formatFromProps);
    }, [formatFromProps]);

    // ============================================ drag utils begin ===================================================
    const dragStart = (e, position) => {
        dragItem.current = position;
        e.dataTransfer.effectAllowed = "move";
    };

    const dragEnter = (e, position) => {
        dragOverItem.current = position;
    };
    const dragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    const drop = (e) => {
        const copyListItems =
            [
                ...orderedAttributes
            ];
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setOrderedAttributes(copyListItems);
    };
    // ============================================ drag utils end =====================================================

    // ============================================ data load begin ====================================================
    useEffect(() => {
        if(!format || !view) return;
        const originalDocType = format.originalDocType || format.doc_type;
        const doc_type = `${originalDocType}-${view}`
        const view_id = view;
        console.log('setting format', {...format, doc_type, originalDocType, view_id})
        setFormat({...format, doc_type, originalDocType, view_id})
    }, [view])
    useEffect(() => {
        async function load(){
            if(!itemId) return;
            const {data, attributes} = await getData({format: {...format, type: format.doc_type}, apiLoad, itemId});
            setNewItem(data)
            setAttributes(attributes)
        }

        load()
    }, [format, itemId])
    // ============================================ data load end ======================================================

    // ============================================ save begin =========================================================
    useEffect(() => {
        onChange(JSON.stringify({
            ...cachedData, visibleAttributes, orderedAttributes, allowEditInView, format, view
        }))
    }, [visibleAttributes, orderedAttributes, allowEditInView, format, view]);
    // ============================================ save end ===========================================================

    // // ============================================ search handle focus begin ==========================================
    // const checkSpace = () => {
    //     const inputRect = inputRef.current.getBoundingClientRect();
    //     const spaceBelow = window.innerHeight - inputRect.bottom;
    //     const spaceAbove = inputRect.top;
    //
    //     const searchItemsHeight = searchItemsRef.current
    //         ? searchItemsRef.current.offsetHeight
    //         : 0;
    //
    //     // Check if there's more space above or below and set state accordingly
    //     if (spaceBelow < searchItemsHeight && spaceAbove > searchItemsHeight) {
    //         setRenderAbove(true);
    //     } else {
    //         setRenderAbove(false);
    //     }
    // };
    // React.useEffect(() => {
    //     isSearching && checkSpace();
    // }, [isSearching])
    // const handleClickOutside = (e) => {
    //     if (searchItemsRef.current && !searchItemsRef.current.contains(e.target)) {
    //         setIsSearching(false);
    //     }
    // };
    //
    // React.useEffect(() => {
    //     document.addEventListener('mousedown', handleClickOutside);
    //     return () => {
    //         document.removeEventListener('mousedown', handleClickOutside);
    //     };
    // }, []);
    // // ============================================ search handle focus end ============================================

    const updateItem = (value, attribute, d) => {
        return apiUpdate({data: {...d, [attribute.name]: value}, config: {format}})
    }

    // render form selector if no config is passed.
    if(!format?.config) return (
        <div className={'p-1 flex'}>
            Form data not available. Please make a selection:
            <FormsSelector siteType={siteType} apiLoad={apiLoad} app={pageFormat.app} format={format} setFormat={setFormat} view={view} setView={setView} formatFromProps={formatFromProps} />
        </div>
    )

    // if(!itemId){
    //     return <div className={'p-1 flex'}>Invalid item id.</div>
    // }
    return (
        <div>
            {
                showChangeFormatModal ?
                    <FormsSelector siteType={siteType} apiLoad={apiLoad} app={pageFormat.app} format={format} setFormat={setFormat} view={view} setView={setView} formatFromProps={formatFromProps} /> : null
            }

            <ColumnControls attributes={attributes} setAttributes={setAttributes}
                            visibleAttributes={visibleAttributes} setVisibleAttributes={setVisibleAttributes}
                            allowEditInView={allowEditInView} setAllowEditInView={setAllowEditInView}
            />

            <div className={'divide-y'}>
                { // make this a drop down and render only selected columns in the comp
                    (attributes.filter(a => visibleAttributes.includes(a.name)))
                        .map((attribute, i) => {
                            const Comp = DataTypes[attribute.type]?.EditComp || DataTypes.text.EditComp;
                            return (
                                <div
                                    className={`grid grid-cols-3 divide-x rounded-sm ${dragOverItem.current === i ? 'bg-gray-50' : ``}`}
                                    style={{gridTemplateColumns: "15px 1fr 2fr"}}
                                    key={i}
                                    onDragStart={(e) => dragStart(e, i)}
                                    onDragEnter={(e) => dragEnter(e, i)}

                                    onDragOver={dragOver}

                                    onDragEnd={drop}
                                    draggable
                                >
                                    <div className={'flex items-center'}>
                                        <div className={'h-4 w-4 cursor-pointer text-gray-800'}>
                                            <svg data-v-4e778f45=""
                                                 className="nc-icon cursor-move !h-3.75 text-gray-600"
                                                 viewBox="0 0 24 24">
                                                <path fill="currentColor"
                                                      d="M8.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m0 6.5a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0M15.5 7a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3m1.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0m-1.5 8a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3"></path>
                                            </svg>
                                        </div>
                                    </div>
                                    <div className={'w-5/6  flex items-center p-2 font-semibold text-gray-500'}>
                                        {attribute.display_name || attribute.name}
                                        {
                                            attribute.prompt && <InfoCircle className={'text-xs px-1 hover:text-gray-700'}
                                                                            title={attribute.prompt}/>
                                        }
                                    </div>
                                    {
                                        newItem ?
                                            <div className={'relative p-2 text-gray-700 max-w-11/12'}>
                                                <Comp key={`${attribute.name}`}
                                                      className={'border flex flex-wrap w-full p-2 bg-white hover:bg-blue-50 h-fit'}
                                                      {...attribute}
                                                      value={newItem[attribute.name]}
                                                      onChange={e => {
                                                          setNewItem({...newItem, [attribute.name]: e})
                                                          updateItem(e, attribute, {...newItem, [attribute.name]: e})
                                                      }}/>
                                                {/*{typeof newItem[attribute.name] === "object" ? JSON.stringify(newItem[attribute.name]) : newItem[attribute.name]}*/}
                                            </div> : null
                                    }
                            </div>
                        )
                        })
                }
            </div>
        </div>
    )
}

const View = ({value, format:formatFromProps, apiLoad, apiUpdate, ...rest}) => {
    const cachedData = isJson(value) ? JSON.parse(value) : {};
    const [format, setFormat] = useState(formatFromProps || cachedData.format);
    const [visibleAttributes, setVisibleAttributes] = useState(cachedData?.visibleAttributes || []);
    const [orderedAttributes, setOrderedAttributes] = useState(cachedData?.orderedAttributes);
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState({});
    const [tmpItem, setTmpItem] = useState({});
    const [attributes, setAttributes] = useState([])
    const allowEdit = cachedData.allowEditInView;
    const compType = allowEdit ? 'EditComp' : 'ViewComp';
    const itemId = searchParams.get('id') // "add-new-item"

    useEffect(() => {
        // if there's no format passed, the user should be given option to select one. to achieve thia, format needs to be a state variable.
        formatFromProps && setFormat(formatFromProps);
    }, [formatFromProps]);

    useEffect(() => {
        // update value dependent state variables on value change
        const cachedData = isJson(value) ? JSON.parse(value) : {};
        setVisibleAttributes(cachedData?.visibleAttributes || [])
        setOrderedAttributes(cachedData?.orderedAttributes)
    }, [value])
    useEffect(() => {
        async function load() {
            if (itemId === 'add-new-item') {
                setAttributes(orderedAttributes);
                return;
            }
            const {data, attributes} = await getData({format: {...format, type: format.doc_type}, apiLoad, itemId});

            setData(data)
            setTmpItem(data)
            setAttributes(attributes)
        }

        load()
    }, [format])

    const updateItem = async () => {
        const res = await apiUpdate({data: tmpItem, config: {format}});

        if(res?.id && itemId === 'add-new-item'){
            window.location = window.location.href.replace(itemId, res.id);
        }
    }

    return (
        <div>
            <div className={`divide-y w-full`}>
                {
                    (attributes.filter(a => visibleAttributes.includes(a.name)))
                        .map((attribute,i) => {
                            const Comp = DataTypes[attribute.type]?.[compType] || DataTypes.text[compType];
                            return (
                                <div key={i}
                                     className={'group w-full flex flex-row items-center hover:bg-blue-50 rounded-md'}>
                                    <div className={'p-2 w-2/5 truncate text-sm font-bold text-gray-500'}
                                         title={attribute.display_name || attribute.name}>
                                        {attribute.display_name || attribute.name}
                                    </div>
                                    <div className={'relative w-3/5 p-2 text-gray-700'}>
                                        <Comp key={`${attribute.name}`}
                                              className={'flex flex-wrap w-full p-2 bg-white group-hover:bg-blue-50 h-fit'}
                                              {...attribute}
                                              value={tmpItem?.[attribute.name]}
                                              onChange={e => {
                                                  setTmpItem({...tmpItem, [attribute.name]: e})
                                              }}
                                        />
                                    </div>
                                </div>
                            )
                        })
                }
                {
                    allowEdit ?
                        <div className={'w-full flex justify-end gap-1'}>
                            <button className={'px-2 py-0.5 bg-blue-300 hover:bg-blue-600 text-white rounded-md'}
                                    onClick={() => updateItem()}>save
                            </button>
                            <button className={'px-2 py-0.5 bg-red-300 hover:bg-red-600 text-white rounded-md'}
                                    onClick={() => setTmpItem(data)}>cancel
                            </button>
                        </div> : null
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