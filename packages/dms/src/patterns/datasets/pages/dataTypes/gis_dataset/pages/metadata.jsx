import React, {useEffect} from "react";
import { Link } from "react-router";
import { DatasetsContext } from '../../../../context'
import { getExternalEnv } from '../../../../utils/datasources'
// import SourcesLayout from "../../../layout";
import MetadataComp from "../../../../components/MetadataComp";
import {updateSourceData} from "../../default/utils";
import { ThemeContext, getComponentTheme } from "../../../../../../ui/useTheme";
import { gisPagesTheme } from "./gisPages.theme";
import { rulesPageTheme } from "../../default/rules.theme";

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
    const { baseUrl, pageBaseUrl, theme: pageTheme, falcor, datasources, isUserAuthed, datasetsPattern } = React.useContext(DatasetsContext) || {}
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...gisPagesTheme, ...(theme?.datasets?.gisPages || {}) };
    const rt = { ...rulesPageTheme, ...getComponentTheme(theme || {}, 'datasets.rulesPage') };
    const pgEnv = getExternalEnv(datasources);
    const env = isDms ? `${format?.app}+${source?.type}` : pgEnv;
    const [pkeyInfo, setPkeyInfo] = React.useState(null);
    // The source's rules (datasets-source-rules.md): read here only to warn when the ID column has
    // no default, which makes every "add a row" fail, and to offer Auto-number in one click.
    const [rulesInfo, setRulesInfo] = React.useState(null);
    const [autoNumberBusy, setAutoNumberBusy] = React.useState(false);
    const [autoNumberError, setAutoNumberError] = React.useState(null);
    // Same check the server enforces on the write route (uda.route.js) — mirrors the
    // pattern⊕source auth_permissions merge SourcePage.jsx already provides on context.
    const canEdit = isUserAuthed ? isUserAuthed(['update-source']) : false;

    useEffect(() => {
        if (isDms || !falcor || !id) return;
        falcor.get(['uda', env, 'sources', 'byId', +id, 'pkeyInfo']).then(res => {
            setPkeyInfo(res?.json?.uda?.[env]?.sources?.byId?.[id]?.pkeyInfo || null);
        });
    }, [isDms, falcor, env, id]);

    useEffect(() => {
        if (isDms || !falcor || !id) return;
        falcor.invalidate(['uda', env, 'sources', 'byId', +id, 'rulesInfo']);
        falcor.get(['uda', env, 'sources', 'byId', +id, 'rulesInfo'])
            .then(res => setRulesInfo(res?.json?.uda?.[env]?.sources?.byId?.[id]?.rulesInfo || null))
            .catch(() => setRulesInfo(null)); // a server without rules: no banner
    }, [isDms, falcor, env, id]);

    const pkColumn = rulesInfo?.latest?.pk
        ? rulesInfo.latest.columns.find(c => c.name === rulesInfo.latest.pk)
        : null;
    const pkNeedsAutoNumber = !!(pkColumn && pkColumn.kind === 'integer' && !pkColumn.isIdentity && !pkColumn.hasDefault);

    const enableAutoNumber = async () => {
        setAutoNumberBusy(true);
        setAutoNumberError(null);
        try {
            const res = await falcor.call(['uda', 'sources', 'setRule'], [env, +id, { id: 'auto_number', params: { column: pkColumn.name } }, true]);
            // The outcome comes back as a value (see the Rules page): a thrown server message
            // reaches the client as "[object Object]".
            const outcome = res?.json?.uda?.[env]?.sources?.byId?.[id]?.rulesCall;
            if (outcome && !outcome.ok) throw new Error(outcome.error);
            setRulesInfo(res?.json?.uda?.[env]?.sources?.byId?.[id]?.rulesInfo || null);
        } catch (e) {
            const msg = e?.message;
            setAutoNumberError(msg && msg !== '[object Object]' ? msg : 'Auto-number could not be turned on.');
        } finally {
            setAutoNumberBusy(false);
        }
    };

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
                {pkNeedsAutoNumber &&
                    <div className={rt.autoNumberBanner}>
                        <span className={rt.autoNumberBannerText}>
                            Rows added from a form or table will fail: the ID column <span className={rt.autoNumberBannerColumn}>{pkColumn.name}</span> has
                            no default. Auto-number gives it one. <Link className={rt.autoNumberBannerLink} to={`${pageBaseUrl}/${id}/rules`}>See all rules</Link>
                            {autoNumberError ? <span className={rt.errorText}>{autoNumberError}</span> : null}
                        </span>
                        {canEdit &&
                            <button type={'button'} className={rt.buttonPrimary} disabled={autoNumberBusy} onClick={enableAutoNumber}>
                                {autoNumberBusy ? 'Turning on…' : 'Turn on Auto-number'}
                            </button>
                        }
                    </div>
                }
                <MetadataComp
                    isDms={isDms}
                    canEdit={canEdit}
                    value={isDms ? source?.config : source?.metadata}
                    accessKey={isDms ? 'attributes' : 'columns'}
                    onChange={(v) => {
                        if (!canEdit) return;
                        updateSourceData({data: v, attrKey: isDms ? 'config' : 'metadata', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id, pattern: datasetsPattern})
                            .catch(e => console.error('Failed to save source metadata', e));
                    }}
                    onIndexChange={canEdit ? async (columnName, enable) => {
                        await falcor.call(['uda', 'sources', 'setIndex'], [env, id, columnName, enable, datasetsPattern]);
                    } : undefined}
                    onSetPrimaryKey={(isDms || !canEdit) ? undefined : async (columnName, enable = true) => {
                        await falcor.call(['uda', 'sources', 'setPrimaryKey'], [env, id, columnName, enable, datasetsPattern]);
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
