import React, {useState, useEffect, createContext, useMemo, useRef} from 'react'

import {RenderFilters} from "./shared/filters/RenderFilters";
import {DataSourceSelector} from "./DataSourceSelector";
import {Controls} from "../dataWrapper/components/Controls";
import {useImmer} from "use-immer";
import {isJson} from "../dataWrapper/utils/utils";
const FilterComponentContext = React.createContext({});

const initialState = {
    columns: [], // {name, filters: []}
    display: {
        allowSearchParams: false,
    },
    sourceInfo: {
        columns: [],
        // pgEnv,
        // source_id
        // view_id
        // version,
        // doc_type, type -- should be the same
    }
}

const Edit = ({value, onChange, pageFormat, apiLoad, apiUpdate, renderCard}) => {
    const isEdit = Boolean(onChange);
    const [state, setState] = useImmer(isJson(value) ? JSON.parse(value) : initialState);

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;
        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    return (
        <FilterComponentContext.Provider value={{state, setState, controls: {
            columns: [{type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]}]
        }
        }}>
            <div className={'w-full h-full min-h-[50px]'}>
                <DataSourceSelector apiLoad={apiLoad} app={pageFormat?.app}
                                    state={state} setState={setState} // passing as props as other components will use it as well.
                />
                { isEdit ? <Controls context={FilterComponentContext} /> : null }

                <div className={'w-full pt-2 flex justify-end gap-2'}>
                    <RenderFilters state={state} setState={setState} apiLoad={apiLoad} isEdit={isEdit} defaultOpen={true} />
                </div>
            </div>
        </FilterComponentContext.Provider>
    )
}

const View = ({value, onChange, size, apiLoad, apiUpdate, renderCard, ...rest}) => {
    const isEdit = false;
    const [state, setState] = useImmer(isJson(value) ? JSON.parse(value) : initialState);

    useEffect(() => {
        setState(isJson(value) ? JSON.parse(value) : initialState)
    }, [value]);

    return (
            <div className={'w-full h-full min-h-[50px]'}>
                <div className={'w-full pt-2 flex justify-end gap-2'}>
                    <RenderFilters state={state} setState={setState} apiLoad={apiLoad} isEdit={isEdit} defaultOpen={true} showNavigate={true}/>
                </div>
            </div>
)
}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

export default {
    "name": 'Filter',
    "type": 'filter',
    "variables": [],
    "EditComp": Edit,
    "ViewComp": View
}