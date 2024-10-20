import React, {useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/selector/ComponentRegistry/patternListComponent/layout";
import Upload from "../components/selector/ComponentRegistry/upload";

const UploadPage = ({
    adminPath,
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
    parent,
    manageTemplates = false,
    // ...rest
}) => {
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Upload', href: `${pageBaseUrl}/${params.id}/upload`}}
                       id={params.id} //page id to use for navigation

        >
            <div className={`${theme?.page?.wrapper1}`}>
                <Upload.EditComp
                    onChange={() => {}}
                    size={1}
                    format={{app: item.app, type: item.doc_type, config: item.config}}
                    parent={item}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                />
            </div>
        </SourcesLayout>

    )
}

export default UploadPage