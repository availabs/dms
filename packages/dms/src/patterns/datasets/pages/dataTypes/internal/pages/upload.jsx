import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from '../../../../context';
import { getExternalEnv } from '../../../../utils/datasources';

import Upload from "../../../../components/upload";
import {ThemeContext} from "../../../../../../ui/useTheme";
import {getSourceData} from "../../default/utils";

const UploadPage = ({
    apiUpdate,
    apiLoad,
    format,
    source,
    params,
    isDms,
}) => {
    const {id, view_id} = params;
    const { API_HOST, baseUrl, pageBaseUrl, user, falcor, datasources } = React.useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const {theme} = useContext(ThemeContext) || {};
    if(!isDms) return <></>
    return (
            <div>
                {
                    !view_id || view_id === 'undefined' ? 'Please select a version' :
                        <Upload.EditComp
                            onChange={() => {}}
                            size={1}
                            format={{app: source.app, type: `${source.doc_type}-${view_id}`, config: source.config}}
                            view_id={view_id}
                            parent={source}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            context={DatasetsContext}
                        />
                }
            </div>
    )
}

export default UploadPage