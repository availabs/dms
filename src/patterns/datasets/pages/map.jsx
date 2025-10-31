import React, {useContext, useEffect, useMemo, useState} from "react";
import { DatasetsContext } from '../context'
import SourcesLayout from "../components/DatasetsListComponent/layout";
import {useNavigate} from "react-router";
import {AuthContext} from "../../auth/context";
import {ThemeContext} from "../../../ui/useTheme";
import {getSourceData, isJson} from "./utils";
import Map from "./Map"

export default function Table ({apiUpdate, apiLoad, format, item, params}) {
    const {pgEnv, id, view_id} = params;
    const isDms = pgEnv === 'internal';

    const navigate = useNavigate();
    const {theme} = useContext(ThemeContext) || {};
    const { falcor, baseUrl, pageBaseUrl, user, isUserAuthed } = useContext(DatasetsContext) || {};
    const authContext = useContext(AuthContext) || {};
    console.log('auth context', authContext)
    const [source, setSource] = useState(isDms ? item : {});

    let columns = useMemo(() =>
        isDms ?
            isJson(item.config) ? JSON.parse(item.config)?.attributes : [] :
            (source?.metadata?.columns || []), [item.config, isDms, source?.metadata?.columns])

    const default_columns = (item?.default_columns || item?.defaultColumns) || [];

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
            navigate(`${pageBaseUrl}/${pgEnv}/${params.id}/map/${recentView}`)
        }
    }, [source.views]);

    if(!isDms && !source.source_id) return ;
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: source.name || source.doc_type, href: format.url_slug}}
                       page={{name: 'Map', href: `${pageBaseUrl}/${pgEnv}/${params.id}/map`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={source.views}
                       pgEnv={pgEnv}
                       sourceType={isDms ? 'internal' : source.type}
                       showVersionSelector={true}
        >
            {
                !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                    <Map source={source} views={source.views} />
            }

        </SourcesLayout>

    )
}