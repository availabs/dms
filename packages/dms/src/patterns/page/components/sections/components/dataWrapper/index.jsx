import React, {useState, useEffect, useMemo, useRef, useCallback, useContext, useImperativeHandle, forwardRef} from 'react'
import {useNavigate} from "react-router";
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { isEqual } from "lodash-es";
import {useImmer} from "use-immer";
import {CMSContext, ComponentContext, PageContext} from "../../../../context";
import { ThemeContext } from '../../../../../../ui/useTheme';
import { migrateToV2 } from "./migrateToV2";
import { nameToSlug } from "../../../../../../utils/type-utils";
import {useHandleClickOutside, isCalculatedCol} from "./utils/utils";
import { getData, applyCreateDefaults } from "./getData";
import { useDataLoader } from "./useDataLoader";
import { usePageFilterSync } from "./usePageFilterSync";
import { useColumnOptions } from "./useColumnOptions";
import { RUNTIME_FIELDS, RUNTIME_DISPLAY_FIELDS } from "./schema";
import { useDataWrapperAPI } from "./useDataWrapperAPI";
import { useDataSource } from "./useDataSource";
import { usePivotDistinctValues } from "./usePivotDistinctValues";
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


const DOWNLOAD_CHUNK_SIZE = 5000;

// Set-returning functions (e.g. jsonb_array_elements_text) expand each row into
// N rows in the result — one per array element — causing row multiplication.
// Filter these out of the download column list to avoid duplicates.
const isDisaggregatingCol = c => typeof c.name === 'string' && c.name.includes('jsonb_array_elements_text');

const triggerDownload = async ({state, apiLoad, loadAllColumns, withId, setLoading}) => {
    setLoading(true);
    const needAllCols = loadAllColumns || withId;
    let cols = needAllCols
        ? [
            ...state?.columns,
            ...(state?.externalSource?.columns || []).filter(col => !state?.columns.find(c => c.name === col.name))
          ]
            .filter(c => !isDisaggregatingCol(c))
            .map(c => ({...c, show: true}))
        : state?.columns?.filter(c => !isDisaggregatingCol(c));

    if (withId && !cols.some(c => c.name === 'id')) {
        cols = [{ name: 'id', display_name: 'id', show: true, systemCol: true }, ...cols];
    }

    const tmpState = {...state, columns: cols};

    const downloadState = {
        ...tmpState,
        display: { ...tmpState.display, pageSize: DOWNLOAD_CHUNK_SIZE, showTotal: false }
    };

    let allData = [];
    let totalLength = null;
    let page = 0;

    while (true) {
        const { data, length } = await getData({
            state: downloadState,
            apiLoad,
            fullDataLoad: false,
            currentPage: page,
        });
        if (totalLength === null) totalLength = length;
        const pageData = (data || []).filter(r => !r.totalRow);
        if (!pageData.length) break;
        allData = allData.concat(pageData);
        if (allData.length >= totalLength) break;
        page++;
    }

    const visibleCols = tmpState?.columns.filter(({show}) => show);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    worksheet.columns = visibleCols.map(({name, display_name, customName}) => ({
        header: customName || display_name || name,
        key: name,
    }));

    allData.forEach(rowData => {
        const row = {};
        visibleCols.forEach(({name}) => {
            const val = rowData[name];
            row[name] = !Array.isArray(val) && typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
        });
        worksheet.addRow(row);
    });

    const hasSystemCol = visibleCols.some(c => c.systemCol);

    if (hasSystemCol) {
        worksheet.eachRow(row => {
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                cell.protection = { locked: visibleCols[colNumber - 1]?.systemCol === true };
            });
        });
        // protect() with no password so ExcelJS emits <sheetProtection sheet="1"/>
        // without the SHA-512 hash that LibreOffice/Google Sheets don't honour.
        // We then inject the legacy OOXML XOR hash for "0000" via JSZip post-processing.
        await worksheet.protect('');
    }

    const filterStr = Object.keys(state?.filters?.groups || {}).length ? JSON.stringify(state?.filters) : '';
    const fileName = `${state?.externalSource.view_name} - ${filterStr} - ${getCurrDate()}`;

    let buffer = await workbook.xlsx.writeBuffer();

    if (hasSystemCol) {
        const zip = await JSZip.loadAsync(buffer);
        const sheetXml = await zip.file('xl/worksheets/sheet1.xml').async('string');
        // CC6F is the legacy OOXML XOR hash for the password "0000"
        zip.file('xl/worksheets/sheet1.xml',
            sheetXml.replace('<sheetProtection sheet="1"/>', '<sheetProtection sheet="1" password="CC6F"/>'));
        buffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
    }

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

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
        <div className={'pr-8'}>
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
                            <>
                                <div className={`px-1 py-0.5 hover:bg-blue-50 ${loading ? 'hover:cursor-wait' : 'hover:cursor-pointer'} rounded-md`} onClick={() => {
                                    setOpen(false);
                                    return triggerDownload({state, apiLoad, loading, setLoading, loadAllColumns: true})
                                }}>All Columns</div>
                                <div className={`px-1 py-0.5 hover:bg-blue-50 ${loading ? 'hover:cursor-wait' : 'hover:cursor-pointer'} rounded-md`} onClick={() => {
                                    setOpen(false);
                                    return triggerDownload({state, apiLoad, loading, setLoading, withId: true})
                                }}>All Columns + ID</div>
                            </>
                        )
                    }
                </div>
            </div>
        </div>
    )
}


