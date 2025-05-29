import React, {useState, useEffect, useMemo, useRef, useCallback, useContext} from 'react'
import writeXlsxFile from 'write-excel-file';

import { isEqual } from "lodash-es";
import { v4 as uuidv4 } from 'uuid';


//import { getData, useHandleClickOutside } from "./utils/utils";
import { RenderFilters } from "./components/filters/RenderFilters";
import { Attribution } from "./components//Attribution";
// import { Pagination } from "../ComponentRegistry/shared/Pagination";
// import { DataSourceSelector } from "../ComponentRegistry/DataSourceSelector";
// import { Controls } from "./components/Controls";
//import { convertOldState } from "./utils/convertOldState";
// import {  } from "../ComponentRegistry/shared/utils";
import { ComponentContext } from "../../../../context";
import { produce, freeze } from "immer";


const Icon = () => <div/>
//const RenderFilters = () => <div/>
// const Attribution = () => <div/>
// const Pagination = () => <div/>
// const DataSourceSelector = () => <div/>
// const Controls = () => <div/>
// const useImmer = (d) => d
// const convertOldState = (d) => {d}
// const useHandleClickOutside = () => {}
const getData = () => {} 
function useImmer(initialValue) {
  const [val, updateValue] = useState(() =>
    freeze(
      typeof initialValue === "function" ? initialValue() : initialValue,
      true
    )
  );
  return [
    val,
    useCallback((updater) => {
      if (typeof updater === "function") updateValue(produce(updater));
      else updateValue(freeze(updater));
    }, []),
  ];
}



const getCurrDate = () => {
    const options = {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
    };
    return new Date().toLocaleDateString(undefined, options);
};


const triggerDownload = async ({state, apiLoad, loadAllColumns, setLoading}) => {
    setLoading(true);
    const tmpState = loadAllColumns ?
        {
            ...state,
            columns: [
                ...state.columns,
                ...state.sourceInfo.columns.filter(originalColumn => !state.columns.find(c => c.name === originalColumn.name))
            ].map(c => ({...c, show: true}))
        } : state;
    const {data} = await getData({
        state: tmpState,
        apiLoad, fullDataLoad: true});

    const schema = tmpState.columns.map(({name, display_name, customName}) => ({
        column: customName || display_name || name,
        // type: String,
        value: data => data?.[name],
        // ...name === 'url' && {'hyperlink': data => data?.[name]}
    }));

    const filterStr = Object.keys(state.dataRequest?.filter || {}).length ? JSON.stringify(state.dataRequest.filter) : '';
    const fileName = `${state.sourceInfo.view_name} - ${filterStr} - ${getCurrDate()}`;

    await writeXlsxFile(data, {
        schema,
        fileName: `${fileName}.xlsx`,
    });
    setLoading(false);
}
const RenderDownload = ({state, apiLoad}) => {
    // two options:
    // 1. download visible columns: add primary column if set
    // 2. download all columns: unavailable for grouped mode
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const menuRef = useRef(null);
    const menuBtnId = loading ? `loading` : `download-btn`;
    const icon = loading ? 'LoadingHourGlass' : 'Download';
    const isGrouping = state.dataRequest?.groupBy?.length;
    useHandleClickOutside(menuRef, menuBtnId, () => setOpen(false));

    if(!state.display.allowDownload) return;
    return (
        <div className={''}>
            <div className={'relative flex flex-col'}>
                <div className={'w-fit p-2 border rounded-full '}>
                    <Icon id={menuBtnId}
                          icon={icon}
                          className={`text-slate-400 hover:text-blue-500 size-4 ${loading ? 'hover:cursor-wait' : 'hover:cursor-pointer'} transition ease-in-out duration-200`}
                          onClick={() => {!loading && setOpen(!open)}}
                          title={loading ? 'Processing...' : 'Excel Download'} />
                </div>
                <div ref={menuRef} className={open ? 'absolute right-0 mt-4 p-0.5 text-xs text-nowrap select-none bg-white shadow-lg rounded-md z-[10]' : 'hidden'}>
                    <div className={`px-1 py-0.5 hover:bg-blue-50 ${loading ? 'hover:cursor-wait' : 'hover:cursor-pointer'} rounded-md`} onClick={() => {
                        setOpen(false);
                        return triggerDownload({state, apiLoad, loading, setLoading});
                    }}>Visible Columns</div>
                    {
                        isGrouping ? null : (
                            <div className={`px-1 py-0.5 hover:bg-blue-50 ${loading ? 'hover:cursor-wait' : 'hover:cursor-pointer'} rounded-md`} onClick={() => {
                                setOpen(false);
                                return triggerDownload({state, apiLoad, loading, setLoading, loadAllColumns: true})
                            }}>All Columns</div>
                        )
                    }
                </div>
            </div>
        </div>
    )
}


