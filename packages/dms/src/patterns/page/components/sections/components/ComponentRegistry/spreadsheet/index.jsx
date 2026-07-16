import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {computeRowPublish} from "./rowPublish";
import {
    actionsColSize,
    gutterColSize as gutterColSizeDf,
    minInitColSize,
    numColSize as numColSizeDf
} from "./constants"
import ActionControls from "./controls/ActionControls";
import {ComponentContext, PageContext} from '../../../../../context'
import {ThemeContext} from "../../../../../../../ui/useTheme"
import {isEqualColumns} from "../../dataWrapper/utils/utils";
import AddFormulaColumn from "../../../AddFormulaColumn";
import AddCalculatedColumn from "../../../AddCalculatedColumn";
//import {tableTheme} from "../../../../../../../ui/components/table/theme";

const frozenCols = [0,1] // testing
const frozenColClass = '' // testing

export const RenderTable = ({cms_context, isEdit, updateItem, removeItem, addItem, newItem, setNewItem, loading, allowEdit,
                                currentPage, infiniteScrollFetchData}) => {
    const { UI, theme} = React.useContext(ThemeContext) || {}
    const {Table} = UI;
    const {state, state:{filters, columns=[], externalSource: sourceInfo={}, display={}, data=[], localFilteredData, fullData}, setState, controls={}, isActive, activeStyle} = useContext(ComponentContext);
    const { pageState, setPageState, setActionParam, clearActionParam } = useContext(PageContext) || {};
    const providerCfg = display._functions?.providers?.find(p => p.functionId === 'hover_highlight' && p.enabled);
    const clickPublishCfg = display._functions?.providers?.find(p => p.functionId === 'click_publish' && p.enabled);
    // conditional_row_style: accent a whole row when one of its columns matches a condition
    // (e.g. county_priority empty → amber left-edge + tint). The args descriptor is threaded to
    // the Table, which resolves the styleKey against the live table theme and evaluates per row.
    const rowStyleCfg = display._functions?.providers?.find(p => p.functionId === 'conditional_row_style' && p.enabled);

    const onRowMouseEnter = useCallback((rowData) => {
        if (!providerCfg || !setActionParam) return;
        const value = rowData?.[providerCfg.args?.column];
        if (value !== undefined) setActionParam(providerCfg.paramKey, value);
    }, [providerCfg, setActionParam]);

    const onRowMouseLeave = useCallback(() => {
        if (!providerCfg || !clearActionParam) return;
        clearActionParam(providerCfg.paramKey);
    }, [providerCfg, clearActionParam]);

    const onRowMouseClick = useCallback((rowData) => {
        if (!clickPublishCfg || !setActionParam) return;
        const curValues = pageState?.filters?.find(f => f.searchKey === clickPublishCfg.paramKey && f.type === 'action')?.values || [];
        const { op, values } = computeRowPublish(rowData, clickPublishCfg.args || {}, curValues);
        if (op === 'clear') clearActionParam(clickPublishCfg.paramKey);
        else if (op === 'set') setActionParam(clickPublishCfg.paramKey, values);
    }, [clickPublishCfg, setActionParam, clearActionParam, pageState]);

    // load_publish: when the table's data arrives (or changes — e.g. a new event),
    // derive a row (first/max/min over a metric) and publish one or more of its column
    // values to page action params. Subscribers (sections with a matching
    // `usePageFilters`+`searchParamKey` leaf) then re-query against the published value.
    // publishedRef de-dupes so we publish only on a real value change (no reload loop).
    const loadPublishCfg = display._functions?.providers?.find(p => p.functionId === 'load_publish' && p.enabled);
    const publishedRef = useRef({});
    useEffect(() => {
        if (!loadPublishCfg || !setActionParam) return;
        const rows = state.data || [];
        // A completed fetch sets display.totalLength (0 for an empty result); it is
        // undefined before the first fetch. `loading` isn't passed in every render
        // context, so totalLength is the reliable "the query has run" signal — used
        // to distinguish a genuine empty result from the pre-fetch empty state.
        const loaded = state.display?.totalLength !== undefined;
        const a = loadPublishCfg.args || {};
        const pubs = Array.isArray(a.publishes) ? a.publishes
            : (a.column ? [{ column: a.column, paramKey: loadPublishCfg.paramKey }] : []);
        const publish = (paramKey, value) => {
            if (!paramKey || value === undefined || value === null || value === '') return;
            if (String(publishedRef.current[paramKey]) === String(value)) return;
            publishedRef.current[paramKey] = value;
            setActionParam(paramKey, value);
        };
        // No rows after a completed load (e.g. an event with no corridor data): resolve
        // any subscriber `requireResolved` gate with each entry's `emptyValue` (a no-match
        // sentinel) so a gated section renders empty instead of spinning forever.
        if (!rows.length) {
            if (loaded) pubs.forEach(({ paramKey, emptyValue }) => publish(paramKey, emptyValue));
            return;
        }
        const der = a.derivation || 'first';
        let row;
        if (der === 'first') row = rows[0];
        else {
            const num = v => { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? -Infinity : n; };
            row = rows.reduce((best, r) => {
                if (!best) return r;
                const cmp = num(r[a.metric]) - num(best[a.metric]);
                return (der === 'max' ? cmp > 0 : cmp < 0) ? r : best;
            }, null);
        }
        if (!row) return;
        pubs.forEach(({ column, paramKey }) => publish(paramKey, row[column]));
    }, [state.data, state.display?.totalLength, loadPublishCfg, setActionParam]);

    const subCfg = display._functions?.subscribers?.find(s => s.functionId === 'row_highlight' && s.enabled);
    const highlightedRow = subCfg && pageState
        ? (() => {
            const param = pageState.filters.find(f => f.searchKey === subCfg.paramKey && f.type === 'action');
            const value = param?.values?.[0];
            return value !== undefined ? { column: subCfg.args?.column, value, style: subCfg.args?.style || 'bg' } : undefined;
          })()
        : undefined;

    const gridRef = useRef(null);

    // selectOnly columns are fetched (query/SELECT) but render no cell — exclude
    // them from the visible/layout sets so a column type can read them off `row`.
    const visibleAttributes = useMemo(() => columns.filter(({show, selectOnly}) => show && !selectOnly), [columns]);
    const visibleAttributesLen = useMemo(() => columns.filter(({show, selectOnly}) => show && !selectOnly).length, [columns]);
    const visibleAttrsWithoutOpenOut = useMemo(() => columns.filter(({show, selectOnly, openOut}) => show && !selectOnly && !openOut), [columns]);
    const visibleAttrsWithoutOpenOutLen = useMemo(() => columns.filter(({show, selectOnly, openOut}) => show && !selectOnly && !openOut).length, [columns]);
    const actionColumns = useMemo(() => columns.filter(({actionType}) => actionType), [columns]);

    const paginationActive = display.usePagination && Math.ceil(display.totalLength / display.pageSize) > 1;
    const numColSize = display.showGutters ? numColSizeDf : 0
    const gutterColSize = display.showGutters ? gutterColSizeDf : 0

    // =================================================================================================================
    // =========================================== auto resize begin ===================================================
    // =================================================================================================================
    useEffect(() => {
        if(!gridRef.current || !display.autoResize) return;

        const columnsWithSizeLength = visibleAttrsWithoutOpenOut.filter(({size}) => size).length;
        const gridWidth = gridRef.current.offsetWidth - numColSize - gutterColSize - (allowEdit && actionColumns.length ? actionsColSize : 0);
        const currUsedWidth = visibleAttrsWithoutOpenOut.reduce((acc, {size}) => acc + +(size || 0), 0);
        if (
            !columnsWithSizeLength ||
            columnsWithSizeLength !== visibleAttrsWithoutOpenOutLen
            // || currUsedWidth < gridWidth // resize to use full width
        ) {
            const availableVisibleAttributes = visibleAttrsWithoutOpenOut.filter(v => v.actionType || v.type === 'formula' || v.origin === 'pivot_col' || sourceInfo.columns.find(attr => attr.name === v.name));
            const initialColumnWidth = Math.max(minInitColSize, gridWidth / availableVisibleAttributes.length);
            setState(draft => {
                availableVisibleAttributes.forEach(attr => {
                    const idx = draft.columns.findIndex(column => isEqualColumns(column, attr));
                    if(idx !== -1) {
                        draft.columns[idx].size = initialColumnWidth;
                    }
                })
            });
        }
    }, [visibleAttributesLen, visibleAttrsWithoutOpenOutLen, sourceInfo.columns, display.autoResize]);
    // ============================================ auto resize end ====================================================
    //console.log('render table')
    if(!visibleAttributes.length) return <div className={'p-2'}>No columns selected.</div>;
    return <Table columns={columns} data={data} localFilteredData={localFilteredData} fullData={fullData}
                  display={display} controls={{
                      ...controls,
                      FormulaColumnModal: AddFormulaColumn,
                      CalculatedColumnModal: AddCalculatedColumn,
                      sourceColumns: sourceInfo.columns || [],
                  }} setState={setState}
                  highlightedRow={highlightedRow}
                  conditionalRowStyle={rowStyleCfg?.args}
                  onRowMouseClick={clickPublishCfg ? onRowMouseClick : undefined}
                  onRowMouseEnter={providerCfg ? onRowMouseEnter : undefined}
                  onRowMouseLeave={providerCfg ? onRowMouseLeave : undefined}
                  allowEdit={allowEdit} isEdit={isEdit} loading={loading}
                  gridRef={gridRef}
                  theme={theme} paginationActive={paginationActive}
                  updateItem={updateItem} removeItem={removeItem}
                  newItem={newItem} setNewItem={setNewItem} addItem={addItem}
                  numColSize={numColSize} gutterColSize={gutterColSize} frozenColClass={frozenColClass} frozenCols={frozenCols}
                  currentPage={currentPage}
                  infiniteScrollFetchData={infiniteScrollFetchData}
                  isActive={isActive} activeStyle={display.tableStyle || activeStyle}
    />
}