const Edit = forwardRef((props, ref) => {
    let {cms_context, value, onChange, component, siteType, pageFormat, onHandle, sectionId, trackingId} = props
    const isEdit = Boolean(onChange);
    const { UI, theme: fullTheme } = useContext(ThemeContext)
    const _pageCtx = useContext(PageContext) || {};
    const _cmsCtx = useContext(cms_context || CMSContext) || {};
    // apiLoad/apiUpdate normally arrive via PageContext (page pattern). When
    // DataWrapper is mounted from a non-page pattern (e.g. the datasets
    // pattern's table admin page), fall back to the cms_context which the
    // hosting pattern can populate.
    const apiLoad = _pageCtx.apiLoad || _cmsCtx.apiLoad;
    const apiUpdate = _pageCtx.apiUpdate || _cmsCtx.apiUpdate;
    const {datasources} = _cmsCtx;
    const pgEnv = getExternalEnv(datasources);
    const {Icon} = UI;
    const { pageState: editPageState } = _pageCtx;

    // ── DataWrapper owns its own state ──
    const [state, setState] = useImmer(migrateToV2(value || '', initialState(component?.defaultState), component?.name));
    const [newItem, setNewItem] = useState({})
    const isValidState = Boolean(state?.externalSource?.source_id || state?.externalSource?.isDms);
    const Comp = useMemo(() => component.EditComp, [component]);

    // ── Hooks that operate on state ──
    const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({
        state, setState, apiLoad, component, isEditMode: true,
    });

    useEffect(() => {
        if (outputSourceInfo && outputSourceInfo !== state?.outputSourceInfo) {
            setState(draft => { if (draft) draft.outputSourceInfo = outputSourceInfo; });
        }
    }, [outputSourceInfo]);

    usePageFilterSync({ state, setState, sectionId, trackingId });

    // ── Sync newItem from page params for columns with usePageParams ──
    useEffect(() => {
        const pageParamColumns = (state?.columns || []).filter(c => c.usePageParams && c.pageParamKey);
        if (!pageParamColumns.length) return;
        const pageFilters = (editPageState?.filters || []).reduce(
            (acc, curr) => ({ ...acc, [curr.searchKey]: curr.values }), {}
        );
        const updates = {};
        pageParamColumns.forEach(col => {
            const paramValues = pageFilters[col.pageParamKey];
            if (paramValues !== undefined) {
                const v = Array.isArray(paramValues) ? paramValues[0] : paramValues;
                // Re-sync when newItem doesn't already carry the value — addItem() clears
                // newItem, and without the newItem dep the NEXT add in the same session
                // would save without the pre-filled fields. The equality guard keeps the
                // set-inside-effect from looping (identical updates are skipped).
                if (newItem?.[col.name] !== v) updates[col.name] = v;
            }
        });
        if (Object.keys(updates).length) {
            setNewItem(prev => ({ ...prev, ...updates }));
        }
    }, [editPageState?.filters, state?.columns, newItem]);

    useColumnOptions({ state, setState, apiLoad, component, pgEnv, enabled: !!cms_context });

    usePivotDistinctValues({ state, setState, apiLoad });

    // ── useDataSource + dwAPI (owned by dataWrapper) ──
    const dataSourceInfo = useDataSource({ state, setState });
    const dwAPI = useDataWrapperAPI({ state, setState });

    // ── Comparison-series dynamic binding: reconcile the synthetic column ──
    // The master toggle / series-key commit fire reconcile from the menu, but a
    // dynamic "comparison_series" subscriber can be enabled (Actions menu) or resolve
    // its config (usePageFilterSync) AFTER the master is already on — orderings the
    // menu reconcile misses. Re-reconcile when either the subscriber's enabled flag or
    // config's presence flips (booleans, so no per-keystroke churn). reconcile is
    // idempotent → immer no-ops when the column is already correct.
    const csSubEnabled = (state?.display?._functions?.subscribers || []).some(
        s => s.functionId === 'comparison_series' && s.enabled
    );
    const csConfigPresent = state?.comparisonSeries?.config !== undefined;
    useEffect(() => {
        dwAPI.reconcileComparisonSeriesColumn();
    }, [csSubEnabled, csConfigPresent, state?.comparisonSeries?.enabled]);

    // ── Backfill externalSource.type if missing (older sections lack it) ──
    useEffect(() => {
        if (state?.externalSource?.name && !state?.externalSource?.type) {
            const derived = nameToSlug(state.externalSource.name);
            if (derived) {
                setState(draft => { draft.externalSource.type = derived; });
            }
        }
    }, [state?.externalSource?.name, state?.externalSource?.type]);

    // ── Save effect ──
    useEffect(() => {
        if (!isEdit) return;
        const toSave = {
            externalSource: state.externalSource,
            columns: state.columns || [],
            filters: state.filters || { op: 'AND', groups: [] },
            display: { ...(state.display || {}) },
            data: state.data || [],
            join: state.join || { sources: {} },
        };
        if (state.dataSourceId) toSave.dataSourceId = state.dataSourceId;
        if (state.pivot?.enabled) {
            const { distinctValues: _dv, distinctValuesByColumn: _dvbc, ...pivotConfig } = state.pivot;
            toSave.pivot = pivotConfig;
        }
        // Persist comparison-series config when present, or the save effect round-trips
        // a stripped state and the master toggle silently reverts (same trap as join).
        if (state.comparisonSeries) toSave.comparisonSeries = state.comparisonSeries;
        RUNTIME_DISPLAY_FIELDS.forEach(f => delete toSave.display[f]);
        const serialized = JSON.stringify(toSave);
        if (isEqual(value, serialized)) return;

        // if (serialized === prevSerializedRef.current) return;
        // prevSerializedRef.current = serialized;
        onChange(serialized);
    }, [state])

    // ── Expose internals to section ──
    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme) : component?.controls;

    const editStateRef = useRef(state);
    editStateRef.current = state;
    // const prevSerializedRef = useRef(null);

    const handle = useMemo(() => ({
        dwAPI, dataSource: dataSourceInfo,
        get state() { return editStateRef.current; },
        setState,
    }), [dwAPI, dataSourceInfo, setState]);

    useImperativeHandle(ref, () => handle, [handle]);
    useEffect(() => { onHandle?.(handle); }, [handle]);

    // ── CRUD ──
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);

    const updateItem = (value, attribute, d) => {
        if(!(state?.externalSource?.isDms || state?.externalSource?.isEditable) || !apiUpdate || groupByColumnsLength) return;
        const sourceType = state?.externalSource?.type || (state?.externalSource?.name ? nameToSlug(state.externalSource.name) : undefined);
        const dataFormat = state?.externalSource?.view_id && sourceType
            ? {...state?.externalSource, type: `${sourceType}|${state?.externalSource.view_id}:data`}
            : state?.externalSource;
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
            return apiUpdate({data: {...dataToUpdateDB, [attribute.name]: value},  config: {format: dataFormat}})
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

            return Promise.all(dataToUpdateDB.map(dtu => apiUpdate({data: dtu, config: {format: dataFormat}})));
        }
    }

    const addItem = async () => {
        if(!(state?.externalSource?.isDms || state?.externalSource?.isEditable) || !apiUpdate || groupByColumnsLength) return;
        const sourceType = state?.externalSource?.type || (state?.externalSource?.name ? nameToSlug(state.externalSource.name) : undefined);
        // create-time column defaults: `defaultValue` (static fill) + `autoNumber` (next
        // sequential number across the whole source) — see applyCreateDefaults in getData.js
        const data = await applyCreateDefaults({ columns: state?.columns, newItem, apiLoad, externalSource: state?.externalSource });
        const res = await apiUpdate({data, config: {format: {...state?.externalSource, type: `${sourceType}|${state?.externalSource.view_id}:data`}}});

        if(res?.id){
            setState(draft => {
                draft.data.push({...data, id: res.id})
            })
        }

        setNewItem({})
        return res;
    }

    const removeItem = item => {
        if(!(state?.externalSource?.isDms || state?.externalSource?.isEditable) || groupByColumnsLength) return;
        const sourceType = state?.externalSource?.type || (state?.externalSource?.name ? nameToSlug(state.externalSource.name) : undefined);
        const dataFormat = state?.externalSource?.view_id && sourceType
            ? {...state?.externalSource, type: `${sourceType}|${state?.externalSource.view_id}:data`}
            : state?.externalSource;
        setState(draft => {
            draft.data = draft.data.filter(d => d.id !== item.id);
        })
        return apiUpdate({data: item, config: {format: dataFormat}, requestType: 'delete'})
    }

    const componentProps = useMemo(() => {
        return component?.usesItemMutationProps ? {
            newItem, setNewItem,
            updateItem, removeItem, addItem,
            currentPage, infiniteScrollFetchData: onPageChange,
            allowEdit: (state?.externalSource?.isDms || state?.externalSource?.isEditable) && !groupByColumnsLength
        } : {}
    }, [component?.usesItemMutationProps, newItem, setNewItem, updateItem, removeItem, addItem, currentPage, onPageChange, state?.externalSource?.isDms, state?.externalSource?.isEditable, groupByColumnsLength])

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, controls: resolvedControls,
            isActive: true, activeStyle: undefined, sectionId, trackingId}}>
            <RenderFilters isEdit={true} defaultOpen={true} />
            <ExternalFilters defaultOpen={true} />
            <div className={'w-full h-full flex flex-col'}>
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

