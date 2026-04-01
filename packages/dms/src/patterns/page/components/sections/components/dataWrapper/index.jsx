import React, {useState, useEffect, useMemo, useRef, useCallback, useContext, useImperativeHandle, forwardRef} from 'react'
import {useNavigate} from "react-router";
import writeXlsxFile from 'write-excel-file';
import { isEqual } from "lodash-es";
import {useImmer} from "use-immer";
import {CMSContext, ComponentContext, PageContext} from "../../../../context";
import { ThemeContext } from '../../../../../../ui/useTheme';
import { migrateToV2 } from "./migrateToV2";
import {useHandleClickOutside, isCalculatedCol} from "./utils/utils";
import { getData } from "./getData";
import { useDataLoader } from "./useDataLoader";
import { usePageFilterSync } from "./usePageFilterSync";
import { useColumnOptions } from "./useColumnOptions";
import { RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS } from "./schema";
import { useDataWrapperAPI } from "./useDataWrapperAPI";
import { useDataSource } from "./useDataSource";
import { initialState } from "../../section_utils";
import { Attribution } from "./components/Attribution";
import { Pagination } from "./components/Pagination";
import { RenderFilters } from "./components/filters/RenderFilters";
import { ExternalFilters } from "../../ExternalFilters";
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
                ...state?.columns,
                ...state?.externalSource.columns.filter(originalColumn => !state?.columns.find(c => c.name === originalColumn.name))
            ]
                .map(c => ({...c, show: true}))
        } : state;

    const {data} = await getData({
        state: tmpState,
        apiLoad, fullDataLoad: true});

    const schema = tmpState?.columns
        .filter(({show}) => show)
        .map(({name, display_name, customName}) => ({
            column: customName || display_name || name,
            value: data => !Array.isArray(data?.[name]) && typeof data?.[name] === 'object' ? JSON.stringify(data?.[name]) : data?.[name],
        }));

    const filterStr = Object.keys(state?.filters?.groups || {}).length ? JSON.stringify(state?.filters) : '';
    const fileName = `${state?.externalSource.view_name} - ${filterStr} - ${getCurrDate()}`;

    await writeXlsxFile(data, {
        schema,
        fileName: `${fileName}.xlsx`,
    });
    setLoading(false);
}
const RenderDownload = ({state, apiLoad, cms_context}) => {
    const {UI} = useContext(ThemeContext);
    const {Icon} = UI;
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const menuRef = useRef(null);
    const menuBtnId = loading ? `loading` : `download-btn`;
    const icon = loading ? 'LoadingHourGlass' : 'Download';
    const isGrouping = state?.columns?.some(c => c.group);
    useHandleClickOutside(menuRef, menuBtnId, () => setOpen(false));

    if(!state?.display?.allowDownload) return;
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


const Edit = forwardRef((props, ref) => {
    let {cms_context, value, onChange, component, siteType, pageFormat, onHandle} = props
    const isEdit = Boolean(onChange);
    const { UI, theme: fullTheme } = useContext(ThemeContext)
    const { apiLoad, apiUpdate } = useContext(PageContext) || {};
    const {datasources} = useContext(cms_context || CMSContext);
    const pgEnv = getExternalEnv(datasources);
    const {Icon} = UI;

    // ── DataWrapper owns its own state ──
    const [state, setState] = useImmer(migrateToV2(value || '', initialState(component?.defaultState), component?.name));
    const [newItem, setNewItem] = useState({})
    const isValidState = Boolean(state?.externalSource?.source_id || state?.externalSource?.isDms);
    const Comp = useMemo(() => component.EditComp, [component]);

    // ── Hooks that operate on state ──
    const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({
        state, setState, apiLoad, component,
        readyToLoad: isValidState,
    });

    const renderCount = useRef(0);
    const prevProps = useRef(props);

    useEffect(() => {
      renderCount.current++;
      const changed = Object.keys(props).filter(
        key => props[key] !== prevProps.current[key]
      );
      console.log(`Render #${renderCount.current}, changed props:`, changed);
      prevProps.current = props;
    });

    useEffect(() => {
        if (outputSourceInfo && outputSourceInfo !== state?.outputSourceInfo) {
            setState(draft => { if (draft) draft.outputSourceInfo = outputSourceInfo; });
        }
    }, [outputSourceInfo]);

    usePageFilterSync({ state, setState });

    useColumnOptions({ state, setState, apiLoad, component, pgEnv, enabled: !!cms_context });

    // ── useDataSource + dwAPI (owned by dataWrapper) ──
    const dataSourceInfo = useDataSource({ state, setState });
    const dwAPI = useDataWrapperAPI({ state, setState });

    // ── Save effect ──
    useEffect(() => {
        if (!isEdit || !isValidState) return;
        const toSave = {
            externalSource: state.externalSource,
            columns: state.columns || [],
            filters: state.filters || { op: 'AND', groups: [] },
            display: { ...(state.display || {}) },
            data: state.data || [],
        };
        if (state.dataSourceId) toSave.dataSourceId = state.dataSourceId;
        RUNTIME_DISPLAY_FIELDS.forEach(f => delete toSave.display[f]);
        const serialized = JSON.stringify(toSave);
        if (isEqual(value, serialized)) return;
        onChange(serialized);
    }, [state])

    // ── Expose internals to section ──
    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme) : component?.controls;

    const handle = useMemo(() => ({
        dwAPI, dataSource: dataSourceInfo, state, setState,
    }), [dataSourceInfo?.sources?.length, dataSourceInfo?.views?.length, dataSourceInfo.activeView, dataSourceInfo.activeSource]);

    console.log('handle', dataSourceInfo)

    useImperativeHandle(ref, () => handle, [handle]);
    useEffect(() => { onHandle?.(handle); }, [handle]);

    // ── CRUD ──
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);

    const updateItem = (value, attribute, d) => {
        if(!state?.externalSource?.isDms || !apiUpdate || groupByColumnsLength) return;
        if(attribute?.name){
            setState(draft => {
                const idx = draft.data.findIndex(draftD => draftD.id === d.id);
                if(idx !== -1){
                    draft.data[idx] = {...(draft.data[idx] || {}), ...d, [attribute.name]: value}
                }
            })
            const dataToUpdateDB = state?.columns.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false)
                .reduce((acc, col) => {
                    acc[col.name] = d[col.name]?.originalValue || d[col.name];
                    return acc;
                }, {id: d.id})
            return apiUpdate({data: {...dataToUpdateDB, [attribute.name]: value},  config: {format: state?.externalSource}})
        }else{
            const dataToUpdateState = Array.isArray(d) ? d : [d];
            const dataToUpdateDB = dataToUpdateState?.map(row => {
                return state?.columns.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false)
                    .reduce((acc, col) => {
                        acc[col.name] = row[col.name]?.originalValue || row[col.name];
                        return acc;
                    }, {id: row.id})
            })

            setState(draft => {
                dataToUpdateState?.forEach(dtu => {
                    const i = draft.data.findIndex(dI => dI.id === dtu.id);
                    if(i === -1) return;

                    Object.keys(dtu).forEach(col => {
                        draft.data[i][col] = dtu[col];
                    })
                });
            });

            return Promise.all(dataToUpdateDB.map(dtu => apiUpdate({data: dtu, config: {format: state?.externalSource}})));
        }
    }

    const addItem = async () => {
        if(!state?.externalSource?.isDms || !apiUpdate || groupByColumnsLength) return;
        const res = await apiUpdate({data: newItem, config: {format: {...state?.externalSource, type: `${state?.externalSource.type}-${state?.externalSource.view_id}`}}});

        if(res?.id){
            setState(draft => {
                draft.data.push({...newItem, id: res.id})
            })
        }

        setNewItem({})
        return res;
    }

    const removeItem = item => {
        if(!state?.externalSource?.isDms || groupByColumnsLength) return;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: state?.externalSource}, requestType: 'delete'})
    }

    const componentProps = useMemo(() => {
        return ['Spreadsheet', 'Card'].includes(component.name) ? {
            newItem, setNewItem,
            updateItem, removeItem, addItem,
            currentPage, infiniteScrollFetchData: onPageChange,
            allowEdit: state?.externalSource?.isDms && !groupByColumnsLength
        } : {}
    }, [component.name, newItem, setNewItem, updateItem, removeItem, addItem, currentPage, onPageChange])

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, controls: resolvedControls,
            isActive: true, activeStyle: undefined, sectionId: undefined}}>
            <RenderFilters isEdit={true} defaultOpen={true} />
            <div className={'w-full h-full'}>
                <div className={'w-full flex items-center place-content-end'}>
                    {loading ? <Icon id={'loading'}
                                     icon={'LoadingHourGlass'}
                                     className={`absolute text-slate-400 hover:text-blue-500 size-4 transition ease-in-out duration-200`} /> :
                        state?.display?.invalidState ? <span className={'text-red-500'}>{state?.display?.invalidState}</span> : null
                    }
                    <RenderDownload state={state} apiLoad={apiLoad} cms_context={cms_context}/>
                </div>
                <Comp isEdit={isEdit}
                      cms_context={cms_context}
                  {...componentProps}
                />
                <div>
                    <Pagination currentPage={currentPage} setCurrentPage={async i => {
                        return await onPageChange(i);
                    }} showPagination={component.showPagination}/>
                    {state?.display?.showAttribution ? <Attribution/> : null}
                </div>
            </div>
        </ComponentContext.Provider>
    )
})

