import React, {useEffect, useContext} from 'react'
import {isJson} from "../dataWrapper/utils/utils";
import Upload from "../../../../../forms/components/upload";
import { CMSContext, ComponentContext } from "../../../../context";
import { getExternalEnv } from "../../../../pages/_utils/datasources";

const UploadComponentContext = React.createContext({});

const defaultState = {
    columns: [],
    display: {
        usePageFilters: false,
    },
    externalSource: {
        columns: [],
    }
}

export const UploadEdit = ({onChange}) => {
    const isEdit = Boolean(onChange);
    const {state, setState} = useContext(ComponentContext);

    // =========================================== saving settings begin ===============================================
    useEffect(() => {
        if (!isEdit) return;
        onChange(JSON.stringify(state));
    }, [state])
    // =========================================== saving settings end =================================================

    return (
        <div className={'w-full h-full min-h-[50px]'}>Please select target dataset.</div>
    )
}

export const UploadView = ({value}) => {
    const {state, setState, apiLoad, apiUpdate} = useContext(ComponentContext);
    const {API_HOST, user, falcor, datasources} = useContext(CMSContext);
    const pgEnv = getExternalEnv(datasources);

    useEffect(() => {
        setState(isJson(value) ? JSON.parse(value) : defaultState)
    }, [value]);

    return (
            <UploadComponentContext.Provider value={{state, API_HOST, user, falcor, pgEnv}}>
                <div className={'w-full h-full min-h-[50px]'}>
                    <div className={'w-full pt-2 flex justify-end gap-2'}>
                        <Upload.EditComp
                            onChange={() => {}}
                            size={1}
                            format={{
                                app: state.externalSource.app,
                                type: `${state.externalSource.type}-${state.externalSource.view_id}`,
                                config: JSON.stringify({attributes: state.externalSource.columns})
                            }}
                            view_id={state.externalSource.view_id}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            updateMeta={false}
                            context={UploadComponentContext}
                        />
                    </div>
                </div>
            </UploadComponentContext.Provider>
)
}

UploadEdit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}