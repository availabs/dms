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
    const { baseUrl, pageBaseUrl, theme: pageTheme, falcor, datasources, isUserAuthed } = React.useContext(DatasetsContext) || {}
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...gisPagesTheme, ...(theme?.datasets?.gisPages || {}) };
    const pgEnv = getExternalEnv(datasources);
    const env = isDms ? `${format?.app}+${source?.type}` : pgEnv;
    const [pkeyInfo, setPkeyInfo] = React.useState(null);
    // Same check the server enforces on the write route (uda.route.js) — mirrors the
    // pattern⊕source auth_permissions merge SourcePage.jsx already provides on context.
    const canEdit = isUserAuthed ? isUserAuthed(['update-source']) : false;

    useEffect(() => {
        if (isDms || !falcor || !id) return;
        falcor.get(['uda', env, 'sources', 'byId', +id, 'pkeyInfo']).then(res => {
            setPkeyInfo(res?.json?.uda?.[env]?.sources?.byId?.[id]?.pkeyInfo || null);
        });
    }, [isDms, falcor, env, id]);

    return (
      <div className={`${pageTheme?.page?.wrapper1}`}>
        <div className={t.metaOuter}>
            {status ? <div>{JSON.stringify(status)}</div> : ''}
            <div className={t.metaInner}>
                {!canEdit &&
                    <div className={t.readOnlyBanner}>
                        You do not have permission to edit this source's metadata. Viewing read-only.
                    </div>
                }
                <MetadataComp
                    isDms={isDms}
                    canEdit={canEdit}
                    value={isDms ? source?.config : source?.metadata}
                    accessKey={isDms ? 'attributes' : 'columns'}
                    onChange={(v) => {
                        if (!canEdit) return;
                        updateSourceData({data: v, attrKey: isDms ? 'config' : 'metadata', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                            .catch(e => console.error('Failed to save source metadata', e));
                    }}
                    onIndexChange={canEdit ? async (columnName, enable) => {
                        await falcor.call(['uda', 'sources', 'setIndex'], [env, id, columnName, enable]);
                    } : undefined}
                    onSetPrimaryKey={(isDms || !canEdit) ? undefined : async (columnName, enable = true) => {
                        await falcor.call(['uda', 'sources', 'setPrimaryKey'], [env, id, columnName, enable]);
                        const res = await falcor.get(['uda', env, 'sources', 'byId', +id, 'pkeyInfo']);
                        setPkeyInfo(res?.json?.uda?.[env]?.sources?.byId?.[id]?.pkeyInfo || null);
                    }}
                    pkeyInfo={pkeyInfo}
                    apiLoad={apiLoad}
                    format={format}
                />
            </div>
        </div>
      </div>
    )
}
