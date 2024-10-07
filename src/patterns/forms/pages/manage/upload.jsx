import React, {useContext, useEffect, useState} from "react";
import { FormsContext } from '../../'
import SourcesLayout from "../../components/selector/ComponentRegistry/patternListComponent/layout";
import Spreadsheet from "../../components/selector/ComponentRegistry/spreadsheet";
import Upload from "../../components/selector/ComponentRegistry/upload";

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
    const { API_HOST, baseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: format.type, href: format.url_slug}}
                       page={{name: 'Upload', href: `${baseUrl}/manage/upload`}}>
            <div className={`${theme?.page?.wrapper1}`}>
                <Upload.EditComp
                    onChange={() => {}}
                    size={1}
                    format={format}
                    parent={parent}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                />
            </div>
        </SourcesLayout>

    )
}

export default UploadPage