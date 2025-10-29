import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from '../context'
import SourcesLayout from "../components/DatasetsListComponent/layout";
import Spreadsheet from "../../page/components/selector/ComponentRegistry/spreadsheet";
import {useNavigate} from "react-router";
import {cloneDeep} from "lodash-es";
import {ThemeContext} from "../../../ui/useTheme";
import {getSourceData, isJson} from "./utils";
import ValidateComp from "../components/ValidateComp";

export default function Validate ({apiUpdate, apiLoad, format, item, params}) {
    const {pgEnv, id, view_id} = params;
    const isDms = pgEnv === 'internal';

    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed, API_HOST } = useContext(DatasetsContext) || {};
    const [source, setSource] = useState(isDms ? item : {});

    useEffect(() => {
        // if(isDms) // use item
        if((!isDms || (isDms && !Object.entries(item).length)) && id && pgEnv){
            // fetch source data
            getSourceData({pgEnv, falcor, source_id: id, setSource});
        }
    }, [isDms, id, pgEnv])


    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            const recentView = Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${pgEnv}/${params.id}/validate/${recentView}`)
        }
    }, [source.views]);

    const SpreadSheetCompWithControls = cloneDeep(Spreadsheet);
    SpreadSheetCompWithControls.controls.columns = SpreadSheetCompWithControls.controls.columns.filter(({label}) => label !== 'duplicate')
    if(!isDms) return;

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: source.name || source.doc_type, href: format.url_slug}}
                       page={{name: 'Validate', href: `${pageBaseUrl}/${pgEnv}/${params.id}/validate`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={source.views}
                       pgEnv={pgEnv}
                       sourceType={isDms ? 'internal' : source.type}
                       showVersionSelector={true}
        >
            {
                (isDms && !source.config)? <div className={'p-1 text-center'}>Please setup metadata.</div> :
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                    <div className={`${theme?.page?.wrapper1} max-w-7xl mx-auto bg-white`}>
                        <ValidateComp
                            API_HOST={API_HOST} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} theme={theme} user={user} falcor={falcor}
                            item={{...item, view_id: params.view_id, source_id: params.id, default_columns: item.default_columns || item.defaultColumns}}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            cms_context={DatasetsContext}
                        />
                    </div>
            }

        </SourcesLayout>

    )
}