import React, {useState, useEffect, createContext, useMemo, useRef} from 'react'
import writeXlsxFile from 'write-excel-file';
import { RenderTable } from "./components/SimpleSpreadsheet";
import {Pagination} from "./components/Pagination";
import {getData} from "./utils/utils";
import {RenderFilters} from "../shared/filters/RenderFilters";
import {RenderAttribution} from "./components/RenderAttribution";
import {FormsSelector} from "../FormsSelector";
import {ColumnControls} from "../shared/ColumnControls";
import {Card} from "../Card";
import {Graph} from "../graph"
import { isEqual } from "lodash-es";
import { v4 as uuidv4 } from 'uuid';
import {useImmer} from "use-immer";
import {convertOldState} from "./utils/convertOldState";
import {Download, LoadingHourGlass} from "../../../../icons";
import {useHandleClickOutside} from "../shared/utils";
import {getColorRange} from "../graph/GraphComponent";
export const SpreadSheetContext = React.createContext({});
const DefaultPalette = getColorRange(20, "div7");
const graphOptions = {
    graphType: 'BarGraph',
    groupMode: 'stacked',
    orientation: 'vertical',
    title: {
        title: "",
        position: "start",
        fontSize: 32,
        fontWeight: "bold"
    },
    description: "",
    bgColor: "#ffffff",
    textColor: "#000000",
    colors: {
        type: "palette",
        value: [...DefaultPalette]
    },
    height: 300,
    width: undefined,
    margins: {
        marginTop: 20,
        marginRight: 20,
        marginBottom: 50,
        marginLeft: 100
    },
    xAxis: {
        label: "",
        rotateLabels: false,
        showGridLines: false,
        tickSpacing: 1
    },
    yAxis: {
        label: "",
        showGridLines: true,
        tickFormat: "Integer"
    },
    legend: {
        show: true,
        label: "",
    },
    tooltip: {
        show: true,
        fontSize: 12
    }
}
const initialState = compType => {
    const otherOptions = {
        allowSearchParams: false,
        usePagination: true,
        pageSize: 5,
        totalLength: 0,
        showGutters: false,
        transform: '', // transform fn to be applied
        loadMoreId:`id${uuidv4()}`,
    }
    return {
        dataRequest: {},
        columns: [
            //     visible columns or Actions
            //     {name, display_name, custom_name,
            //      justify, width, fn,
            //      groupBy: t/f, orderBy: t/f, excludeNull: t/f, openOut: t/f,
            //      formatFn, fontSize, hideHeader, cardSpan,
            //      isLink: t/f, linkText: ‘’, linkLocation: ‘’, actionName, actionType, icon,
            //      }
        ],
        data: [],
        display: compType === 'graph' ? graphOptions : otherOptions,
        sourceInfo: {
            columns: [],
            // pgEnv,
            // source_id
            // view_id
            // version,
            // doc_type, type -- should be the same
        }
    }
}

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
    const fileName = `${state.sourceInfo.view_name || Date.now()}`;

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
    const menuBtnId = `download-btn`;
    const Icon = loading ? LoadingHourGlass : Download;
    const isGrouping = state.dataRequest?.groupBy?.length;
    useHandleClickOutside(menuRef, menuBtnId, () => setOpen(false));

    if(!state.display.allowDownload) return;
    return (
        <div className={'pt-2'}>
            <div className={'relative flex flex-col'}>
                <Icon id={menuBtnId}
                      className={`p-0.5 inline-flex text-blue-300 hover:text-blue-500 hover:bg-zinc-950/5 rounded-md ${loading ? 'hover:cursor-wait' : 'hover:cursor-pointer'} transition ease-in-out duration-200`}
                      onClick={() => {!loading && setOpen(!open)}}
                      title={loading ? 'Processing...' : 'Excel Download'}
                      width={20} height={20}/>
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


const Edit = ({value, onChange, pageFormat, apiLoad, apiUpdate, compType='spreadsheet', hideSourceSelector}) => {
    const isEdit = Boolean(onChange);
    const [state, setState] = useImmer(convertOldState(value, initialState(compType)));
    const [loading, setLoading] = useState(false);
    const [newItem, setNewItem] = useState({})
    const [currentPage, setCurrentPage] = useState(0);
    const isValidState = Boolean(state?.dataRequest);
    const Comp = useMemo(() => compType === 'card' ? Card : compType === 'graph' ? Graph : undefined, [compType]);
    // ========================================= init comp begin =======================================================
    // useSetDataRequest
    useEffect(() => {
        if(!isValidState) return;
        let isStale = false;

        // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
        const filterOptions = state.columns.reduce((acc, column) => {
            (column.filters || []).forEach(({type, operation, values}) => {
                acc[operation] = {...acc[operation] || {}, [column.name]: values};
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
    }, [state.columns, isValidState])

    // // ========================================== get data begin =======================================================
    // uweGetDataOnSettingsChange
    useEffect(() => {
        if(!isValidState) return;
        // only run when controls or source/view change
        let isStale = false;
        async function load() {
            setLoading(true)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.
            const {length, data, invalidState} = await getData({state, apiLoad, fullDataLoad: compType === 'graph'});
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
    useEffect(() => {
        if(!isValidState || compType === 'graph') return;
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
                draft.data =  state.display?.usePagination ? data : [...draft.data.filter(r => !r.totalRow), ...data];
                draft.display.totalLength = length;
            })
            setLoading(false)
        }

        load()

        return () => {
            isStale = true;
        }
    }, [currentPage]);

    // useInfiniteScroll
    useEffect(() => {
        if(!isValidState || compType === 'graph') return;
        // observer that sets current page on scroll. no data fetching should happen here
        const observer = new IntersectionObserver(
            async (entries) => {
                const hasMore = (currentPage * state.display.pageSize + state.display.pageSize) < state.display.totalLength;
                if (state.data.length && entries[0].isIntersecting && hasMore) {
                    setCurrentPage(prevPage => prevPage+1)
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
        if (!isEdit || !isValidState) return;
        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    // =========================================== util fns begin ======================================================
    const updateItem = (value, attribute, d) => {
        if(!state.sourceInfo?.isDms) return;
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

    const addItem = () => {
        if(!state.sourceInfo?.isDms) return;
        setState(draft => {
            draft.data.push(newItem)
        })
        return apiUpdate({data: newItem, config: {format: state.sourceInfo}}) && setNewItem({})
    }

    const removeItem = item => {
        if(!state.sourceInfo?.isDms) return;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: state.sourceInfo}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================
    return (
        <SpreadSheetContext.Provider value={{state, setState, apiLoad, compType}}>
            <div className={'w-full h-full'}>
                {
                    !hideSourceSelector ?
                        <FormsSelector apiLoad={apiLoad} app={pageFormat?.app}
                                       state={state} setState={setState} // passing as props as other components will use it as well.
                        /> : null
                }
                {
                    isEdit ?
                        <ColumnControls /> : null
                }

                <div className={'w-full pt-2 flex justify-end gap-2'}>
                    <RenderFilters state={state} setState={setState} apiLoad={apiLoad} isEdit={isEdit} defaultOpen={true} />
                    <RenderDownload state={state} apiLoad={apiLoad}/>
                </div>
                <span className={'text-xs'}>{loading ? 'loading...' : state.display.invalidState ? state.display.invalidState : null}</span>
                {
                    Comp ?
                        <Comp isEdit={isEdit}/> : (
                            <>
                                

                                < RenderTable  {...{
                                    newItem, setNewItem,
                                    updateItem, removeItem, addItem,
                                    currentPage, loading, isEdit
                                }} />
                                
                            </>
                        )
                }
                <div>
                    {/*Pagination*/}
                    <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} />
                    {/*/!*Attribution*!/*/}
                    <RenderAttribution />
                </div>
            </div>
        </SpreadSheetContext.Provider>
    )
}

const View = ({value, onChange, size, apiLoad, apiUpdate, compType='spreadsheet', ...rest}) => {
    const isEdit = false;
    const [state, setState] = useImmer(convertOldState(value, initialState(compType)));

    const [newItem, setNewItem] = useState({})
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);
    const showChangeFormatModal = !state?.sourceInfo?.columns;
    const isValidState = state?.dataRequest; // new state structure
    const Comp = useMemo(() => compType === 'card' ? Card : compType === 'graph' ? Graph : undefined, [compType]);

    useEffect(() => {
        const newState = convertOldState(value)
        setState(newState)
    }, [value]);

    // ========================================== get data begin =======================================================
    useEffect(() => {
        if(!isValidState) return;
        let isStale = false;

        // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
        const filterOptions = state.columns.reduce((acc, column) => {
            (column.filters || []).forEach(({type, operation, values}) => {
                acc[operation] = {...acc[operation] || {}, [column.name]: values};
            })

            if(column.excludeNA){
                acc.exclude = acc.exclude && acc.exclude[column.name] ?
                    {...acc.exclude, [column.name]: [...acc.exclude[column.name], 'null']} :
                    {...acc.exclude || [], [column.name]: ['null']}

            }
            return acc;
        }, {})
        const newDataReq = {
           ...state.dataRequest || {},
            ...filterOptions,
            orderBy: state.columns.filter(column => column.sort).reduce((acc, column) => ({...acc, [column.name]: column.sort}), {}),
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
    }, [state.columns, isValidState])

    // uweGetDataOnSettingsChange
    useEffect(() => {
        if(!isValidState) return;
        // only run when controls or source/view change
        let isStale = false;
        async function load() {
            setLoading(true)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.
            const {length, data} = await getData({state, apiLoad, fullDataLoad: compType === 'graph'});
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
    }, [state?.dataRequest, state?.sourceInfo, isValidState]);

    // useGetDataOnPageChange
    useEffect(() => {
        if(!isValidState || compType === 'graph') return;
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

        load()

        return () => {
            isStale = true;
        }
    }, [currentPage]);

    // useInfiniteScroll
    useEffect(() => {
        if(!isValidState || compType === 'graph') return;
        // observer that sets current page on scroll. no data fetching should happen here
        const observer = new IntersectionObserver(
            async (entries) => {
                const hasMore = (currentPage * state.display.pageSize + state.display.pageSize) < state.display.totalLength;
                if (state.data.length && entries[0].isIntersecting && hasMore) {
                    setCurrentPage(prevPage => prevPage+1)
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

    const addItem = () => {
        if(!state.sourceInfo?.isDms || !apiUpdate) return;
        setState(draft => {
            draft.data.push(newItem)
        })
        return apiUpdate({data: newItem, config: {format: state.sourceInfo}}) && setNewItem({})
    }

    const removeItem = item => {
        if(!state.sourceInfo?.isDms || !apiUpdate) return;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: state.sourceInfo}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================
    if(showChangeFormatModal || !isValidState) return <div className={'p-1 text-center'}>Form data not available.</div>;
    return (
        <SpreadSheetContext.Provider value={{state, setState, apiLoad, compType}}>
            <div className={'w-full h-full'}>
                <div className={'w-full'}>
                    <div className={'w-full pt-2 flex justify-end gap-2'}>
                        <RenderFilters state={state} setState={setState} apiLoad={apiLoad} isEdit={isEdit} defaultOpen={false}/>
                        <RenderDownload state={state} apiLoad={apiLoad}/>
                    </div>
                    <span className={'text-xs'}>{loading ? 'loading...' : state.display.invalidState ? state.display.invalidState : null}</span>

                    {
                        Comp ?
                            <Comp isEdit={isEdit}/> :
                            <RenderTable  {...{
                                newItem, setNewItem,
                                updateItem, removeItem, addItem,
                                currentPage, loading, isEdit,
                                allowEdit: groupByColumnsLength ? false : state.display.allowEditInView && apiUpdate
                            }} />

                    }

                    <div>
                        {/*Pagination*/}
                        <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} compType={compType}/>
                        {/*Attribution*/}
                        <RenderAttribution/>
                        
                    </div>
                </div>
            </div>
        </SpreadSheetContext.Provider>)
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

export default {
    "name": 'Spreadsheet',
    "type": 'table',
    "variables": [
        {name: 'visibleAttributes', hidden: true}, 
        {name: 'pageSize', hidden: true}, 
        {name: 'attributes', hidden: true},
        {name: 'customColNames', hidden: true}, 
        {name: 'orderBy', hidden: true}, 
        {name: 'colSizes', hidden: true}, 
        {name: 'filters'},
        {name: 'groupBy', hidden: true}, 
        {name: 'fn', hidden: true}, 
        {name: 'notNull', hidden: true}, 
        {name: 'allowEditInView', hidden: true}, 
        {name: 'format', hidden: true},
        {name: 'view', hidden: true}, 
        {name: 'actions', hidden: true}, 
        {name: 'allowSearchParams', hidden: true}, 
        {name: 'loadMoreId', hidden: true},
        {name: 'attributionData', hidden: true}
    ],
    getData,
    "EditComp": Edit,
    "ViewComp": View
}