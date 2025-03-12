import React, {useState, useEffect, useRef, createContext} from 'react'
import DataTypes from "../../../../../../../data-types";
import {InfoCircle} from "../../../../../../admin/ui/icons";
import {DataSourceSelector} from "../DataSourceSelector";
import {useSearchParams} from "react-router-dom";
import {useImmer} from "use-immer";
import ColumnControls from "./controls/ColumnControls";
import MoreControls from "./controls/MoreControls";

export const convertOldState = (state, initialState) => {
    const oldState = isJson(state) ? JSON.parse(state) : {};
    if(oldState?.sourceInfo) return oldState; // return already valid state.

    if(!Array.isArray(oldState?.orderedAttributes)) {
        return initialState
    }
    // console.log('old state', oldState.visibleAttributes.filter(name => oldState.orderedAttributes.find(oa => oa.name === name)))
    const columns = oldState.visibleAttributes
        .filter(column => oldState.orderedAttributes.find(attribute => attribute.name === column))
        .map(column => ({
        ...(oldState.orderedAttributes.find(attribute => attribute.name === column)),
        customName: oldState.customColNames?.[column.name],
        show: true
        }))

    const display = {
        allowEditInView: oldState.allowEditInView,
    }
    const view_id = typeof oldState.format?.view_id === "object" ? oldState.format?.view_id?.id : oldState.format?.view_id
    const sourceInfo = {
        app: oldState.format?.app,
        type: oldState.format?.type,
        isDms: oldState.format?.isDms,
        env: oldState.format?.env,
        srcEnv: oldState.format?.srcEnv,
        source_id: oldState.format?.id,
        view_id: typeof oldState.format?.view_id === "object" ? oldState.format?.view_id?.id : oldState.format?.view_id,
        view_name: oldState.format?.version || oldState.format?.name,
        updated_at: oldState.format?._modified_timestamp || oldState.format?.updated_at,
        columns: oldState.orderedAttributes || [],
    }
    const dataRequest = {}
    return {columns, display, sourceInfo, dataRequest, data: oldState.data || []};
}
const initialState = {
    data: {},
    columns: [],
    display: {
        allowEditInView: false,
    },
    sourceInfo: {

    }
}
const ItemContext = createContext({});

export const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const getData = async ({state, apiLoad, itemId}) =>{
    // fetch all data items based on app and type. see if you can associate those items to its pattern. this will be useful when you have multiple patterns.
    const children = [{
        type: () => {
        },
        action: 'edit',
        path: `view/:id`,
        params: {id: itemId},
        filter: {
            attributes: state?.columns?.filter(({show}) => show).map(({name}) => name),
            stopFullDataLoad: true
        },
    }]

    const config= {
        params: {id: itemId},
        format: {
            ...state.sourceInfo,
            attributes: state?.columns?.filter(({show}) => show).map(attr => ({...attr, type: attr.type === 'multiselect' ? 'json' : attr.type, key: attr.name})),
            type: state.sourceInfo?.type?.includes(`-${state.sourceInfo.view_id}`) ? state.sourceInfo.type : `${state.sourceInfo.type}-${state.sourceInfo.view_id}`,
        },
        children,
    }
    const data = await apiLoad(config, `/view/${itemId}`);
  return {data: data.find(d => d.id === itemId)}
}

const Edit = ({value, onChange, size, format: formatFromProps, pageFormat, apiLoad, apiUpdate, ...rest}) => {
    const [state, setState] = useImmer(convertOldState(value, initialState));
    const [searchParams] = useSearchParams();

    const [newItem, setNewItem] = useState();
    const itemId = searchParams.get('id');

    // ============================================ data load begin ====================================================
    useEffect(() => {
        async function load(){
            if(!itemId) return;
            const {data} = await getData({state, apiLoad, itemId});
            setNewItem(data)
            setState(draft => {
                draft.data = data
            })
        }
        load()
    }, [itemId, state.columns])
    // ============================================ data load end ======================================================

    // ============================================ save begin =========================================================
    useEffect(() => {
        onChange(JSON.stringify(state));
    }, [state]);
    // ============================================ save end ===========================================================

    const updateItem = (value, attribute, d) => {
        console.log('update item', value, attribute, d)
        return apiUpdate({data: {...d, [attribute.name]: value},  config: {format: state.sourceInfo}})
    }

    // if(!itemId){
    //     return <div className={'p-1 flex'}>Invalid item id.</div>
    // }
    console.log('state', state)
    return (
       <ItemContext.Provider value={{state, setState, compType: 'item'}}>
           <div>
              <DataSourceSelector apiLoad={apiLoad} app={pageFormat?.app}
                                  state={state} setState={setState}
                       />
               <div className={'flex items-center'}>
                   <ColumnControls context={ItemContext} />
                   <MoreControls context={ItemContext} />
               </div>

               <div className={'divide-y'}>
                   {
                       state.columns
                           .filter(({show}) => show)
                           .map((attribute, i) => {
                               const Comp = DataTypes[attribute.type]?.EditComp || DataTypes.text.EditComp;
                               return (
                                   <div
                                       className={`grid grid-cols-3 divide-x rounded-sm`}
                                       style={{gridTemplateColumns: "15px 1fr 2fr"}}
                                       key={i}
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
       </ItemContext.Provider>
    )
}

const View = ({value, format:formatFromProps, apiLoad, apiUpdate, ...rest}) => {
    const [state, setState] = useImmer(convertOldState(value));
    const [searchParams, setSearchParams] = useSearchParams();
    const [tmpItem, setTmpItem] = useState({});
    const compType = state.display?.allowEditInView ? 'EditComp' : 'ViewComp';
    const itemId = searchParams.get('id') // "add-new-item"

    useEffect(() => {
        async function load() {
            if (itemId === 'add-new-item' || !itemId) return;

            const {data} = await getData({state, apiLoad, itemId});
            setState(draft => {
                draft.data = data
            })
            setTmpItem(data)
        }

        load()
    }, [itemId])

    const updateItem = async () => {
        const res = await apiUpdate({data: tmpItem,  config: {format: {...state.sourceInfo, type: `${state.sourceInfo.type}-${state.sourceInfo.view_id}`}}});
        if(res?.id && itemId === 'add-new-item'){
            window.location = window.location.href.replace(itemId, res.id);
        }

        if(res?.id && !itemId){
            window.location = `${window.location.href}?id=${res.id}`;
        }
    }

    return (
        <div>
            <div className={`divide-y w-full`}>
                {
                    state.columns
                        .filter(({show}) => show)
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
                    state.display?.allowEditInView ?
                        <div className={'w-full flex justify-end gap-1'}>
                            <button className={'px-2 py-0.5 bg-blue-300 hover:bg-blue-600 text-white rounded-md'}
                                    onClick={() => updateItem()}>save
                            </button>
                            <button className={'px-2 py-0.5 bg-red-300 hover:bg-red-600 text-white rounded-md'}
                                    onClick={() => setTmpItem(state.data)}>cancel
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