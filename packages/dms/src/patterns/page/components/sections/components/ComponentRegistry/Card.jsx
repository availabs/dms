import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ComponentContext, PageContext } from "../../../../context";
import { ThemeContext } from "../../../../../../ui/useTheme";
import { formatFunctions } from "../dataWrapper/utils/utils";
import AddFormulaColumn from "../../AddFormulaColumn";
import AddCalculatedColumn from "../../AddCalculatedColumn";

// cards can be:
// one cell per row, that carries one column's data,
// one cell per row, that can carry multiple column's data
// compact view: bg color per card (which is a row)
// simple view: one cell per column - value pair; span; inline vs stacked; reverse; bg color per column

export const CardSection = ({
                  isEdit, //edit mode
                  updateItem, addItem,
                  newItem, setNewItem,
                  allowEdit // is data edit allowed
              }) => {
    const {UI} = useContext(ThemeContext);
    const {Card} = UI;
    const {state, setState, controls={}} = useContext(ComponentContext);
    const { pageState, setActionParam, clearActionParam } = useContext(PageContext) || {};

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

    const clickSaveSubCfg = state.display?._functions?.subscribers?.find(s => s.functionId === 'click_save' && s.enabled);
    const clickSaveParam = clickSaveSubCfg && pageState
        ? pageState.filters.find(f => f.searchKey === clickSaveSubCfg.paramKey && f.type === 'action')
        : null;
    const [saveToken, setSaveToken] = useState(0);
    const handledSaveRef = useRef(false);
    console.log('click actions', clickPublishCfg, clickSaveSubCfg, saveToken)

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
                 }}
                 isEdit={isEdit} updateItem={updateItem} addItem={addItem} newItem={newItem} setNewItem={setNewItem} allowEdit={allowEdit}
                 formatFunctions={formatFunctions}
    />
}

