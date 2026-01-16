import React, {useEffect, useContext} from 'react'
import {isJson} from "../dataWrapper/utils/utils";
import Upload from "../../../../../forms/components/upload";
import { CMSContext, ComponentContext } from "../../../../context";
const UploadComponentContext = React.createContext({});

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
        <div className={'w-full h-full min-h-[50px]'}>Please select target dataset.</div>
    )
}

const View = ({value}) => {
    const {state, setState, apiLoad, apiUpdate} = useContext(ComponentContext);
    const {API_HOST, user, falcor, pgEnv} = useContext(CMSContext);

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
                                app: state.sourceInfo.app,
                                type: `${state.sourceInfo.type}-${state.sourceInfo.view_id}`,
                                config: JSON.stringify({attributes: state.sourceInfo.columns})
                            }}
                            view_id={state.sourceInfo.view_id}
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

Edit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

export default {
    "name": 'Upload',
    "type": 'upload',
    defaultState,
    useDataSource: true,
    "variables": [],
    "EditComp": Edit,
    "ViewComp": View
}