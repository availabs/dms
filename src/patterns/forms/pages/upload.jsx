import React, {useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/patternListComponent/layout";
import Upload from "../components/upload";

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
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Upload', href: `${pageBaseUrl}/${params.id}/upload`}}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={item.views}
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
                        />
                }
            </div>
        </SourcesLayout>

    )
}

export default UploadPage