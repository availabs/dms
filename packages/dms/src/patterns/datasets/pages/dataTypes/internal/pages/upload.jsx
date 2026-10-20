import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from '../../../../context';
import { getExternalEnv } from '../../../../utils/datasources';

import Upload from "../../../../components/upload";
import {ThemeContext} from "../../../../../../ui/useTheme";
import { nameToSlug } from "../../../../../../utils/type-utils";
import { internalPagesTheme } from "./internalPages.theme";

const UploadPage = ({
    apiUpdate,
    apiLoad,
    format,
    source,
    params,
    isDms,
}) => {
    const {id, view_id} = params;
    const { API_HOST, baseUrl, pageBaseUrl, user, falcor, datasources } = React.useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const {theme} = useContext(ThemeContext) || {};
    const t = { ...internalPagesTheme, ...(theme?.datasets?.internalPages || {}) };
    const viewName = (source?.views || []).find(v => +(v.view_id || v.id) === +view_id)?.name;

    if(!isDms) return <></>
    return (
            <div className={t.uploadPage || undefined}>
                {t.uploadIntro && view_id && view_id !== 'undefined' ?
                    <p className={t.uploadIntro}>
                        Add rows to <b className={t.uploadIntroEm}>{viewName || `version ${view_id}`}</b> from a spreadsheet. Detected columns are matched to this source’s columns; matched rows update, the rest insert.
                    </p> : null}
                {
                    !view_id || view_id === 'undefined' ? <span className={t.emptyMsg || undefined}>Please select a version</span> :
                        <Upload.EditComp
                            onChange={() => {}}
                            size={1}
                            format={{app: source.app, type: `${nameToSlug(source.name)}|${view_id}:data`, config: source.config}}
                            view_id={view_id}
                            parent={source}
                            parentFormat={format}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            context={DatasetsContext}
                        />
                }
            </div>
    )
}

export default UploadPage
