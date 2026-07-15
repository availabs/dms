import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ComponentContext, PageContext } from "../../../../context";
import { ThemeContext } from "../../../../../../ui/useTheme";
import { formatFunctions } from "../dataWrapper/utils/utils";
import AddFormulaColumn from "../../AddFormulaColumn";
import AddCalculatedColumn from "../../AddCalculatedColumn";

// `activeOnSearchParam` support: decide whether a link cell's own `location` query
// params match the live page filters, so the Card can apply a themed active style.
//   - `pageFilterValues` maps searchKey → current value array (from PageContext).
//   - `groupParamKeys` is the union of param keys across every activeOnSearchParam
//     cell in the section (the "group"); an empty/`"?"` location is that group's
//     "All" cell — active only when none of the group's keys is currently set.
const isLocationActive = (location, pageFilterValues, groupParamKeys) => {
    const qIdx = typeof location === 'string' ? location.indexOf('?') : -1;
    const entries = qIdx !== -1 ? [...new URLSearchParams(location.slice(qIdx + 1)).entries()] : [];

    // Empty / `?` location = the "All / no filter" cell.
    if (entries.length === 0) return groupParamKeys.every(k => (pageFilterValues[k] || []).length === 0);

    // Otherwise active only when EVERY param in the cell's location matches the page.
    return entries.every(([key, value]) => {
        const current = pageFilterValues[key] || [];
        // `?key=` (empty value) = active when that key has no value set on the page.
        if (value === '') return current.length === 0;
        return current.map(v => String(v)).includes(value);
    });
};

// Card section. Always renders both grids:
//   cards grid (outer): record-cards laid out across the section
//   cells grid (inner): attribute-cells laid out inside each record-card
// Both have independent settings (cardsGrid* / cellsGrid* on display, cellSpan
// / cellRowSpan / cellBgColor / cellPaddingBottom / cellBorderBelow on each
// column). Legacy `compactView` blobs are normalized to this shape on hydration
// by Card.migrate.js (called from migrateToV2).

