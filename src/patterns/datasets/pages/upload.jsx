import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from '../context';
import SourcesLayout from "../components/DatasetsListComponent/layout";
import Upload from "../components/upload";
import {ThemeContext} from "../../../ui/useTheme";
import {getSourceData} from "../pages/utils";

const UploadPage = ({
    status,
    apiUpdate,
    apiLoad,
    attributes={},
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    manageTemplates = false,
    // ...rest
}) => {
    const {pgEnv, id, view_id} = params;
    const isDms = pgEnv === 'internal';
    const { API_HOST, baseUrl, pageBaseUrl, user, falcor } = React.useContext(DatasetsContext) || {};
    const {theme} = useContext(ThemeContext) || {};
    const [source, setSource] = useState(isDms ? item : {});


    useEffect(() => {
        // if(isDms) // use item
        if((!isDms || (isDms && !Object.entries(item).length)) && id && pgEnv){
            // fetch source data
            getSourceData({pgEnv, falcor, source_id: id, setSource});
        }
    }, [isDms, id, pgEnv])

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: source.name || source.doc_type, href: format.url_slug}}
                       page={{name: 'Upload', href: `${pageBaseUrl}/${pgEnv}/${params.id}/upload`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={source.views}
                       pgEnv={pgEnv}
                       sourceType={isDms ? 'internal' : source.type}
                       showVersionSelector={true}

        >
            <div className={`${theme?.page?.wrapper1}`}>
                {
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                        <Upload.EditComp
                            onChange={() => {}}
                            size={1}
                            format={{app: item.app, type: `${item.doc_type}-${params.view_id}`, config: item.config}}
                            view_id={params.view_id}
                            parent={item}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            context={DatasetsContext}
                        />
                }
            </div>
        </SourcesLayout>

    )
}

export default UploadPage