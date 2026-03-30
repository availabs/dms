import React, {useEffect, useImperativeHandle, forwardRef} from "react";
import {isEqual} from "lodash-es";
import {useImmer} from "use-immer";
import DataWrapper from "./dataWrapper";
import {PageContext, ComponentContext} from '../../../context'
import { convertOldState } from "./dataWrapper/utils/convertOldState";
import { initialState } from "../section_utils";

/**
 * Non-data component wrapper — creates state + ComponentContext for components
 * that don't use the dataWrapper (lexical, Filter, Upload, Validate, etc.)
 */
function NonDataEditComp({ value, onChange, component, siteType, pageFormat }) {
    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', initialState(component?.defaultState), component?.name));
    const { apiLoad, apiUpdate } = React.useContext(PageContext) || {};

    useEffect(() => {
        if (!value?.['element-type']) {
            onChange({...value, 'element-type': 'lexical'})
        }
    }, []);

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate}}>
            <component.EditComp
                value={value?.['element-data'] || ''}
                onChange={v => updateAttribute('element-data', v)}
                siteType={siteType}
                pageFormat={pageFormat}
            />
        </ComponentContext.Provider>
    )
}

function NonDataViewComp({ value, onChange, component, siteType, pageFormat, editPageMode }) {
    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    const defaultComp = () => <div> Component {value?.["element-type"]} Not Registered </div>;
    const Comp = component ? component.ViewComp : defaultComp;

    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', initialState(component?.defaultState), component?.name));
    const { apiLoad, apiUpdate } = React.useContext(PageContext) || {};

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate}}>
            <Comp
                value={value?.['element-data'] || ''}
                onChange={v => updateAttribute('element-data', v)}
                siteType={siteType}
                pageFormat={pageFormat}
                editPageMode={editPageMode}
            />
        </ComponentContext.Provider>
    )
}

/**
 * EditComp — dispatches to DataWrapper (data components) or NonDataEditComp (everything else).
 * No hooks in this component — the conditional is safe because each branch is a separate component.
 */
const EditComp = forwardRef(({value, onChange, compKey, component, siteType, pageFormat, onHandle}, ref) => {
    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    if (component?.useDataWrapper) {
        return (
            <DataWrapper.EditComp
                ref={ref}
                key={compKey || ''}
                value={value?.['element-data'] || ''}
                onChange={v => updateAttribute('element-data', v)}
                component={component}
                siteType={siteType}
                pageFormat={pageFormat}
                onHandle={onHandle}
            />
        )
    }

    return (
        <NonDataEditComp
            value={value}
            onChange={onChange}
            component={component}
            siteType={siteType}
            pageFormat={pageFormat}
        />
    )
})

const ViewComp = forwardRef(({value, onChange, siteType, pageFormat, refreshDataBtnRef, component, editPageMode, onHandle}, ref) => {
    const { apiLoad } = React.useContext(PageContext) || {}

    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            onChange({...value, [k]: v})
        }
    }

    if (component?.useDataWrapper) {
        async function refresh({setIsRefreshingData, fullDataLoad, clearCache}) {
            if(clearCache) {
                const dwState = ref?.current?.state;
                if (dwState) {
                    updateAttribute('element-data', JSON.stringify({...dwState, ['fullData'] : undefined}));
                }
                return;
            }

            const getDataFn = DataWrapper.getData;
            if (!getDataFn) return;
            const dwState = ref?.current?.state;
            if (!dwState) return;
            setIsRefreshingData(true);
            const { data } = await getDataFn({
                state: dwState,
                apiLoad,
                keepOriginalValues: component.keepOriginalValues,
                fullDataLoad: component.fullDataLoad || fullDataLoad,
            });
            updateAttribute('element-data', JSON.stringify({...dwState, [fullDataLoad ? 'fullData' : 'data'] : data}));
            setIsRefreshingData(false)
        }

        // expose refresh() to parent
        React.useImperativeHandle(refreshDataBtnRef, () => ({
            refresh: refresh
        }));

        return (
            <DataWrapper.ViewComp
                ref={ref}
                value={value?.['element-data'] || ''}
                onChange={v => updateAttribute('element-data', v)}
                component={component}
                siteType={siteType}
                pageFormat={pageFormat}
                editPageMode={editPageMode}
                onHandle={onHandle}
            />
        )
    }

    return (
        <NonDataViewComp
            value={value}
            onChange={onChange}
            component={component}
            siteType={siteType}
            pageFormat={pageFormat}
            editPageMode={editPageMode}
        />
    )
})

const Component = {
    EditComp,
    ViewComp
}

export default Component
