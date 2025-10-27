import React, {useEffect} from "react";
import { DatasetsContext } from '../context'
import SourcesLayout from "../components/DatasetsListComponent/layout";
import MetadataComp from "../components/MetadataComp";
import {getSourceData, updateSourceData} from "~/modules/dms/src/patterns/datasets/pages/utils";

export default function ManageForm ({
    status,
    apiUpdate,
    attributes,
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    manageTemplates = false,
    apiLoad,
    ...rest
}) {
    const {pgEnv, id} = params;
    const isDms = pgEnv === 'internal';

    const { baseUrl, pageBaseUrl, theme, falcor } = React.useContext(DatasetsContext) || {}
    const [source, setSource] = React.useState(isDms ? item : {});

    useEffect(() => {
        // if(isDms) // use item
        if((!isDms || (isDms && !Object.entries(item).length)) && id && pgEnv){
            // fetch source data
            getSourceData({pgEnv, falcor, source_id: id, setSource});
        }
    }, [isDms, item.config])


    console.log('source', source)

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: source.name || source.doc_type, href: format.url_slug}}
                       page={{name: 'Metadata', href: `${pageBaseUrl}/${pgEnv}/${params.id}`}}
                       id={params.id} //page id to use for navigation
        >
            <div className={`${theme?.page?.wrapper1}`}>
                    <div className={'overflow-auto flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        <div className='w-full'>
                            <MetadataComp
                                value={isDms ? item?.config : source?.metadata}
                                accessKey={isDms ? 'attributes' : 'columns'}
                                onChange={(v) => {
                                    console.log('updated data', v)
                                    updateSourceData({data: v, attrKey: isDms ? 'config' : 'metadata', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
                                }}
                                apiLoad={apiLoad}
                                format={format}
                            />
                        </div>
                    </div>
            </div>
        </SourcesLayout>
    )
}