export const CardSection = ({
                  isEdit, //edit mode
                  updateItem, addItem,
                  newItem, setNewItem,
                  allowEdit // is data edit allowed
              }) => {
    const {UI} = useContext(ThemeContext);
    const {Card} = UI;
    const {state, setState, controls={}, activeStyle} = useContext(ComponentContext);
    const { pageState, setActionParam, clearActionParam } = useContext(PageContext) || {};

    // ── activeOnSearchParam: mark link cells whose own `location` params match the
    // live page filters. Reads pageState.filters (the same source the page keeps in
    // sync with the URL); the Card applies the themed `cellActive` class per column.
    const pageFilterValues = useMemo(() => {
        const out = {};
        (pageState?.filters || []).forEach(f => {
            if (!f?.searchKey) return;
            out[f.searchKey] = Array.isArray(f.values)
                ? f.values.filter(v => v != null && v !== '')
                : (f.values != null && f.values !== '' ? [f.values] : []);
        });
        return out;
    }, [pageState?.filters]);

    const groupParamKeys = useMemo(() => {
        const keys = new Set();
        (state.columns || []).forEach(col => {
            if (!(col.activeOnSearchParam && col.isLink) || typeof col.location !== 'string') return;
            const qIdx = col.location.indexOf('?');
            if (qIdx === -1) return;
            new URLSearchParams(col.location.slice(qIdx + 1)).forEach((_v, k) => keys.add(k));
        });
        return [...keys];
    }, [state.columns]);

    const activeColumns = useMemo(() => {
        const out = {};
        (state.columns || []).forEach(col => {
            if (col.activeOnSearchParam && col.isLink) {
                out[col.normalName || col.name] = isLocationActive(col.location, pageFilterValues, groupParamKeys);
            }
        });
        return out;
    }, [state.columns, pageFilterValues, groupParamKeys]);

    const providerCfg = state.display?._functions?.providers?.find(p => p.functionId === 'hover_highlight' && p.enabled);

    const subCfg = state.display?._functions?.subscribers?.find(s => s.functionId === 'row_highlight' && s.enabled);
    const highlightedItem = subCfg && pageState
        ? (() => {
            const param = pageState.filters.find(f => f.searchKey === subCfg.paramKey && f.type === 'action');
            const value = param?.values?.[0];
            return value !== undefined ? { column: subCfg.args?.column, value, style: subCfg.args?.style || 'bg' } : undefined;
          })()
        : undefined;

    const onCardMouseEnter = useCallback((item) => {
        if (!providerCfg || !setActionParam) return;
        const value = item?.[providerCfg.args?.column];
        if (value !== undefined) setActionParam(providerCfg.paramKey, value);
    }, [providerCfg, setActionParam]);

    const onCardMouseLeave = useCallback(() => {
        if (!providerCfg || !clearActionParam) return;
        clearActionParam(providerCfg.paramKey);
    }, [providerCfg, clearActionParam]);

    const clickPublishCfg = state.display?._functions?.providers?.find(p => p.functionId === 'click_publish' && p.enabled);

    const onCardColumnClick = useCallback((item, columnKey) => {
        if (!clickPublishCfg || !setActionParam) return;
        const value = item?.[columnKey];
        if (value !== undefined) setActionParam(clickPublishCfg.paramKey, value);
    }, [clickPublishCfg, setActionParam]);

    // closeModalOnAdd: '<actionParamKey>' — after a successful add-new-item create, clear that
    // action param so the enclosing modal section-group (opened by the same key) closes. The
    // Card section doesn't know its group's modalParamKey, so the author names it explicitly —
    // same shape as the click_publish provider's paramKey. No-op outside a modal (clearing an
    // unset action param does nothing) and in edit mode (the group renders inline).
    // add_publish provider — on the same successful create, publishes the new row id to its
    // paramKey; sections with a data_refresh subscriber on that key refetch (useDataLoader
    // mixes the value into their fetchKey), so a modal-created row appears in the page's
    // tables/counters without a reload. The row id is fresh per create, so consecutive adds
    // each re-trigger. Discrete user-initiated trigger — safe for reload-driving consumers
    // (component-actions.md).
    const closeModalOnAddKey = state.display?.closeModalOnAdd;
    const addPublishCfg = state.display?._functions?.providers?.find(p => p.functionId === 'add_publish' && p.enabled);
    const addItemWrapped = useCallback(async (...args) => {
        const res = await addItem?.(...args);
        // only on a real create (dataWrapper addItem returns {id} on success; a failed
        // apiUpdate throws past us and the modal stays open with the form intact)
        if (res?.id) {
            if (closeModalOnAddKey) clearActionParam?.(closeModalOnAddKey);
            if (addPublishCfg?.paramKey) setActionParam?.(addPublishCfg.paramKey, res.id);
        }
        return res;
    }, [addItem, closeModalOnAddKey, clearActionParam, addPublishCfg?.paramKey, setActionParam]);

    const clickSaveSubCfg = state.display?._functions?.subscribers?.find(s => s.functionId === 'click_save' && s.enabled);
    const clickSaveParam = clickSaveSubCfg && pageState
        ? pageState.filters.find(f => f.searchKey === clickSaveSubCfg.paramKey && f.type === 'action')
        : null;
    const [saveToken, setSaveToken] = useState(0);
    const handledSaveRef = useRef(false);

    useEffect(() => {
        if (!clickSaveSubCfg || !state.display?.allowEditInView || !clearActionParam) return;
        const paramValue = clickSaveParam?.values?.[0];
        if (paramValue !== undefined && !handledSaveRef.current) {
            handledSaveRef.current = true;
            setSaveToken(t => t + 1);
            clearActionParam(clickSaveSubCfg.paramKey);
        } else if (paramValue === undefined) {
            handledSaveRef.current = false;
        }
    }, [clickSaveParam, clickSaveSubCfg, state.display?.allowEditInView, clearActionParam]);

    return <Card columns={state.columns} data={state.data} display={state.display} sourceInfo={state.externalSource} setState={setState}
                 controls={{
                     ...controls,
                     FormulaColumnModal: AddFormulaColumn,
                     CalculatedColumnModal: AddCalculatedColumn,
                     ...(providerCfg ? { onCardMouseEnter, onCardMouseLeave } : {}),
                     ...(highlightedItem ? { highlightedItem } : {}),
                     ...(clickPublishCfg ? { onCardColumnClick, clickPublishColumn: clickPublishCfg.args?.column } : {}),
                     ...(saveToken > 0 ? { triggerSaveToken: saveToken } : {}),
                     ...(clickSaveSubCfg ? { clickSaveActive: true } : {}),
                     ...(Object.keys(activeColumns).length ? { activeColumns } : {}),
                 }}
                 isEdit={isEdit} updateItem={updateItem} addItem={(closeModalOnAddKey || addPublishCfg) ? addItemWrapped : addItem} newItem={newItem} setNewItem={setNewItem} allowEdit={allowEdit}
                 activeStyle={state.display?.cardStyle || activeStyle}
                 formatFunctions={formatFunctions}
    />
}

