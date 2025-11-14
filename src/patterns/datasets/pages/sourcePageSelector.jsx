import React, {useContext, useEffect, useState} from "react";
import {DatasetsContext} from "../context";
import {getSourceData} from "./dataTypes/default/utils";
import SourcesLayout from "./layout";
import Overview from "./dataTypes/default/overview"
import Admin from "./dataTypes/default/admin"
import Version from "./dataTypes/default/version"

const fixedPages = ['overview', 'admin']

const defaultPages = {
    overview: Overview,
    admin: Admin,
    version: Version
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

    if(!source.id && !source.source_id) return loading ?  'loading' : <></>;

    const sourceType = isDms ? 'internal_dataset' : source?.categories?.[0]?.[0]; // source identifier. this is how the source is named in the script. this used to be type.
    const sourceDataType = isDms ? 'internal_dataset' : source?.type; // csv / gis / internal
    const sourcePages = datasets[sourceType] || datasets[sourceDataType] || {};

    const sourcePagesNavItems =
        (Object.values(sourcePages) || [])
            .map(p => ({
                name: p.name,
                href: (p.path || p.href || '').replace('/', ''),
                cdn: p.cdn // condition fn with arguments ({isDms, sourceType}) to control visibility in nav
            }))
            .filter(p => p.href && !fixedPages.includes(p.href));
    console.log('???', datasets)
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