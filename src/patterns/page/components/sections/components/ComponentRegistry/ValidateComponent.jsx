import React, {useEffect, useContext} from 'react'
import {isJson} from "../dataWrapper/utils/utils";
import Validate from "../../../../../forms/components/validate";
import { CMSContext, ComponentContext } from "../../../../context";

const defaultState = {
    columns: [],
    display: {
        usePageFilters: false,
    },
    sourceInfo: {
        columns: [],
    }
}

const Edit = ({onChange}) => {
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

const View = ({value, onChange, renderCard, ...rest}) => {
    const {state, setState, apiLoad, apiUpdate} = useContext(ComponentContext);
    const {API_HOST, user, falcor} = useContext(CMSContext);

    useEffect(() => {
        setState(isJson(value) ? JSON.parse(value) : defaultState)
    }, [value]);
    console.log('state', state)
    if(!state?.sourceInfo?.app) return <></>
    return (
        <div className={'w-full h-full min-h-[50px]'}>
            <div className={'w-full pt-2 flex justify-end gap-2'}>
                <Validate.EditComp
                    cms_context={CMSContext}
                    onChange={() => {}}
                    size={1}
                    item={{
                        ...state.sourceInfo,
                        // app: state.sourceInfo.app,
                        doc_type: state.sourceInfo.type,
                        source_id: `${state.sourceInfo.source_id}`,
                        view_id: `${state.sourceInfo.view_id}`,
                        default_columns: JSON.parse(state.sourceInfo.default_columns || '[]'),
                        // defaultColumns: [state.sourceInfo.columns[0], state.sourceInfo.columns[1]],
                        config: JSON.stringify({attributes: state.sourceInfo.columns})
                    }}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                    API_HOST={API_HOST} user={user} falcor={falcor}
                />
            </div>
        </div>
)}

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

export default {
    "name": 'Validate',
    "type": 'Validate',
    defaultState,
    useDataSource: true,
    "variables": [],
    "EditComp": Edit,
    "ViewComp": View
}