const View = forwardRef(({cms_context, value, onChange, component, editPageMode, onHandle, sectionId, trackingId}, ref) => {
    const isEdit = false;
    const navigate = useNavigate();
    const _pageCtx = useContext(PageContext) || {};
    const _cmsCtx = useContext(cms_context || CMSContext) || {};
    // Same cms_context fallback as Edit — see comment there.
    const apiLoad = _pageCtx.apiLoad || _cmsCtx.apiLoad;
    const apiUpdate = _pageCtx.apiUpdate || _cmsCtx.apiUpdate;
    const {datasources, baseUrl} = _cmsCtx;
    const pgEnv = getExternalEnv(datasources);
    const { UI, theme: fullTheme } = useContext(ThemeContext)
    const {Icon} = UI;
    const { pageState: viewPageState } = _pageCtx;

    // ── DataWrapper owns its own state ──
    const [state, setState] = useImmer(migrateToV2(value || '', initialState(component?.defaultState), component?.name));

    const [newItem, setNewItem] = useState({})
    const liveEditTimerRef = useRef(null);
    const groupByColumnsLength = useMemo(() => state?.columns?.filter(({group}) => group).length, [state?.columns]);
    const isValidState = Boolean(state?.externalSource?.source_id || state?.externalSource?.isDms);
    const Comp = useMemo(() => state?.display?.hideSection && !editPageMode ? () => <></> : component.ViewComp, [component, state?.display?.hideSection]);
    const setReadyToLoad = useCallback(() => setState(draft => {if (!draft) return; if (!draft.display) draft.display = {}; draft.display.readyToLoad = true}), [setState]);
    const allowEdit = groupByColumnsLength ? false : (state?.externalSource?.isDms || state?.externalSource?.isEditable) && state?.display?.allowEditInView && Boolean(apiUpdate);

    // Flush pending live edit on unmount
    useEffect(() => () => clearTimeout(liveEditTimerRef.current), []);

    // Sync when value changes (route change, external edit)
    useEffect(() => {
        const newState = migrateToV2(value, initialState(component?.defaultState), component?.name)
        if (newState) {
            setState(newState)
        }
    }, [value]);

    // ── Hooks ──
    const { loading, currentPage, onPageChange, outputSourceInfo } = useDataLoader({
        state, setState, apiLoad, component,
    });

    useEffect(() => {
        if (outputSourceInfo && outputSourceInfo !== state?.outputSourceInfo) {
            setState(draft => { if (draft) draft.outputSourceInfo = outputSourceInfo; });
        }
    }, [outputSourceInfo]);

    usePageFilterSync({ state, setState, setReadyOnChange: true, sectionId, trackingId });

    // ── Sync newItem from page params for columns with usePageParams ──
    useEffect(() => {
        const pageParamColumns = (state?.columns || []).filter(c => c.usePageParams && c.pageParamKey);
        if (!pageParamColumns.length) return;
        const pageFilters = (viewPageState?.filters || []).reduce(
            (acc, curr) => ({ ...acc, [curr.searchKey]: curr.values }), {}
        );
        const updates = {};
        pageParamColumns.forEach(col => {
            const paramValues = pageFilters[col.pageParamKey];
            if (paramValues !== undefined) {
                const v = Array.isArray(paramValues) ? paramValues[0] : paramValues;
                // Re-sync when newItem doesn't already carry the value — addItem() clears
                // newItem, and without the newItem dep the NEXT add in the same session
                // would save without the pre-filled fields. The equality guard keeps the
                // set-inside-effect from looping (identical updates are skipped).
                if (newItem?.[col.name] !== v) updates[col.name] = v;
            }
        });
        if (Object.keys(updates).length) {
            setNewItem(prev => ({ ...prev, ...updates }));
        }
    }, [viewPageState?.filters, state?.columns, newItem]);

    useColumnOptions({
        state, setState, apiLoad, component, pgEnv,
        enabled: allowEdit || state?.display?.allowAdddNew || state?.columns?.some(c => c.allowEditInView && c.mapped_options)
    });

    usePivotDistinctValues({ state, setState, apiLoad });

    // ── useDataSource + dwAPI (owned by dataWrapper) ──
    const dataSourceInfo = useDataSource({ state, setState });
    const dwAPI = useDataWrapperAPI({ state, setState });

    const resolvedControls = typeof component?.controls === 'function'
        ? component.controls(fullTheme) : component?.controls;

    // ── Expose internals to section ──
    const viewStateRef = useRef(state);
    viewStateRef.current = state;

    const handle = useMemo(() => ({
        dwAPI, dataSource: dataSourceInfo,
        get state() { return viewStateRef.current; },
        setState,
    }), [dwAPI, dataSourceInfo, setState]);

    useImperativeHandle(ref, () => handle, [handle]);
    useEffect(() => { onHandle?.(handle); }, [handle]);

    // ── CRUD ──
    const editableColumns = useMemo(() => state?.columns?.filter(c => !(c.serverFn && c.joinKey) && c.editable !== false), [state?.columns])
    const updateItem = useCallback((value, attribute, d) => {
        if(!(state?.externalSource?.isDms || state?.externalSource?.isEditable) || !apiUpdate || groupByColumnsLength) return;
        const sourceType = state?.externalSource?.type || (state?.externalSource?.name ? nameToSlug(state.externalSource.name) : undefined);
        const dataFormat = state?.externalSource?.view_id && sourceType
            ? {...state?.externalSource, type: `${sourceType}|${state?.externalSource.view_id}:data`}
            : state?.externalSource;
        if(attribute?.name){
            // Live edit: update local state immediately, debounce server call
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
            clearTimeout(liveEditTimerRef.current);
            liveEditTimerRef.current = setTimeout(() => {
                apiUpdate({data: {...dataToUpdateDB, [attribute.name]: value}, config: {format: dataFormat}})
            }, 500);
        }else{
            // Bulk/form save: send immediately
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

            return Promise.all(dataToUpdateDB.map(dtu => apiUpdate({data: dtu, config: {format: dataFormat}})));
        }
    }, [state?.externalSource?.isDms, state?.externalSource?.isEditable, editableColumns, groupByColumnsLength, setState, apiUpdate])

    const addItem = useCallback(async () => {
        if(!(state?.externalSource?.isDms || state?.externalSource?.isEditable) || !apiUpdate || groupByColumnsLength) return;
        const {allowAdddNew, addNewBehaviour, navigateUrlOnAdd} = state?.display || {};
        const sourceType = state?.externalSource?.type || (state?.externalSource?.name ? nameToSlug(state.externalSource.name) : undefined);
        const config = {format: {...state?.externalSource, type: `${sourceType}|${state?.externalSource?.view_id}:data`}}

        const emptyRowMode = state?.display?.emptyRowMode;
        if(allowAdddNew || emptyRowMode === 'inline_add'){
            // create-time column defaults: `defaultValue` (static fill) + `autoNumber` (next
            // sequential number across the whole source) — see applyCreateDefaults in getData.js
            const data = await applyCreateDefaults({ columns: state?.columns, newItem, apiLoad, externalSource: state?.externalSource });
            const res = await apiUpdate({data, config});
            const effectiveBehaviour = addNewBehaviour || (emptyRowMode === 'inline_add' ? 'append' : '');

            if(res?.id && effectiveBehaviour === 'append'){
                setState(draft => {
                    draft.data.push({...data, id: res.id})
                })
            }else if(res?.id && effectiveBehaviour === 'navigate' && navigateUrlOnAdd){
                navigate(`${baseUrl}${navigateUrlOnAdd}${res.id}`)
            }

            setNewItem({})
            return res;
        }
    }, [state?.externalSource, state?.columns, apiLoad, apiUpdate, setState, groupByColumnsLength, state?.display, newItem, baseUrl])

    const removeItem = useCallback(item => {
        if (!(state?.externalSource?.isDms || state?.externalSource?.isEditable) || !apiUpdate || groupByColumnsLength) return;
        const sourceType = state?.externalSource?.type || (state?.externalSource?.name ? nameToSlug(state.externalSource.name) : undefined);
        const dataFormat = state?.externalSource?.view_id && sourceType
            ? {...state?.externalSource, type: `${sourceType}|${state?.externalSource.view_id}:data`}
            : state?.externalSource;
        setState(draft => {
            const idx = draft.data.findIndex(d => d.id === item.id);
            if (idx !== -1) draft.data.splice(idx, 1);
        });

        return apiUpdate({data: item, config: { format: dataFormat }, requestType: "delete"});
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
        return component?.usesItemMutationProps ? {
            newItem, setNewItem,
            updateItem, removeItem, addItem,
            currentPage, infiniteScrollFetchData: onPageChange,
            allowEdit
        } : {}
    }, [component?.usesItemMutationProps, allowEdit, newItem, setNewItem, updateItem, removeItem, addItem, currentPage, onPageChange])

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, controls: resolvedControls, activeStyle: undefined, sectionId, trackingId}}>
            <RenderFilters isEdit={false} defaultOpen={true} />
            <ExternalFilters defaultOpen={true} />
            <div className={'w-full h-full'}>
                <div className={'w-full h-full flex flex-col'}>
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
