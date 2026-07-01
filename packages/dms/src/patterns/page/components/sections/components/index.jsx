import React, {useEffect, useRef, useState, useImperativeHandle, forwardRef} from "react";
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
function NonDataEditComp({ value, onChange, component, siteType, pageFormat, onHandle: parentOnHandle, sectionId }) {
    // Track the last element-data we emitted so we can tell external changes (paste)
    // from our own onChange round-trips.
    const lastEmitted = useRef(value?.['element-data']);
    /**
     * Preserve the most recent map handle field emitted by the child so the
     * wrapper's later generic handle updates do not drop it.
     */
    const mapAPIRef = useRef(null);
    const [childKey, setChildKey] = useState(0);

    const updateAttribute = (k, v) => {
        if (!isEqual(value, {...value, [k]: v})) {
            if (k === 'element-data') lastEmitted.current = v;
            onChange({...value, [k]: v})
        }
    }

    const [state, setState] = useImmer(convertOldState(value?.['element-data'] || '', initialState(component?.defaultState), component?.name));
    const { apiLoad, apiUpdate } = React.useContext(PageContext) || {};

    // When element-data arrives from outside (paste), remount the child so it
    // reinitialises its own state (e.g. RichtextEdit's `text` useState).
    const elementData = value?.['element-data'];
    useEffect(() => {
        if (elementData === lastEmitted.current) return;
        lastEmitted.current = elementData;
        setState(convertOldState(elementData || '', initialState(component?.defaultState), component?.name));
        setChildKey(k => k + 1);
    }, [elementData]);

    /**
     * Forward child handles upstream immediately, while caching map-specific
     * API fields that the wrapper itself does not recreate.
     */
    const onHandle = React.useCallback((nextHandle) => {
        if (nextHandle?.mapAPI) {
            mapAPIRef.current = nextHandle.mapAPI;
        }
        parentOnHandle?.(nextHandle);
    }, [parentOnHandle]);

    /**
     * Re-emit the wrapper-owned handle whenever local wrapper state changes,
     * while reattaching any cached map API from the child handle.
     */
    useEffect(() => {
        if (!parentOnHandle) return;
        const setDisplay = (key, value, onChangeCb) => {
            setState(draft => {
                if (!draft.display) draft.display = {};
                draft.display[key] = value;
            });
            onChangeCb?.({ key, value, state });
        };
        parentOnHandle({
            state,
            setState,
            dwAPI: { state, setState, setDisplay },
            mapAPI: mapAPIRef.current ?? null,
        });
    }, [parentOnHandle, setState, state]);

    useEffect(() => {
        if (!value?.['element-type']) {
            onChange({...value, 'element-type': 'lexical'})
        }
    }, []);

    return (
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, sectionId}}>
            <component.EditComp
                key={childKey}
                value={elementData || ''}
                onChange={v => updateAttribute('element-data', v)}
                siteType={siteType}
                pageFormat={pageFormat}
                onHandle={onHandle}
            />
        </ComponentContext.Provider>
    )
}

function NonDataViewComp({ value, onChange, component, siteType, pageFormat, editPageMode, sectionId }) {
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
        <ComponentContext.Provider value={{state, setState, apiLoad, apiUpdate, sectionId}}>
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
const EditComp = forwardRef(({value, onChange, compKey, component, siteType, pageFormat, onHandle, sectionId}, ref) => {
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
                sectionId={sectionId}
            />
        )
    }

    return (
        <NonDataEditComp
            key={compKey || ''}
            value={value}
            onChange={onChange}
            component={component}
            siteType={siteType}
            pageFormat={pageFormat}
            onHandle={onHandle}
            sectionId={sectionId}
        />
    )
})

const ViewComp = forwardRef(({value, onChange, siteType, pageFormat, refreshDataBtnRef, component, editPageMode, onHandle, sectionId}, ref) => {
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
                sectionId={sectionId}
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
            sectionId={sectionId}
        />
    )
})

const Component = {
    EditComp,
    ViewComp
}

export default Component
