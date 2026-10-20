import React, {useContext, useEffect} from "react";
import { DatasetsContext } from '../../../../context'
import { getExternalEnv } from '../../../../utils/datasources'
import {useNavigate} from "react-router";
import {ThemeContext} from "../../../../../../ui/useTheme";
import ValidateComp from "../../../../components/ValidateComp";
import { internalPagesTheme } from "./internalPages.theme";

export default function Validate ({apiUpdate, apiLoad, format, source, setSource, isDms, params}) {
    const {id, view_id} = params;

    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed, API_HOST, datasources } = useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${params.id}/validate/${recentView}`)
        }
    }, [source.views]);

    const t = { ...internalPagesTheme, ...(theme?.datasets?.internalPages || {}) };

    if(!isDms) return;

    return (isDms && !source.config)? <div className={t.noMetaMsg}>Please setup metadata.</div> :
            !params.view_id || params.view_id === 'undefined' ? <span className={t.emptyMsg || undefined}>Please select a version</span> :
            <div className={t.validatePage || `${theme?.page?.wrapper1} max-w-7xl mx-auto bg-white`}>
                <ValidateComp
                    API_HOST={API_HOST} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} theme={theme} user={user} falcor={falcor}
                    item={{...source, view_id: params.view_id, source_id: params.id, default_columns: source.default_columns || source.defaultColumns}}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                    cms_context={DatasetsContext}
                />
            </div>
}