const Edit = ({value, onChange, pageFormat, apiUpdate, component, hideSourceSelector}) => {
    const isEdit = Boolean(onChange);
    // const [state, setState] = useImmer(convertOldState(value, initialState(component.defaultState)));
    const {state, setState, apiLoad} = useContext(ComponentContext);
    const [loading, setLoading] = useState(false);
    const [newItem, setNewItem] = useState({})
    const [currentPage, setCurrentPage] = useState(0);
    const isValidState = Boolean(state?.dataRequest);
    const Comp = useMemo(() => component.EditComp, [component]);
    // ========================================= init comp begin =======================================================
    // useSetDataRequest
    console.time(`datawrapper edit render time`)
    useEffect(() => {
        // creates data request object
        if(!isValidState) return;
        let isStale = false;

        // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
        const filterOptions = state.columns.reduce((acc, column) => {
            const isNormalisedColumn = state.columns.filter(col => col.name === column.name && col.filters?.length).length > 1;

            (column.filters || [])
                .filter(({values}) => Array.isArray(values) && values.every(v => typeof v === 'string' ? v.length : typeof v !== 'object'))
                .forEach(({type, operation, values, fn}) => {
                    // here, operation is filter, exclude, >, >=, <, <=.
                    // normal columns only support filter.
                    if(isNormalisedColumn){
                        (acc.normalFilter ??= []).push({ column: column.name, values, operation, fn });
                    }else{
                        acc[operation] = {...acc[operation] || {}, [column.name]: values};
                    }

                })

            if(column.excludeNA){
                acc.exclude = acc.exclude && acc.exclude[column.name] ?
                    {...acc.exclude, [column.name]: [...acc.exclude[column.name], 'null']} :
                    {...acc.exclude || [], [column.name]: ['null']}

            }
            return acc;
        }, {})
        const newDataReq = {
            // visibleColumns: state.columns.filter(column => column.show),
            ...filterOptions,
            groupBy: state.columns.filter(column => column.group).map(column => column.name),
            orderBy: state.columns.filter(column => column.sort).reduce((acc, column) => ({...acc, [column.name]: column.sort}), {}),
            fn: state.columns.filter(column => column.fn).reduce((acc, column) => ({...acc, [column.name]: column.fn}), {}),
            meta: state.columns.filter(column => column.show && 
                                                 ['meta-variable', 'geoid-variable', 'meta'].includes(column.display) && 
                                                 column.meta_lookup)
                               .reduce((acc, column) => ({...acc, [column.name]: column.meta_lookup}), {})
        }

        if(isStale || isEqual(newDataReq, state.dataRequest)) return;

        setState(draft => {
            draft.dataRequest = newDataReq;
        })
        // todo: save settings such that they can be directly used by getData and getLength

        return () => {
            isStale = true;
        }
    }, [state?.columns, isValidState])

    // // ========================================== get data begin =======================================================
    // uweGetDataOnSettingsChange
    useEffect(() => {
        // calls getdata using data request object
        if(!isValidState) return;
        // only run when controls or source/view change
        let isStale = false;
        async function load() {
            setLoading(true)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.
            const {length, data, invalidState} = await getData({state, apiLoad, fullDataLoad: component.fullDataLoad});
            if(isStale) {
                setLoading(false);
                return;
            }
            setState(draft => {
                draft.data = data;
                draft.display.totalLength = length;
                draft.display.invalidState = invalidState;
            })
            setCurrentPage(newCurrentPage);
            setLoading(false)
        }

        load()
        return () => {
            isStale = true;
        };
    }, [state.columns.length,
        state.dataRequest,
        state.sourceInfo.source_id,
        state.sourceInfo.view_id,
        state.display.pageSize,
        isValidState]);

    // useGetDataOnPageChange
    const onPageChange = (currentPage) => {
        if(!isValidState || !component.useGetDataOnPageChange) return;
        // only run when page changes
        let isStale = false;
        async function load() {
            setLoading(true)
            const {length, data} = await getData({state, currentPage, apiLoad});
            if(isStale) {
                setLoading(false);
                return;
            }
            setState(draft => {
                // on page change append data unless using pagination
                draft.data =  state.display.usePagination ? data : [...draft.data.filter(r => !r.totalRow), ...data];
                draft.display.totalLength = length;
            })
            setLoading(false)
        }

        return load()
    }

    // useInfiniteScroll
    useEffect(() => {
        // infinite scroll watch
        if(!isValidState || !component.useInfiniteScroll) return;
        // observer that sets current page on scroll. no data fetching should happen here
        const observer = new IntersectionObserver(
            async (entries) => {
                const hasMore = (currentPage * state.display.pageSize + state.display.pageSize) < state.display.totalLength;
                if (state.data.length && entries[0].isIntersecting && hasMore) {
                    setCurrentPage(prevPage => prevPage+1)
                    await onPageChange(currentPage + 1)
                }
            },
            { threshold: 0 }
        );

        const target = document.querySelector(`#${state.display.loadMoreId}`);

        if (target && !state.display.usePagination) observer.observe(target);
        // unobserve if using pagination
        if (target && state.display.usePagination) observer.unobserve(target);
        // return () => {
        //     if (target) observer.unobserve(target);
        // };
    }, [state.display?.loadMoreId, state.display?.totalLength, state.data?.length, state.display?.usePagination]);
    // // =========================================== get data end ========================================================

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit || !isValidState  || isEqual(value, JSON.stringify(state))) return;
        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
        if(!state.sourceInfo?.isDms) return;

        if(attribute?.name){
            setState(draft => {
                const idx = draft.data.findIndex(draftD => draftD.id === d.id);
                if(idx !== -1){
                    draft.data[idx] = {...(draft.data[idx] || {}), ...d, [attribute.name]: value}
                }
            })
            return apiUpdate({data: {...d, [attribute.name]: value},  config: {format: state.sourceInfo}})
        }else{
            let dataToUpdate = Array.isArray(d) ? d : [d];

            let tmpData = [...state.data];
            dataToUpdate.map(dtu => {
                const i = state.data.findIndex(dI => dI.id === dtu.id);
                tmpData[i] = dtu;
            });
            setState(draft => {
                draft.data = tmpData
            });
            return Promise.all(dataToUpdate.map(dtu => apiUpdate({data: dtu, config: {format: state.sourceInfo}})));
        }
    }

    const addItem = async () => {
        if(!state.sourceInfo?.isDms || !apiUpdate) return;
        const res = await apiUpdate({data: newItem, config: {format: {...state.sourceInfo, type: `${state.sourceInfo.type}-${state.sourceInfo.view_id}`}}});

        if(res?.id){
            setState(draft => {
                draft.data.push({...newItem, id: res.id})
            })
        }

        setNewItem({})
        return res;
    }

    const removeItem = item => {
        if(!state.sourceInfo?.isDms) return;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: state.sourceInfo}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================


    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);


    return (
            <div className={'w-full h-full'}>
                <div className={'w-full flex items-center place-content-end'}>
                    {loading ? <Icon id={'loading'}
                                     icon={'LoadingHourGlass'}
                                     className={`text-slate-400 hover:text-blue-500 size-4 transition ease-in-out duration-200`} /> :
                        state.display.invalidState ? <span className={'text-red-500'}>{state.display.invalidState}</span> : null
                    }
                    <RenderDownload state={state} apiLoad={apiLoad}/>
                </div>
                <Comp isEdit={isEdit}
                  {...['Spreadsheet', 'Card'].includes(component.name) && {
                      newItem, setNewItem,
                      updateItem, removeItem, addItem,
                      currentPage, loading, isEdit,
                      allowEdit: state.sourceInfo?.isDms && !groupByColumnsLength
                  }}
                />
                <div>
                    {/*Pagination*/}
                    <Pagination currentPage={currentPage} setCurrentPage={i => {
                        setCurrentPage(i)
                        return onPageChange(i);
                    }} showPagination={component.showPagination}/>
                    {/*/!*Attribution*!/*/}
                    {state.display.showAttribution ? <Attribution/> : null}
                </div>
            </div>
    )
}

