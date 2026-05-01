import React, { useCallback, useContext } from "react";
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
    const { setActionParam, clearActionParam } = useContext(PageContext) || {};

    const providerCfg = state.display?._functions?.providers?.find(p => p.functionId === 'hover_highlight' && p.enabled);

    const onCardMouseEnter = useCallback((item) => {
        if (!providerCfg || !setActionParam) return;
        const value = item?.[providerCfg.args?.column];
        if (value !== undefined) setActionParam(providerCfg.paramKey, value);
    }, [providerCfg, setActionParam]);

    const onCardMouseLeave = useCallback(() => {
        if (!providerCfg || !clearActionParam) return;
        clearActionParam(providerCfg.paramKey);
    }, [providerCfg, clearActionParam]);

    return <Card columns={state.columns} data={state.data} display={state.display} sourceInfo={state.externalSource} setState={setState}
                 controls={{
                     ...controls,
                     FormulaColumnModal: AddFormulaColumn,
                     CalculatedColumnModal: AddCalculatedColumn,
                     ...(providerCfg ? { onCardMouseEnter, onCardMouseLeave } : {}),
                 }}
                 isEdit={isEdit} updateItem={updateItem} addItem={addItem} newItem={newItem} setNewItem={setNewItem} allowEdit={allowEdit}
                 formatFunctions={formatFunctions}
    />
}

