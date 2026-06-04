import React, {useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
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
    // console.log("------render table-----")
    // console.log("pageState filters:",pageState?.filters)
    // console.log("state::",state)
    const providerCfg = display._functions?.providers?.find(p => p.functionId === 'hover_highlight' && p.enabled);
    const clickPublishCfg = display._functions?.providers?.find(p => p.functionId === 'click_publish' && p.enabled);

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
        const {column, append_params} = clickPublishCfg?.args || {};
        const value = [rowData?.[clickPublishCfg.args?.column]];

        if (value !== undefined) {
            let finalValue = value;
            if(append_params) {
                //mutate final value
                const curFilter = pageState?.filters?.find(f => f.searchKey === clickPublishCfg.paramKey && f.type === 'action');
                const curValues = curFilter?.values || [];
                finalValue = [...curValues, ...value];
            }
            setActionParam(clickPublishCfg.paramKey, finalValue);
        }
    }, [clickPublishCfg, setActionParam, pageState]);


    const subCfg = display._functions?.subscribers?.find(s => s.functionId === 'row_highlight' && s.enabled);
    const highlightedRow = subCfg && pageState
        ? (() => {
            const param = pageState.filters.find(f => f.searchKey === subCfg.paramKey && f.type === 'action');
            const value = param?.values?.[0];
            return value !== undefined ? { column: subCfg.args?.column, value, style: subCfg.args?.style || 'bg' } : undefined;
          })()
        : undefined;

    const gridRef = useRef(null);

    const visibleAttributes = useMemo(() => columns.filter(({show}) => show), [columns]);
    const visibleAttributesLen = useMemo(() => columns.filter(({show}) => show).length, [columns]);
    const visibleAttrsWithoutOpenOut = useMemo(() => columns.filter(({show, openOut}) => show && !openOut), [columns]);
    const visibleAttrsWithoutOpenOutLen = useMemo(() => columns.filter(({show, openOut}) => show && !openOut).length, [columns]);
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
    console.log("table render state::", {state, pageState})
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