const View = forwardRef(({cms_context, value, onChange, component, editPageMode, onHandle}, ref) => {
    const isEdit = false;
    const navigate = useNavigate();
    const { apiLoad, apiUpdate } = useContext(PageContext) || {};
    const {datasources, baseUrl} = useContext(cms_context || CMSContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const { UI, theme: fullTheme } = useContext(ThemeContext)
    const {Icon} = UI;

    // ── DataWrapper owns its own state ──
    const [state, setState] = useImmer(migrateToV2(value || '', initialState(component?.defaultState), component?.name));

    const [newItem, setNewItem] = useState({})
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);
    const isValidState = Boolean(state?.externalSource?.source_id || state?.externalSource?.isDms);
    const Comp = useMemo(() => state?.display?.hideSection && !editPageMode ? () => <></> : component.ViewComp, [component, state?.display?.hideSection]);
    const setReadyToLoad = useCallback(() => setState(draft => {if (!draft) return; if (!draft.display) draft.display = {}; draft.display.readyToLoad = true}), [setState]);
    const allowEdit = groupByColumnsLength ? false : state?.externalSource?.isDms && state?.display?.allowEditInView && Boolean(apiUpdate);

    // Sync when value changes (route change, external edit)
    useEffect(() => {
        const newState = migrateToV2(value, initialState(component?.defaultState), component?.name)
        if (newState) setState(newState)
    }, [value]);

    // ── Hooks ──
    const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({
        state, setState, apiLoad, component,
        readyToLoad: isValidState && (state?.display?.readyToLoad || state?.display?.allowEditInView),
    });

    useEffect(() => {
        if (outputSourceInfo && outputSourceInfo !== state?.outputSourceInfo) {
            setState(draft => { if (draft) draft.outputSourceInfo = outputSourceInfo; });
        }
    }, [outputSourceInfo]);

    usePageFilterSync({ state, setState, setReadyOnChange: true });

    useColumnOptions({
        state, setState, apiLoad, component, pgEnv,
        enabled: allowEdit || state?.display?.allowAdddNew || state?.columns?.some(c => c.allowEditInView && c.mapped_options)
    });

    // ── useDataSource + dwAPI (owned by dataWrapper) ──
    const dataSourceInfo = useDataSource({ state, setState });
    const dwAPI = useDataWrapperAPI({ state, setState });

    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme) : component?.controls;

    // ── Expose internals to section ──
    const handle = useMemo(() => ({
        dwAPI, dataSource: dataSourceInfo, state, setState,
    }), [dwAPI, dataSourceInfo, state, setState]);

    useImperativeHandle(ref, () => handle, [handle]);
    useEffect(() => { onHandle?.(handle); }, [handle]);

    // ── CRUD ──
    const editableColumns = useMemo(() => state?.columns?.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false), [state?.columns])
    const updateItem = useCallback((value, attribute, d) => {
        if(!state?.externalSource?.isDms || !apiUpdate || groupByColumnsLength) return;
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
            return apiUpdate({data: {...dataToUpdateDB, [attribute.name]: value},  config: {format: state?.externalSource}})
        }else{
            const dataToUpdateState = Array.isArray(d) ? d : [d];
            const dataToUpdateDB = dataToUpdateState?.map(row => {
                return editableColumns.reduce((acc, col) => {
                        acc[col.name] = row[col.name]?.originalValue || row[col.name];
                        return acc;
                    }, {id: row.id})
            })

            setState(draft => {
                dataToUpdateState?.forEach(dtu => {
                    const i = draft.data.findIndex(dI => dI.id === dtu.id);
                    if(i === -1) return;

                    Object.keys(dtu).forEach(col => {
                        draft.data[i][col] = dtu[col];
                    })
                });
            });

            return Promise.all(dataToUpdateDB.map(dtu => apiUpdate({data: dtu, config: {format: state?.externalSource}})));
        }
    }, [state?.externalSource?.isDms, editableColumns, groupByColumnsLength, setState, apiUpdate])

    const addItem = useCallback(async () => {
        if(!state?.externalSource?.isDms || !apiUpdate || groupByColumnsLength) return;
        const {allowAdddNew, addNewBehaviour, navigateUrlOnAdd} = state?.display || {};
        const config = {format: {...state?.externalSource, type: `${state?.externalSource?.type}-${state?.externalSource?.view_id}`}}

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
    }, [state?.externalSource, apiUpdate, setState, groupByColumnsLength, state?.display, newItem, baseUrl])

    const removeItem = useCallback(item => {
        if (!state?.externalSource?.isDms || !apiUpdate || groupByColumnsLength) return;
        setState(draft => {
            const idx = draft.data.findIndex(d => d.id === item.id);
            if (idx !== -1) draft.data.splice(idx, 1);
        });

        return apiUpdate({data: item, config: { format: state?.externalSource }, requestType: "delete"});
    }, [state?.externalSource, apiUpdate, groupByColumnsLength, setState]);

    // ── Hide section logic ──
    useEffect(() => {
        if (!state?.display || !state?.data) return;
        if(!state.display.hideIfNull || state.display.allowEditInView){
            setState(draft => {
                if (!draft) return;
                if (!draft.display) draft.display = {};
                draft.display.hideSection = false;
            })
        }else{
            const hide = (state?.data || []).length === 0 ||
              (state?.data || []).every(row =>
                (state?.columns || []).filter(({ show }) => show)
                        .every(col => {
                            const value = row[col.normalName || col.name];
                            const isLexical = typeof value === 'object' && Boolean(value?.root)
                            const isLexicalBlank = isLexical && (value?.root?.children?.length === 0 || value?.root?.children?.[0]?.children?.length === 0)

                            return !col.allowEditInView && (value === null || value === undefined || value === "" || isLexicalBlank);
                        })
                );
            setState(draft => {
                if (!draft) return;
                if (!draft.display) draft.display = {};
                draft.display.hideSection = hide;
            })
        }
    }, [state?.data, state?.display?.hideIfNull])

    const componentProps = useMemo(() => {
        return ['Spreadsheet', 'Card'].includes(component.name) ? {
            newItem, setNewItem,
            updateItem, removeItem, addItem,
            currentPage, infiniteScrollFetchData: onPageChange,
            allowEdit
        } : {}
    }, [component.name, allowEdit, newItem, setNewItem, updateItem, removeItem, addItem, currentPage, onPageChange])

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, controls: resolvedControls, activeStyle: undefined}}>
            <RenderFilters isEdit={false} defaultOpen={true} />
            <ExternalFilters defaultOpen={true} />
            <div className={'w-full h-full'}>
                <div className={'w-full'}>
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
                        <Pagination currentPage={currentPage} setCurrentPage={async i => {
                            return await onPageChange(i);
                        }} setReadyToLoad={setReadyToLoad} showPagination={component.showPagination}/>
                        {state?.display?.showAttribution ? <Attribution/> : null}
                    </div>
                </div>
            </div>
        </ComponentContext.Provider>
    )
})

export default {
    EditComp: Edit,
    ViewComp: View,
    getData
}
