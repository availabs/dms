import React, {useEffect, useContext} from 'react'
import {isJson} from "../dataWrapper/utils/utils";
import Validate from "../../../../../forms/components/validate";
import { CMSContext, ComponentContext } from "../../../../context";

const defaultState = {
    columns: [],
    display: {
        usePageFilters: false,
    },
    externalSource: {
        columns: [],
    }
}

export const ValidateEdit = ({onChange}) => {
    const isEdit = Boolean(onChange);
    const {state, setState} = useContext(ComponentContext);

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;
        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    return (
        <div className={'w-full h-full min-h-[50px]'}>Please select a dataset to validate.</div>
    )
}

export const ValidateView = ({value, onChange, renderCard, ...rest}) => {
    const {state, setState, apiLoad, apiUpdate} = useContext(ComponentContext);
    const {API_HOST, user, falcor} = useContext(CMSContext);

    useEffect(() => {
        setState(isJson(value) ? JSON.parse(value) : defaultState)
    }, [value]);
    console.log('state', state)
    if(!state?.externalSource?.app) return <></>
    return (
        <div className={'w-full h-full min-h-[50px]'}>
            <div className={'w-full pt-2 flex justify-end gap-2'}>
                <Validate.EditComp
                    cms_context={CMSContext}
                    onChange={() => {}}
                    size={1}
                    item={{
                        ...state.externalSource,
                        // app: state.externalSource.app,
                        doc_type: state.externalSource.type,
                        source_id: `${state.externalSource.source_id}`,
                        view_id: `${state.externalSource.view_id}`,
                        default_columns: JSON.parse(state.externalSource.default_columns || '[]'),
                        // defaultColumns: [state.externalSource.columns[0], state.externalSource.columns[1]],
                        config: JSON.stringify({attributes: state.externalSource.columns})
                    }}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                    API_HOST={API_HOST} user={user} falcor={falcor}
                />
            </div>
        </div>
)}

ValidateEdit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}