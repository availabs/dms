import React, {useContext, useEffect, useState} from "react";
import {DatasetsContext} from "../context";
import {getSourceData} from "./dataTypes/default/utils";
import SourcesLayout from "./layout";

import Overview from "./dataTypes/default/overview"
import Table from "./dataTypes/default/table"
import Admin from "./dataTypes/default/admin"
import Upload from "./dataTypes/default/upload"
import Metadata from "./dataTypes/default/metadata"
import Validate from "./dataTypes/default/validate"
import Version from "./dataTypes/default/version"
import Map from "./dataTypes/default/map";
const fixedPages = ['overview', 'table', 'admin', 'metadata']
const defaultPages = {
    overview: Overview,
    table: Table,
    admin: Admin,
    metadata: Metadata,

    upload: Upload,
    validate: Validate,
    version: Version,
    map: Map
}
export default function ({ apiLoad, apiUpdate, format, item, params, isDms }) {
    const {baseUrl, pageBaseUrl, user, isUserAuthed, UI, pgEnv, falcor, datasets} = useContext(DatasetsContext);
    const [source, setSource] = useState(isDms ? item : {});
    const [loading, setLoading] = useState(false);
    const {id, view_id, page} = params;

    useEffect(() => {
        // if(isDms) // use item
        async function load() {
            setLoading(true)
            await getSourceData({
                pgEnv: isDms ? `${format.app}+${format.type}` : pgEnv,
                falcor,
                source_id: id,
                setSource
            });
            setLoading(false)
        }

        if(((!isDms && pgEnv) || (isDms && !Object.entries(item).length)) && id){
            // fetch source data
            load()
        }
    }, [isDms, item.config])

    // todo check if source's source type (categories[0][0] || sourceType) contains the page. fallback to default pages.
    // overview, table, admin default pages. sources can override them. 

    if(!source.id && !source.source_id) return loading ?  'loading' : <></>;
    const sourceType = source?.categories?.[0]?.[0]; // source identifier. this is how the source is named in the script. this used to be type.
    const sourceDataType = source?.type; // csv / gis / analysis
    const sourcePages = datasets[sourceType] || datasets[sourceDataType] || {};
    const sourcePagesNavItems =
        (Object.values(sourcePages) || [])
            .map(p => ({
                name: p.name,
                href: (p.path || p.href || '').replace('/', ''),
                cdn: p.cdn // condition fn with arguments ({isDms, sourceType}) to control visibility in nav
            }))
            .filter(p => !fixedPages.includes(p.href));

    const Page = fixedPages.includes(page) ? defaultPages[page] : (sourcePages[page]?.component || defaultPages[page] || Overview);
    return  (<SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                           form={{name: source?.name || source?.doc_type, href: format.url_slug}}
                           page={{name: page, href: `${pageBaseUrl}/${params.id}${page ? `/${page}` : ''}${view_id ? `/${view_id}` : ``}`}}
                           isDms={isDms}
                           sourceType={isDms ? 'internal' : source.type}
                           id={params.id} //page id to use for navigation
                           view_id={params.view_id}
                           views={source.views}
                            showVersionSelector={['table', 'upload', 'validate', 'map'].includes(page)}
                            additionalNavItems={sourcePagesNavItems}
    >
        <Page format={format}
              source={source} setSource={setSource}
              params={params}
              isDms={isDms}
              apiLoad={apiLoad} apiUpdate={apiUpdate}
              context={DatasetsContext}
        />
    </SourcesLayout>)
}