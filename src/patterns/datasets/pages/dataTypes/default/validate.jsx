import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from '../../../context'
import SourcesLayout from "../../layout";
import Spreadsheet from "../../../../page/components/selector/ComponentRegistry/spreadsheet";
import {useNavigate} from "react-router";
import {cloneDeep} from "lodash-es";
import {ThemeContext} from "../../../../../ui/useTheme";
import {getSourceData, isJson} from "./utils";
import ValidateComp from "../../../components/ValidateComp";

export default function Validate ({apiUpdate, apiLoad, format, source, setSource, isDms, params}) {
    const {id, view_id} = params;

    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed, API_HOST, pgEnv } = useContext(DatasetsContext) || {};

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${params.id}/validate/${recentView}`)
        }
    }, [source.views]);

    const SpreadSheetCompWithControls = cloneDeep(Spreadsheet);
    SpreadSheetCompWithControls.controls.columns = SpreadSheetCompWithControls.controls.columns.filter(({label}) => label !== 'duplicate')
    if(!isDms) return;

    return (isDms && !source.config)? <div className={'p-1 text-center'}>Please setup metadata.</div> :
            !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
            <div className={`${theme?.page?.wrapper1} max-w-7xl mx-auto bg-white`}>
                <ValidateComp
                    API_HOST={API_HOST} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} theme={theme} user={user} falcor={falcor}
                    item={{...source, view_id: params.view_id, source_id: params.id, default_columns: source.default_columns || source.defaultColumns}}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                    cms_context={DatasetsContext}
                />
            </div>
}