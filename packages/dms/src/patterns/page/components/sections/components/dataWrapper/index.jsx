import React, {useState, useEffect, useMemo, useRef, useCallback, useContext} from 'react'
import {useNavigate} from "react-router";
import writeXlsxFile from 'write-excel-file';
import { isEqual } from "lodash-es";
import { CMSContext, ComponentContext } from "../../../../context";
import { ThemeContext } from '../../../../../../ui/useTheme';
import { convertOldState } from "./utils/convertOldState";
import {useHandleClickOutside, getData, isCalculatedCol} from "./utils/utils";
import { Attribution } from "./components/Attribution";
import { Pagination } from "./components/Pagination";
import { getExternalEnv } from "../../../../pages/_utils/datasources";

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
            ]
                .map(c => ({...c, show: !isCalculatedCol(c)}))
        } : state;

    const {data} = await getData({
        state: tmpState,
        apiLoad, fullDataLoad: true});

    const schema = tmpState.columns
        .filter(({show}) => show)
        .map(({name, display_name, customName}) => ({
            column: customName || display_name || name,
            // type: String,
            // value: data => data?.[name],
            value: data => !Array.isArray(data?.[name]) && typeof data?.[name] === 'object' ? JSON.stringify(data?.[name]) : data?.[name],
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
const RenderDownload = ({state, apiLoad, cms_context}) => {
    // two options:
    // 1. download visible columns: add primary column if set
    // 2. download all columns: unavailable for grouped mode
    const {UI} = useContext(ThemeContext);
    const {Icon} = UI;
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
            <div className={'relative flex flex-col print:hidden'}>
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


const Edit = ({cms_context, value, onChange, component}) => {
    const isEdit = Boolean(onChange);
    const { UI } = useContext(ThemeContext)
    const {datasources} = useContext(cms_context || CMSContext);
    const pgEnv = getExternalEnv(datasources);
    const {Icon} = UI;
    const {state, setState, apiLoad, apiUpdate} = useContext(ComponentContext);
    const [loading, setLoading] = useState(false);
    const [newItem, setNewItem] = useState({})
    const [currentPage, setCurrentPage] = useState(0);
    const isValidState = Boolean(state?.dataRequest);
    const Comp = useMemo(() => component.EditComp, [component]);

    const localFilters = useMemo(() =>
            state.columns.filter(c => c.localFilter?.length)
                .reduce((acc, c) => ({...acc, [c.normalName || c.name]: c.localFilter}), {}),
        [state.columns]);
    const localFilterColumns = useMemo(() => Object.keys(localFilters).filter(k => localFilters[k]?.length), [localFilters]);
    const hasLocalFilters = Boolean(localFilterColumns.length);
    const getFilteredData = useCallback(({currentPage}) => {
        if(!hasLocalFilters) return;

        const textSearchCols =
            Object.keys(localFilters)
                .filter(col => !['select', 'multiselect', 'radio'].includes(state.columns.find(c => (c.normalName || c.name) === col)?.type))

        const filteredData = (state.fullData || state.data).filter((row, rowI) => {
            return Object.keys(localFilters).every(col => {
                if(!row[col]) return false;
                // check for arrays and objs {value, originalValue}
                const isTextSearch = textSearchCols.includes(col);
                const rowValue = Array.isArray(row[col]) ? row[col] : [row[col]];
                const filterValue = !isTextSearch && !Array.isArray(localFilters[col]) ? [localFilters[col]] : localFilters[col];
                return rowValue.some(v => {
                    const v1 = (
                        v && typeof v === "object" && v.originalValue ? v.originalValue :
                            v && typeof v === "object" && v.value ? v.value :
                                v
                    );

                    return isTextSearch ?
                        (v1 || '').toString().toLowerCase().includes(filterValue.toLowerCase()) :
                        filterValue.some(fv => fv === v1)
                })
            })
        })

        const fromIndex= currentPage * state.display.pageSize;
        const toIndex = Math.min(
            filteredData.length,
            currentPage * state.display.pageSize + state.display.pageSize,
        ) - 1;

        setState(draft => {
            draft.localFilteredData = filteredData.length < fromIndex ? filteredData : filteredData.filter((_, i) => i >= fromIndex && i <= toIndex);
            draft.display.filteredLength = filteredData.length;
        })

    }, [localFilters, hasLocalFilters, currentPage, setState])

    // ========================================= init comp begin =======================================================
    // useSetDataRequest
    useEffect(() => {
        // creates data request object
        if(!isValidState) return;
        let isStale = false;

        // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
        const filterOptions = state.columns.reduce((acc, column) => {
            const isNormalisedColumn = state.columns.filter(col => col.name === column.name && col.filters?.length).length > 1;

            (column.filters || [])
                .filter(({values}) => Array.isArray(values) && values.every(v => typeof v !== 'object') && values.length) // avoid pulling for blank arrays
                .forEach(({operation, values, fn}) => {
                    // here, operation is filter, exclude, >, >=, <, <=.
                    // normal columns only support filter.
                    if(operation === 'like' && !(values.length && values.every(v => v.length))){
                        // like operator should not remove nulls if no value is set
                        acc[operation] = {}
                    } if(isNormalisedColumn){
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
            ...state.display?.filterRelation && {filterRelation: state.display.filterRelation},
            groupBy: state.columns.filter(column => column.group).map(column => column.name),
            orderBy: state.columns.filter(column => column.sort).reduce((acc, column) => ({...acc, [column.name]: column.sort}), {}),
            fn: state.columns.filter(column => column.show && column.fn).reduce((acc, column) => ({...acc, [column.name]: column.fn}), {}),
            serverFn: state.columns.filter(column => column.show && column.serverFn).reduce((acc, {keepOriginal, name, joinKey, valueKey, joinWithChar, serverFn}) => ({
                ...acc,
                [name]: {keepOriginal, joinKey, valueKey, joinWithChar, serverFn}
            }), {}),
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
    }, [state?.columns, state?.display?.filterRelation, isValidState])

    // // ========================================== get data begin =======================================================
    // uweGetDataOnSettingsChange
    useEffect(() => {
        // calls getdata using data request object
        if(!isValidState) return;
        // only run when controls or source/view change
        async function load() {
            if(state.display.preventDuplicateFetch && isEqual(state.dataRequest, state.lastDataRequest)) return;

            setLoading(true)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.
            const {length, data, invalidState} = await getData({state, apiLoad, fullDataLoad: component.fullDataLoad, keepOriginalValues: component.keepOriginalValues});

            setState(draft => {
                draft.data = data;
                draft.localFilteredData = undefined;
                draft.display.filteredLength = undefined;
                draft.display.totalLength = length;
                draft.display.invalidState = invalidState;
            })
            onChange(JSON.stringify({...state, lastDataRequest: state.dataRequest, data, totalLength: length}));
            setCurrentPage(newCurrentPage);
            setLoading(false)
        }
        const timeoutId = setTimeout(() => hasLocalFilters ? getFilteredData({currentPage}) : load(), 300);
        return () => clearTimeout(timeoutId);
    }, [state.columns.length,
        state.dataRequest,
        state.sourceInfo.source_id,
        state.sourceInfo.view_id,
        state.display.pageSize,
        isValidState,
        localFilters]);

// useGetDataOnPageChange
    const onPageChange = async (currentPage) => {
        if(!isValidState || !component.useGetDataOnPageChange) return;
        // only run when page changes
        if(hasLocalFilters){
            setCurrentPage(currentPage)
            getFilteredData({currentPage})
        }else{
            const hasMore = (currentPage * state.display.pageSize) - state.display.totalLength <= 0;
            if(!hasMore) return;

            setLoading(true)
            const {length, data} = await getData({state, currentPage, apiLoad, keepOriginalValues: component.keepOriginalValues});

            setCurrentPage(currentPage)
            setState(draft => {
                // on page change append data unless using pagination
                draft.data =  state.display.usePagination ? data : [...draft.data.filter(r => !r.totalRow), ...data];
                draft.display.totalLength = length;
            })
            setLoading(false)
        }
    }
    // // =========================================== get data end ========================================================

    // =========================================== get input data ======================================================
    useEffect(() => {
        if(!cms_context) return; // don't pull options on edit mode, unless on Table or Validate page.
        let isStale = false;

        async function loadOptionsData() {
            try {
                const columnsToFetch = state.columns.filter(c => c.mapped_options);

                const fetchPromises = columnsToFetch.map(async column => {
                    let mapped_options;
                    try {
                        mapped_options = JSON.parse(column.mapped_options);
                    } catch {
                        console.warn('Invalid mapped_options JSON', column.mapped_options);
                        return [column.name, column.options || []];
                    }

                    const columns = [...new Set([mapped_options.labelColumn, mapped_options.valueColumn])].filter(Boolean);

                    try {
                        const { data } = await getData({
                            apiLoad,
                            fullDataLoad: true,
                            currentPage: 0,
                            keepOriginalValues: component.keepOriginalValues,
                            state: {
                                dataRequest: mapped_options.filter || {},
                                display: {},
                                sourceInfo: {
                                    source_id: mapped_options.sourceId,
                                    view_id: mapped_options.viewId,
                                    isDms: mapped_options.isDms,
                                    columns: columns.map(c => ({ name: c })),
                                    app: state.sourceInfo.app,
                                    type: mapped_options.type,
                                    env: mapped_options.isDms
                                        ? `${state.sourceInfo.app}+${mapped_options.type}`
                                        : pgEnv
                                },
                                columns: columns.map(c => ({ name: c, show: true }))
                            }
                        });
                        return [
                            column.name,
                            data.map(d => ({
                                label: d[mapped_options.labelColumn] || 'N/A',
                                value: d[mapped_options.valueColumn]
                            }))
                        ];
                    } catch (err) {
                        console.error(`Failed to load options for column ${column.name}:`, err);
                        return [column.name, column.options || []];
                    }
                });

                const results = await Promise.all(fetchPromises);

                if (!isStale) {
                    const responses = Object.fromEntries(results);

                    setState(draft => {
                        draft.columns.forEach(c => {
                            if (c.mapped_options) {
                                const fetchedOptions = responses[c.name] || [];
                                if (!isEqual(c.options, fetchedOptions)) {
                                    c.options = fetchedOptions;
                                }
                            }
                        });
                    });
                }
            } catch (err) {
                console.error('Error loading options:', err);
            }
        }

        loadOptionsData();
        return () => {
            isStale = true;
        };
    }, [isEdit, state.columns.map(c => c.mapped_options).join(',')]);


    // ========================================= get input data end ======================================================
    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit || !isValidState  || isEqual(value, JSON.stringify(state))) return;

        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    // =========================================== util fns begin ======================================================
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);

    const updateItem = (value, attribute, d) => {
        if(!state.sourceInfo?.isDms || !apiUpdate || groupByColumnsLength) return;
        if(attribute?.name){
            setState(draft => {
                const idx = draft.data.findIndex(draftD => draftD.id === d.id);
                if(idx !== -1){
                    draft.data[idx] = {...(draft.data[idx] || {}), ...d, [attribute.name]: value}
                }
            })
            const dataToUpdateDB = state.columns.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false)
                .reduce((acc, col) => {
                    acc[col.name] = d[col.name]?.originalValue || d[col.name];
                    return acc;
                }, {id: d.id})
            return apiUpdate({data: {...dataToUpdateDB, [attribute.name]: value},  config: {format: state.sourceInfo}})
        }else{
            const dataToUpdateState = Array.isArray(d) ? d : [d];
            const dataToUpdateDB = dataToUpdateState.map(row => {
                return state.columns.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false)
                    .reduce((acc, col) => {
                        acc[col.name] = row[col.name]?.originalValue || row[col.name];
                        return acc;
                    }, {id: row.id})
            })

            setState(draft => {
                dataToUpdateState.forEach(dtu => {
                    const i = draft.data.findIndex(dI => dI.id === dtu.id);
                    if(i === -1) return;

                    Object.keys(dtu).forEach(col => {
                        draft.data[i][col] = dtu[col];
                    })
                });
            });

            return Promise.all(dataToUpdateDB.map(dtu => apiUpdate({data: dtu, config: {format: state.sourceInfo}})));
        }
    }

    const addItem = async () => {
        if(!state.sourceInfo?.isDms || !apiUpdate || groupByColumnsLength) return;
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
        if(!state.sourceInfo?.isDms || groupByColumnsLength) return;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: state.sourceInfo}, requestType: 'delete'})
    }
    // =========================================== util fns end ========================================================

    const componentProps = useMemo(() => {
        return ['Spreadsheet', 'Card'].includes(component.name) ? {
            newItem, setNewItem,
            updateItem, removeItem, addItem,
            currentPage, infiniteScrollFetchData: onPageChange,
            allowEdit: state.sourceInfo?.isDms && !groupByColumnsLength
        } : {}
    }, [component.name, newItem, setNewItem, updateItem, removeItem, addItem, currentPage, onPageChange])

    return (
            <div className={'w-full h-full'}>
                <div className={'w-full flex items-center place-content-end'}>
                    {loading ? <Icon id={'loading'}
                                     icon={'LoadingHourGlass'}
                                     className={`absolute text-slate-400 hover:text-blue-500 size-4 transition ease-in-out duration-200`} /> :
                        state.display.invalidState ? <span className={'text-red-500'}>{state.display.invalidState}</span> : null
                    }
                    <RenderDownload state={state} apiLoad={apiLoad} cms_context={cms_context}/>
                </div>
                <Comp isEdit={isEdit}
                      cms_context={cms_context}
                  {...componentProps}
                />
                <div>
                    {/*Pagination*/}
                    <Pagination currentPage={currentPage} setCurrentPage={async i => {
                        return await onPageChange(i);
                    }} showPagination={component.showPagination}/>
                    {/*/!*Attribution*!/*/}
                    {state.display.showAttribution ? <Attribution/> : null}
                </div>
            </div>
    )
}

const View = ({cms_context, value, onChange, component}) => {
    const isEdit = false;
    const navigate = useNavigate();
    const {datasources, baseUrl} = useContext(cms_context || CMSContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const { UI } = useContext(ThemeContext)
    const {Icon} = UI;
    const {state, setState, apiLoad, apiUpdate} = useContext(ComponentContext);

    const [newItem, setNewItem] = useState({})
    const [loading, setLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);
    const showChangeFormatModal = !state?.sourceInfo?.columns;
    const isValidState = Boolean(state?.dataRequest); // new state structure
    const Comp = useMemo(() => state.display.hideSection ? () => <></> : component.ViewComp, [component, state.display.hideSection]);
    // const useCache = state.display.useCache //=== false ? false : true; // false: loads data on load. can be expensive. useCache can be undefined for older components.
    const setReadyToLoad = useCallback(() => setState(draft => {draft.display.readyToLoad = true}), [setState]);
    const allowEdit = groupByColumnsLength ? false : state.sourceInfo?.isDms && state.display.allowEditInView && Boolean(apiUpdate);

    useEffect(() => {
        const newState = convertOldState(value)
        setState(newState)
    }, [value]);

    const localFilters = useMemo(() =>
            state.columns.filter(c => c.localFilter?.length)
                .reduce((acc, c) => ({...acc, [c.normalName || c.name]: c.localFilter}), {}),
        [state.columns]);
    const localFilterColumns = useMemo(() => Object.keys(localFilters).filter(k => localFilters[k]?.length), [localFilters]);
    const hasLocalFilters = Boolean(localFilterColumns.length);
    const getFilteredData = useCallback(({currentPage}) => {
        if(!hasLocalFilters) return;

        const textSearchCols =
            Object.keys(localFilters)
                .filter(col => !['select', 'multiselect', 'radio'].includes(state.columns.find(c => (c.normalName || c.name) === col)?.type))

        const filteredData = (state.fullData || state.data).filter((row, rowI) => {
            return Object.keys(localFilters).every(col => {
                // if(!row[col]) return false; doesn't work for blank values.
                // check for arrays and objs {value, originalValue}
                const isTextSearch = textSearchCols.includes(col);
                const rowValue = Array.isArray(row[col]) ? row[col] : [row[col]];
                const filterValue = !isTextSearch && !Array.isArray(localFilters[col]) ? [localFilters[col]] : localFilters[col];
                return rowValue.some(v => {
                    const v1 = (
                        v && typeof v === "object" && v.originalValue ? v.originalValue :
                            v && typeof v === "object" && v.value ? v.value :
                                v
                    );

                      return isTextSearch ?
                          (v1 || '').toString().toLowerCase().includes(filterValue.toLowerCase()) :
                          filterValue.some(fv => fv === v1)
                })
            })
        })

        const fromIndex= currentPage * state.display.pageSize;
        const toIndex = Math.min(
            filteredData.length,
            currentPage * state.display.pageSize + state.display.pageSize,
        ) - 1;

        setState(draft => {
            draft.localFilteredData = filteredData.length < fromIndex ? filteredData : filteredData.filter((_, i) => i >= fromIndex && i <= toIndex);
            draft.display.filteredLength = filteredData.length;
        })

    }, [localFilters, hasLocalFilters, currentPage, setState])
    // ====================================== data fetch triggers begin ================================================
    // filters, sort, page change, draft.readyToFetch
    // builds an object with filter, exclude, gt, gte, lt, lte, like as keys. columnName: [values] as values
    const filterOptions = useMemo(() => state.columns.reduce((acc, column) => {
        const isNormalisedColumn = state.columns.filter(col => col.name === column.name && col.filters?.length).length > 1;

        (column.filters || [])
            .filter(({values}) => Array.isArray(values) && values.every(v => typeof v !== 'object') && values.length) // avoid pulling for blank arrays
            .forEach(({operation, values, fn}) => {
                // here, operation is filter, exclude, >, >=, <, <=.
                // normal columns only support filter.
                if(operation === 'like' && !(values.length && values.every(v => v.length))){
                    // like operator should not remove nulls if no value is set
                    acc[operation] = {}
                } else if(isNormalisedColumn){
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
            // hen filter options become {}, and old dataRequest has filters / other keys, they're not removed, hence defining individually.
            filter: filterOptions.filter || {},
            exclude: filterOptions.exclude || {},
            gt: filterOptions.gt || {},
            gte: filterOptions.gte || {},
            lt: filterOptions.lt || {},
            lte: filterOptions.lte || {},
            like: filterOptions.like || {},
            filterGroups: filterOptions.filterGroups || {},
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
        if(!hasLocalFilters && state.localFilteredData?.length) {
            // reset localFilteredData on localFilter reset
            setState(draft => {
                draft.localFilteredData = undefined;
                draft.display.filteredLength = undefined;
            })
        }

        if(!isValidState || (!hasLocalFilters && !state.display.readyToLoad && !state.display.allowEditInView)) return;
        // only run when controls or source/view change
        async function load() {
            if(state.display.preventDuplicateFetch && isEqual(state.dataRequest, state.lastDataRequest)) return;
            setLoading(true)
            const newCurrentPage = 0; // for all the deps here, it's okay to fetch from page 1.

            const {length, data} = await getData({state, apiLoad, fullDataLoad: component.fullDataLoad, keepOriginalValues: component.keepOriginalValues});

            setState(draft => {
                draft.data = data;
                draft.localFilteredData = undefined;
                draft.display.filteredLength = undefined;
                draft.display.totalLength = length;
            })
            onChange(JSON.stringify({...state, lastDataRequest: state.dataRequest, data, totalLength: length}));
            setCurrentPage(newCurrentPage);
            setLoading(false)
        }

        const timeoutId = setTimeout(() => hasLocalFilters ? getFilteredData({currentPage}) : load(), 300);
        return () => clearTimeout(timeoutId);
    }, [state?.dataRequest, isValidState, state.display.readyToLoad, state.display.allowEditInView, hasLocalFilters, localFilters]);

    // useGetDataOnPageChange
    const onPageChange = async (currentPage) => {
        if(!isValidState || !component.useGetDataOnPageChange /*|| (!state.display.readyToLoad && !state.display.allowEditInView)*/) return;
        // only run when page changes
        if(hasLocalFilters){
            setCurrentPage(currentPage)
            getFilteredData({currentPage})
        }else{
            const hasMore = (currentPage * state.display.pageSize) - state.display.totalLength <= 0;
            if(!hasMore) return;

            setLoading(true)
            const {length, data} = await getData({state, currentPage, apiLoad, keepOriginalValues: component.keepOriginalValues});

            setCurrentPage(currentPage)
            setState(draft => {
                // on page change append data unless using pagination
                draft.data =  state.display.usePagination ? data : [...draft.data.filter(r => !r.totalRow), ...data];
                draft.display.totalLength = length;
            })
            setLoading(false)
        }
    }

    // =========================================== get input data ======================================================
    useEffect(() => {
        if (!allowEdit && !state.display.allowAdddNew && !state.columns.some(c => c.allowEditInView && c.mapped_options)) return;
        let isStale = false;

        async function loadOptionsData() {
            try {
                const columnsToFetch = state.columns.filter(c => c.mapped_options);

                const fetchPromises = columnsToFetch.map(async column => {
                    let mapped_options;
                    try {
                        mapped_options = JSON.parse(column.mapped_options);
                    } catch {
                        console.warn('Invalid mapped_options JSON', column.mapped_options);
                        return [column.name, column.options || []];
                    }

                    const columns = [...new Set([mapped_options.labelColumn, mapped_options.valueColumn])].filter(Boolean);

                    try {
                        const { data } = await getData({
                            apiLoad,
                            fullDataLoad: true,
                            currentPage: 0,
                            keepOriginalValues: component.keepOriginalValues,
                            state: {
                                dataRequest: mapped_options.filter || {},
                                display: {},
                                sourceInfo: {
                                    source_id: mapped_options.sourceId,
                                    view_id: mapped_options.viewId,
                                    isDms: mapped_options.isDms,
                                    columns: columns.map(c => ({ name: c })),
                                    app: state.sourceInfo.app,
                                    type: mapped_options.type,
                                    env: mapped_options.isDms
                                        ? `${state.sourceInfo.app}+${mapped_options.type}`
                                        : pgEnv
                                },
                                columns: columns.map(c => ({ name: c, show: true }))
                            }
                        });
                        return [
                            column.name,
                            data.map(d => ({
                                label: d[mapped_options.labelColumn] || 'N/A',
                                value: d[mapped_options.valueColumn]
                            }))
                        ];
                    } catch (err) {
                        console.error(`Failed to load options for column ${column.name}:`, err);
                        return [column.name, column.options || []];
                    }
                });

                const results = await Promise.all(fetchPromises);

                if (!isStale) {
                    const responses = Object.fromEntries(results);
                    setState(draft => {
                        draft.columns.forEach(c => {
                            if (c.mapped_options) {
                                const fetchedOptions = responses[c.name] || [];
                                if (!isEqual(c.options, fetchedOptions)) {
                                    c.options = fetchedOptions;
                                }
                            }
                        });
                    });
                }
            } catch (err) {
                console.error('Error loading options:', err);
            }
        }

        loadOptionsData();
        return () => {
            isStale = true;
        };
    }, [allowEdit, isEdit, state.columns.map(c => c.mapped_options).join(',')]);


    // ========================================= get input data end ======================================================
    // =========================================== get data end ========================================================

    // =========================================== util fns begin ======================================================
    const editableColumns = useMemo(() => state.columns.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false), [state.columns])
    const updateItem = useCallback((value, attribute, d) => {
        if(!state.sourceInfo?.isDms || !apiUpdate || groupByColumnsLength) return;
        if(attribute?.name){
            setState(draft => {
                const idx = draft.data.findIndex(draftD => draftD.id === d.id);
                if(idx !== -1){
                    draft.data[idx] = {...(draft.data[idx] || {}), ...d, [attribute.name]: value}
                }
            })
            const dataToUpdateDB = editableColumns.reduce((acc, col) => {
                    acc[col.name] = d[col.name]?.originalValue || d[col.name];
                    return acc;
                }, {id: d.id})
            return apiUpdate({data: {...dataToUpdateDB, [attribute.name]: value},  config: {format: state.sourceInfo}})
        }else{
            const dataToUpdateState = Array.isArray(d) ? d : [d];
            const dataToUpdateDB = dataToUpdateState.map(row => {
                return editableColumns.reduce((acc, col) => {
                        acc[col.name] = row[col.name]?.originalValue || row[col.name];
                        return acc;
                    }, {id: row.id})
            })

            setState(draft => {
                dataToUpdateState.forEach(dtu => {
                    const i = draft.data.findIndex(dI => dI.id === dtu.id);
                    if(i === -1) return;

                    Object.keys(dtu).forEach(col => {
                        draft.data[i][col] = dtu[col];
                    })
                });
            });

            return Promise.all(dataToUpdateDB.map(dtu => apiUpdate({data: dtu, config: {format: state.sourceInfo}})));
        }
    }, [state.sourceInfo?.isDms, editableColumns, groupByColumnsLength, setState, apiUpdate])

    const addItem = useCallback(async () => {
        if(!state.sourceInfo?.isDms || !apiUpdate || groupByColumnsLength) return;
        const {allowAdddNew, addNewBehaviour, navigateUrlOnAdd} = state.display;
        const config = {format: {...state.sourceInfo, type: `${state.sourceInfo.type}-${state.sourceInfo.view_id}`}}

        if(allowAdddNew){
            const res = await apiUpdate({data: newItem, config});

            if(res?.id && addNewBehaviour === 'append'){
                setState(draft => {
                    draft.data.push({...newItem, id: res.id})
                })
            }else if(res?.id && addNewBehaviour === 'navigate' && navigateUrlOnAdd){
                navigate(`${baseUrl}${navigateUrlOnAdd}${res.id}`)
            }

            setNewItem({})
            return res;
        }
    }, [state.sourceInfo, apiUpdate, setState, groupByColumnsLength, state.display, newItem, baseUrl])

    const removeItem = useCallback(item => {
        if (!state.sourceInfo?.isDms || !apiUpdate || groupByColumnsLength) return;
        setState(draft => {
            const idx = draft.data.findIndex(d => d.id === item.id);
            if (idx !== -1) draft.data.splice(idx, 1);
        });

        return apiUpdate({data: item, config: { format: state.sourceInfo }, requestType: "delete"});
    }, [state.sourceInfo, apiUpdate, groupByColumnsLength, setState]);
    // =========================================== util fns end ========================================================
    if(showChangeFormatModal || !isValidState) return <div className={'p-1 text-center'}>Form data not available.</div>;

    useEffect(() => {
        // set hideSection flag
        if(!state.display.hideIfNull || state.display.allowEditInView){
            setState(draft => {
                draft.display.hideSection = false;
            })
        }else{
            const hide = state.data.length === 0 ||
                state.data.every(row =>
                    state.columns.filter(({ show }) => show)
                        .every(col => {
                            const value = row[col.normalName || col.name];
                            const isLexical = typeof value === 'object' && Boolean(value?.root)
                            const isLexicalBlank = isLexical && (value?.root?.children?.length === 0 || value?.root?.children?.[0]?.children?.length === 0)

                            return !col.allowEditInView && (value === null || value === undefined || value === "" || isLexicalBlank);
                        })
                );
            setState(draft => {
                draft.display.hideSection = hide;
            })
        }
    }, [state.data, state.display.hideIfNull])

    const componentProps = useMemo(() => {
        return ['Spreadsheet', 'Card'].includes(component.name) ? {
            newItem, setNewItem,
            updateItem, removeItem, addItem,
            currentPage, infiniteScrollFetchData: onPageChange,
            allowEdit
        } : {}
    }, [component.name, allowEdit, newItem, setNewItem, updateItem, removeItem, addItem, currentPage, onPageChange])
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
                                          className={`absolute text-slate-400 hover:text-blue-500 size-4 transition ease-in-out duration-200`} /> : null}
                        <RenderDownload state={state} apiLoad={apiLoad} cms_context={cms_context}/>
                    </div>
                    <Comp isEdit={isEdit}
                          cms_context={cms_context}
                          {...componentProps}
                    />
                    <div>
                        {/*Pagination*/}
                        <Pagination currentPage={currentPage} setCurrentPage={async i => {
                            return await onPageChange(i);
                        }} setReadyToLoad={setReadyToLoad} showPagination={component.showPagination}/>
                        {/*Attribution*/}
                        {state.display.showAttribution ? <Attribution/> : null}
                    </div>
                </div>
            </div>)
}

export default {
    EditComp: Edit,
    ViewComp: View,
    getData
}
