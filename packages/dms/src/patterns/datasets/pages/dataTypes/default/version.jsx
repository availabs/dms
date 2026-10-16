import React, {useContext, useEffect, useState} from "react";
import {useNavigate} from "react-router";
import { DatasetsContext } from '../../../context'
import { ThemeContext, getComponentTheme } from "../../../../../ui/useTheme";
import { sourceOverviewTheme } from "./sourceOverview.theme";
import { preferredViewId, isAuthoritative } from "../../../utils/authority";
import AuthorityControl, { AuthorityBadge } from "../../../components/AuthorityControl";
import { VersionLineage, DeleteVersionButton } from "../../../components/LineageControls";
import {getSourceData, updateVersionData} from "./utils";
import { getExternalEnv } from "../../../utils/datasources";
import {cloneDeep} from "lodash-es";
import ExternalVersionControl from "../../../components/ExternalVersionControls";
import { nameToSlug } from "../../../../../utils/type-utils";
import { versionTheme } from "./version.theme";

const DeleteViewBtn = ({source, view_id, format, url, apiUpdate, baseUrl}) => {
    const {UI, theme} = useContext(ThemeContext);
    const {DeleteModal, Icon, Button} = UI;
    const t = { ...versionTheme, ...(theme?.datasets?.version || {}) };
    // update parent to exclude source. the source still stays in the DB.
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();

    const deleteSource = async () => {
        const config = {format}
        const data = cloneDeep(source);
        data.views = data.views.filter(s => s.id !== view_id);
        console.log('parent', config, data, source)

        await apiUpdate({data, config});
        // navigate(baseUrl)
        navigate(url);
    }
    return (
        <div className={t.btnWrap}>
            <Button activeStyle='dangerFull' onClick={() => setShowDeleteModal(true)}>{t.dangerIcon && <Icon icon={t.dangerIcon} className={t.btnIconClass}/>}Delete Version</Button>

            <DeleteModal
                title={`Delete Version`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this version? All of the version data will be permanently removed
                                            from our servers forever. This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await deleteSource()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </div>
    )
}

const ClearDataBtn = ({app, sourceSlug, view_id, falcor}) => {
    const {UI, theme} = useContext(ThemeContext);
    const {DeleteModal, Button} = UI;
    const t = { ...versionTheme, ...(theme?.datasets?.version || {}) };
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const clearData = async () => {
        await falcor.call(['uda', 'viewsById', 'clearData'], [`${app}+${sourceSlug}`, +view_id]);
    }
    return (
        <div className={t.btnWrap}>
            <Button activeStyle='dangerFull' onClick={() => setShowDeleteModal(true)}>Clear Data</Button>

            <DeleteModal
                title={`Clear Uploaded Data`} open={showDeleteModal}
                prompt={`Are you sure you want to clear all uploaded data for this version? This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await clearData()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </div>
    )
}

export default function ManageForm ({ status, apiLoad, apiUpdate, format, source, setSource, params, isDms }) {
    const {id} = params;
    const navigate = useNavigate();
    const { app, baseUrl, pageBaseUrl, theme, falcor, datasources, isUserAuthed } = React.useContext(DatasetsContext) || {}
    const { theme: fullTheme } = React.useContext(ThemeContext) || {};
    const t = {...sourceOverviewTheme, ...getComponentTheme(fullTheme, 'datasets.sourceOverview')};
    const tv = { ...versionTheme, ...(fullTheme?.datasets?.version || {}) };
    const pgEnv = getExternalEnv(datasources);
    const {UI} = React.useContext(ThemeContext) || {}
    const {Input, FieldLabel} = UI;
    const [currentView, setCurrentView] = React.useState((source?.views || []).find(v => +(v.view_id || v.id) === +params.view_id) || {});

    useEffect(() => {
        if(!params.view_id && source?.views?.length){
            // the authoritative view when one is marked, else the most recent as before
            const recentView = preferredViewId(source, source.views, v => v.view_id || v.id)
                ?? Math.max(...source.views.map(({id, view_id}) => view_id || id));
            navigate(`${pageBaseUrl}/${params.id}/version/${recentView}`)
        }
    }, [source.views, source.authority]);

    useEffect(() => {
        const newView = (source?.views || []).find(v => +(v.view_id || v.id) === +params.view_id) || {};
        // also refresh once the view's name arrives — DMS view names resolve after the first render
        // (SourcePage resolveInternalViewNames), which used to leave the title / input blank
        const sameView = (currentView.view_id || currentView.id) === (newView.view_id || newView.id);
        const nameArrived = !(currentView.version || currentView.name) && (newView.version || newView.name);
        if(!sameView || nameArrived) setCurrentView(newView)
    }, [source, params.view_id]);

    const versionLabel = currentView?.version || currentView?.name || currentView?.view_id || currentView?.id;
    const viewId = currentView?.view_id || currentView?.id;
    const meta = ['created_at', 'updated_at'].map(key => (
        <div key={key} className={tv.metaItem}>
            <div className={tv.metaLabel}>{key.replace('_', ' ')}</div>
            <div className={tv.metaValue}>{currentView?.[key]}</div>
        </div>
    ));

    return (
            <div className={tv.page}>
                    <div className={tv.inner}>
                        {status ? <div>{JSON.stringify(status)}</div> : ''}
                        <div className={tv.titleRow}>
                            <span className={tv.title}>{tv.titleSourceSep ? `${source?.name || ''}${tv.titleSourceSep}` : ''}{versionLabel}</span>
                            <AuthorityBadge t={t} entry={isAuthoritative(source, params.view_id)}/>
                            {tv.viewIdLabel && viewId ? <span className={tv.viewIdLabel}>view {viewId}</span> : null}
                        </div>
                        {params.view_id && setSource && (
                            // '' → no wrapper (pre-v6 markup): AuthorityControl's nested `mt-1`s only stack
                            // as a direct flex item; inside a plain block they collapse and shift 4px
                            tv.authorityWrap ? (
                            <div className={tv.authorityWrap}>
                                <AuthorityControl t={t} source={source} setSource={setSource} viewId={+params.view_id}
                                                  viewLabel={currentView?.version || currentView?.name}
                                                  envKey={isDms ? `${format?.app}+${source?.type}` : pgEnv}
                                                  canEdit={isUserAuthed ? isUserAuthed(['update-source']) : false}
                                                  falcor={falcor}/>
                            </div>
                            ) : (
                                <AuthorityControl t={t} source={source} setSource={setSource} viewId={+params.view_id}
                                                  viewLabel={currentView?.version || currentView?.name}
                                                  envKey={isDms ? `${format?.app}+${source?.type}` : pgEnv}
                                                  canEdit={isUserAuthed ? isUserAuthed(['update-source']) : false}
                                                  falcor={falcor}/>
                            )
                        )}
                        {!isDms && params.view_id ? (
                            <VersionLineage t={t} envKey={pgEnv} viewId={+params.view_id} pageBaseUrl={pageBaseUrl} falcor={falcor}/>
                        ) : null}
                        <div className={tv.body}>
                            <div className={tv.mainCol}>
                                <FieldLabel htmlFor={'version-name'} text={'Version'} />
                                <Input id={'version-name'} type={'text'} value={currentView.version || currentView.name || ''} onChange={e => {
                                    updateVersionData({
                                        data: e.target.value,
                                        attrKey: isDms ? 'name' : 'version',
                                        isDms, apiUpdate,
                                        view: currentView, setView: setCurrentView, format, source, pgEnv, falcor, id: currentView.view_id || currentView.id
                                    })
                                }}/>
                                {tv.versionHint ? <p className={tv.versionHint}>Saved as you type.</p> : null}
                                {tv.metaInMain ? <div className={tv.metaList}>{meta}</div> : null}
                            </div>
                            <div className={tv.sideCol}>
                                {tv.metaInMain ? null : meta}
                                {
                                    isDms ? (
                                            <>
                                                <ClearDataBtn app={app} sourceSlug={nameToSlug(source.name)} view_id={params.view_id} falcor={falcor}/>
                                                <DeleteViewBtn source={source} format={format} view_id={params.view_id} url={`${pageBaseUrl}/${params.id}`} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                                            </>
                                    ) : (
                                        <>
                                            <ExternalVersionControl source={source} view={currentView} sourceId={params.id} viewId={params.view_id} />
                                            <DeleteVersionButton t={t} envKey={pgEnv} viewId={+params.view_id}
                                                                 label={currentView?.version || currentView?.name}
                                                                 canDelete={isUserAuthed ? isUserAuthed(['delete-source']) : false}
                                                                 falcor={falcor}
                                                                 onDeleted={() => {
                                                                     setSource?.(s => ({...s, views: (s.views || []).filter(v => +(v.view_id || v.id) !== +params.view_id)}));
                                                                     navigate(`${pageBaseUrl}/${params.id}`);
                                                                 }}/>
                                        </>
                                    )
                                }
                            </div>
                        </div>
                    </div>
            </div>
    )
}