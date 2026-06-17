import React, {useEffect} from "react";
import { DatasetsContext } from '../../../../context'
import { getExternalEnv } from '../../../../utils/datasources'
// import SourcesLayout from "../../../layout";
import MetadataComp from "../../../../components/MetadataComp";
import {updateSourceData} from "../../default/utils";
import { ThemeContext } from "../../../../../../ui/useTheme";
import { gisPagesTheme } from "./gisPages.theme";

export default function ManageForm ({
    status,
    apiUpdate,
    format,
    source, setSource,
    params,
    apiLoad,
    isDms,
}) {
    const {id} = params;
    const { baseUrl, pageBaseUrl, theme: pageTheme, falcor, datasources } = React.useContext(DatasetsContext) || {}
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...gisPagesTheme, ...(theme?.datasets?.gisPages || {}) };
    const pgEnv = getExternalEnv(datasources);
    const env = isDms ? `${format?.app}+${source?.type}` : pgEnv;

    return (
      <div className={`${pageTheme?.page?.wrapper1}`}>
        <div className={t.metaOuter}>
            {status ? <div>{JSON.stringify(status)}</div> : ''}
            <div className={t.metaInner}>
                <MetadataComp
                    isDms={isDms}
                    value={isDms ? source?.config : source?.metadata}
                    accessKey={isDms ? 'attributes' : 'columns'}
                    onChange={(v) => {
                        updateSourceData({data: v, attrKey: isDms ? 'config' : 'metadata', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                    }}
                    onIndexChange={async (columnName, enable) => {
                        await falcor.call(['uda', 'sources', 'setIndex'], [env, id, columnName, enable]);
                    }}
                    apiLoad={apiLoad}
                    format={format}
                />
            </div>
        </div>
      </div>
    )
}