const View = ({value, onChange, size, apiUpdate, component, ...rest}) => {
    const isEdit = false;
    const {state, setState, apiLoad} = useContext(ComponentContext);

    const [newItem, setNewItem] = useState({})
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);
    const showChangeFormatModal = !state?.sourceInfo?.columns;
    const isValidState = state?.dataRequest; // new state structure
    const Comp = useMemo(() => component.ViewComp, [component]);
    // const useCache = state.display.useCache //=== false ? false : true; // false: loads data on load. can be expensive. useCache can be undefined for older components.
    const setReadyToLoad = useCallback(() => setState(draft => {draft.display.readyToLoad = true}), [setState]);
    //console.time(`datawrapper view render time`)
    useEffect(() => {
        const newState = convertOldState(value)
        setState(newState)
    }, [value]);

    // ====================================== data fetch triggers begin ================================================
    // filters, sort, page change, draft.readyToFetch
    // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
    const filterOptions = useMemo(() => state.columns.reduce((acc, column) => {
        const isNormalisedColumn = state.columns.filter(col => col.name === column.name && col.filters?.length).length > 1;

        (column.filters || [])
            .filter(({values}) => Array.isArray(values) && values.every(v => typeof v === 'string' ? v.length : typeof v !== 'object'))
            .forEach(({type, operation, values, fn}) => {
                // here, operation is filter, exclude, >, >=, <, <=.
                // normal columns only support filter.
                if(isNormalisedColumn){
                    (acc.normalFilter ??= []).push({ column: column.name, values, operation, fn });
                }else{
                    acc[operation] = {...acc[operation] || {}, [column.name]: values};
                }

            })

        if(column.excludeNA){
            acc.exclude = acc.exclude && acc.exclude[column.name] ?
                {...acc.exclude, [column.name]: [...acc.exclude[column.name], 'null']} :
                {...acc.exclude || [], [column.name]: ['null']}
        }


        return acc;
    }, {}), [state.columns]);
    // if search params are being used, readyToLoad = true;
    // if search params are being used, ideally for template pages you should only fetch on filter change
    // for other pages, all data should be fetched

    const orderBy = useMemo(() => state.columns.filter(column => column.sort).reduce((acc, column) => ({...acc, [column.name]: column.sort}), {}), [state.columns]);
    // ======================================= data fetch triggers end =================================================

    // ========================================== get data begin =======================================================
    useEffect(() => {
        if(!isValidState || (!state.display.readyToLoad && !state.display.allowEditInView)) return;
        let isStale = false;

        const newDataReq = {
            ...state.dataRequest || {},
            ...filterOptions,
            orderBy,
            meta: state.columns.filter(column => column.show &&
                ['meta-variable', 'geoid-variable', 'meta'].includes(column.display) &&
                column.meta_lookup)
                .reduce((acc, column) => ({...acc, [column.name]: column.meta_lookup}), {})
        }

        if(isStale || isEqual(newDataReq, state.dataRequest)) return;

        setState(draft => {
            draft.dataRequest = newDataReq;
        })

        return () => {
            isStale = true;
        }
    }, [filterOptions, orderBy, isValidState, state.display.readyToLoad, state.display.allowEditInView])

    // uweGetDataOnSettingsChange
    useEffect(() => {
        if(!isValidState || (!state.display.readyToLoad && !state.display.allowEditInView)) return;
        // only run when controls or source/view change
        let isStale = false;
        async function load() {
            setLoading(true)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.

            const {length, data} = await getData({state, apiLoad, fullDataLoad: component.fullDataLoad});
            if(isStale) {
                setLoading(false);
                return;
            }

            setState(draft => {
                draft.data = data;
                draft.display.totalLength = length;
            })
            setCurrentPage(newCurrentPage);
            setLoading(false)
        }

        load()
        return () => {
            isStale = true;
        };
    }, [state?.dataRequest, isValidState, state.display.readyToLoad, state.display.allowEditInView]);

    // useGetDataOnPageChange
    const onPageChange = (currentPage) => {
        if(!isValidState || !component.useGetDataOnPageChange || (!state.display.readyToLoad && !state.display.allowEditInView)) return;
        // only run when page changes
        let isStale = false;
        async function load() {
            setLoading(true)

            const {length, data} = await getData({state, currentPage, apiLoad});

            if(isStale) {
                setLoading(false);
                return;
            }
            setState(draft => {
                // on page change append data unless using pagination
                draft.data =  state.display.usePagination ? data : [...draft.data.filter(r => !r.totalRow), ...data];
                draft.display.totalLength = length;
            })
            setLoading(false)
        }

        return load()
    }

    // useInfiniteScroll
    useEffect(() => {
        if(!isValidState || !component.useInfiniteScroll) return;
        // observer that sets current page on scroll. no data fetching should happen here
        const observer = new IntersectionObserver(
            async (entries) => {
                const hasMore = (currentPage * state.display.pageSize + state.display.pageSize) < state.display.totalLength;
                if (state.data.length && entries[0].isIntersecting && hasMore) {
                    setCurrentPage(prevPage => prevPage+1)
                    await onPageChange(currentPage+1);
                }
            },
            { threshold: 0 }
        );

        const target = document.querySelector(`#${state.display.loadMoreId}`);
        if (target && !state.display.usePagination) observer.observe(target);
        // unobserve if using pagination
        if (target && state.display.usePagination) observer.unobserve(target);

        // return () => {
        //     if (target) observer.unobserve(target);
        // };
    }, [state?.display?.loadMoreId, state?.display?.totalLength, state?.data?.length, state?.display?.usePagination, isValidState]);
    // =========================================== get data end ========================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
        if(!state.sourceInfo?.isDms || !apiUpdate) return;

        if(attribute?.name){
            setState(draft => {
                const idx = draft.data.findIndex(draftD => draftD.id === d.id);
                if(idx !== -1){
                    draft.data[idx] = {...(draft.data[idx] || {}), ...d, [attribute.name]: value}
                }
            })
            return apiUpdate({data: {...d, [attribute.name]: value},  config: {format: state.sourceInfo}})
        }else{
            let dataToUpdate = Array.isArray(d) ? d : [d];

            let tmpData = [...state.data];
            dataToUpdate.map(dtu => {
                const i = state.data.findIndex(dI => dI.id === dtu.id);
                tmpData[i] = dtu;
            });
            setState(draft => {
                draft.data = tmpData
            });
            return Promise.all(dataToUpdate.map(dtu => apiUpdate({data: dtu, config: {format: state.sourceInfo}})));
        }
    }

    const addItem = async () => {
        if(!state.sourceInfo?.isDms || !apiUpdate) return;
        const res = await apiUpdate({data: newItem, config: {format: {...state.sourceInfo, type: `${state.sourceInfo.type}-${state.sourceInfo.view_id}`}}});

        if(res?.id){
            setState(draft => {
                draft.data.push({...newItem, id: res.id})
            })
        }

        setNewItem({})
        return res;
    }

    const removeItem = item => {
        if(!state.sourceInfo?.isDms || !apiUpdate) return;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: state.sourceInfo}, requestType: 'delete'})
    }
    //console.timeEnd(`datawrapper view render time`)
    // =========================================== util fns end ========================================================
    if(showChangeFormatModal || !isValidState) return <div className={'p-1 text-center'}>Form data not available.</div>;
    // component.name === 'Spreadsheet' && console.log('dw?', state)
    return (
            <div className={'w-full h-full'}>
                <div className={'w-full'}>
                    {/*
                        --this causes page jitter (contents moving up and down), 
                        -- if we want a loading indicator, its probably by component
                        -- and it needs to be absolutely positioned
                        <span className={'text-xs'}>{loading ? 'loading...' : state.display.invalidState ? state.display.invalidState : null}</span>
                    */}
                    <div className={'w-full flex items-center place-content-end'}>
                        {loading ?  <Icon id={'loading'}
                                          icon={'LoadingHourGlass'}
                                          className={`text-slate-400 hover:text-blue-500 size-4 transition ease-in-out duration-200`} /> : null}
                        <RenderDownload state={state} apiLoad={apiLoad}/>
                    </div>
                    <Comp isEdit={isEdit}
                          {...['Spreadsheet', 'Card'].includes(component.name) && {
                              newItem, setNewItem,
                              updateItem, removeItem, addItem,
                              currentPage, loading, isEdit,
                              allowEdit: groupByColumnsLength ? false : state.sourceInfo?.isDms && state.display.allowEditInView && Boolean(apiUpdate)
                          }}
                    />
                    <div>
                        {/*Pagination*/}
                        <Pagination currentPage={currentPage} setCurrentPage={i => {
                            setCurrentPage(i)
                            return onPageChange(i);
                        }} setReadyToLoad={setReadyToLoad} showPagination={component.showPagination}/>
                        {/*Attribution*/}
                        {state.display.showAttribution ? <Attribution/> : null}
                    </div>
                </div>
            </div>)
}

export default {
    EditComp: Edit,
    ViewComp: View
}
