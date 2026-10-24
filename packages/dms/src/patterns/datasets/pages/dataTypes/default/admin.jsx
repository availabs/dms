import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../../../context";
import { cloneDeep } from "lodash-es";
import {useNavigate, Link} from "react-router";
import { getExternalEnv } from "../../../utils/datasources";
import { clearDatasetsListCache } from "../../../utils/datasetsListCache";
import UdaTaskList from "../../Tasks/UdaTaskList";
import SourceAccessEditor from "../../../components/SourceAccessEditor";
import { DeleteSourceModal, DeleteDmsSourceBtn } from "../../../components/DeleteSource";
import { ThemeContext } from "../../../../../ui/useTheme";
import { adminTheme } from "./admin.theme";
import { updateSourceData } from "./utils";
import { udaDeleteSource } from "../../../../../api";

const AddViewBtn = ({source, format, apiLoad, apiUpdate}) => {
    // update parent to exclude source. the source still stays in the DB.
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI} = useContext(DatasetsContext);
    const {Modal, Icon, Button, Input, FieldLabel} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [name, setName] = useState('');
    const navigate = useNavigate();
    const defaultViewName = `version ${(source?.views?.length || 0) + 1}`;

    const addView = async () => {
        const config = {format}
        const data = cloneDeep(source);
        data.views = [...(data.views || []), {name: name || defaultViewName}];

        const res = await apiUpdate({data, config});
        // navigate(baseUrl)
        // window.location.assign(baseUrl);
    }
    const onAdd = () => {
        async function add() {
            await addView()
            setShowDeleteModal(false)
        }

        add()
    }
    const input = <Input key={'view-name'} id={'add-version-name'} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>
    return (
        <>
            <Button activeStyle='actionFull' disabled={!source.id} onClick={() => setShowDeleteModal(true)}>{t.actionIconAdd && <Icon icon={t.actionIconAdd} className={t.actionIcon}/>}Add Version</Button>

            <Modal open={showDeleteModal} setOpen={(v) => setShowDeleteModal(v)}>
                {t.addVersionTitle ? (
                    <div className={t.addVersionBody}>
                        <h2 className={t.addVersionTitle}>Add version</h2>
                        <div className={t.addVersionLabelWrap}><FieldLabel htmlFor={'add-version-name'} text={'version name'} /></div>
                        {input}
                        <p className={t.addVersionHint}>Leave blank for “{defaultViewName}”.</p>
                        <div className={t.addVersionFooter}>
                            <Button activeStyle='action' onClick={() => setShowDeleteModal(false)}>cancel</Button>
                            <Button activeStyle='primary' onClick={onAdd}>add</Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {input}
                        <Button activeStyle='actionFull' onClick={onAdd}>add</Button>
                    </>
                )}
            </Modal>
        </>
    )
}

/**
 * Delete button for DAMA sources. There is one Delete (owner decision 2026-10-02,
 * dama-parent-child-etl-support.md): it removes the source, every view and its data table, download
 * files and task history, and requires the user to type the source name. The server refuses while
 * a view of another source was built from one of these views, or while this source's runs produced
 * versions of other sources (it then offers to delete those too). To retire a source without
 * deleting anything, put it in the Archive category instead.
 */
const DeleteDamaSourceBtn = ({source, baseUrl, pgEnv}) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, falcor, pageBaseUrl, datasetsPattern, isUserAuthed} = useContext(DatasetsContext);
    const {Icon, Button} = UI;
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState(null);
    const navigate = useNavigate();

    const sourceId = source?.source_id || source?.id;

    const runDelete = async (cascade) => {
        if (!sourceId) { setRefusal({error: 'No source_id on this source'}); return; }
        setBusy(true); setRefusal(null);
        try {
            const result = await udaDeleteSource(falcor, {env: pgEnv, source_id: sourceId, cascade, pattern: datasetsPattern});
            if (!result || result.error) {
                setRefusal(result || {error: 'The server did not answer the delete.'});
                setBusy(false);
                return;
            }
            await falcor.invalidate(['uda', pgEnv, 'sources']);
            await falcor.invalidate(['uda', pgEnv, 'sources', 'byId', sourceId]);
            clearDatasetsListCache();
            setOpen(false);
            navigate(baseUrl);
        } catch (e) {
            setRefusal({error: e?.message || String(e)});
            setBusy(false);
        }
    };

    // Hidden without delete-source (the server refuses it anyway).
    if (!isUserAuthed || !isUserAuthed(['delete-source'])) return null;

    return (
        <>
            <div className={t.deleteBtnWrap}>
                <Button activeStyle='dangerFull' onClick={() => setOpen(true)}>{t.actionIconDelete && <Icon icon={t.actionIconDelete} className={t.actionIcon}/>}Delete Source</Button>
            </div>
            <DeleteSourceModal open={open} onClose={() => { setOpen(false); setRefusal(null); }}
                               sourceName={source?.name} overviewHref={pageBaseUrl && sourceId ? `${pageBaseUrl}/${sourceId}` : undefined}
                               busy={busy} refusal={refusal} onDelete={runDelete}/>
        </>
    );
};

const getCreatePage = source => {

}

const AddExternalVersionBtn = ({source}) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, damaDataTypes} = useContext(DatasetsContext);
    const {Modal, Button, Icon} = UI;
    const [showModal, setShowModal] = useState(false);

    const createdWith = source?.metadata?.createdWith || null;
    const sourceCat = source?.categories?.[0]?.[0]; // source identifier. this is how the source is named in the script. this used to be type.
    const sourceType = source?.type; // csv / gis / analysis
    const sourcePages = damaDataTypes[createdWith] || damaDataTypes[sourceCat] || damaDataTypes[sourceType] || {};
    const CreatePage = sourcePages?.sourceCreate?.component;

    return (
        <>
            <Button activeStyle='actionFull' onClick={() => setShowModal(true)}>{t.actionIconAdd && <Icon icon={t.actionIconAdd} className={t.actionIcon}/>}Add Version</Button>

            <Modal
                title={`Add Version`} open={showModal}
                setOpen={(v) => setShowModal(v)}
            >
                {
                    !CreatePage ? `Can't add version.` : <CreatePage source={source} context={DatasetsContext}/>
                }
            </Modal>
        </>
    )
}
// External sources only — becomes enabled once the source has a real primary key
// (set/detected via the Advanced Metadata page, see set_primary_col_from_meta.md).
// This is a deliberate admin action, not automatic just because a pkey exists.
const EditableToggle = ({source, setSource, format, pgEnv, id}) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, falcor, datasetsPattern} = useContext(DatasetsContext);
    const {Switch, Icon, FieldLabel} = UI;
    const [pkeyInfo, setPkeyInfo] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!falcor || !id) return;
        falcor.get(['uda', pgEnv, 'sources', 'byId', +id, 'pkeyInfo']).then(res => {
            setPkeyInfo(res?.json?.uda?.[pgEnv]?.sources?.byId?.[id]?.pkeyInfo || null);
        });
    }, [falcor, pgEnv, id]);

    const isEditable = !!source?.metadata?.isEditable;

    // Pessimistic on purpose: the switch's visible state is driven entirely by
    // `source.metadata.isEditable` (no separate local optimistic flag), so it only
    // moves once `updateSourceData` has confirmed the write against the server's own
    // echoed response — see updateSourceData's comment on why blindly trusting a
    // resolved promise isn't enough (a request could "succeed" while silently
    // no-op'ing the actual write). `saving` disables the switch and shows a spinner
    // for the round trip instead of leaving the user with no feedback.
    const handleToggle = async (e) => {
        setError(null);
        setSaving(true);
        try {
            const data = {...(source?.metadata || {}), isEditable: e};
            const confirmed = await updateSourceData({data, attrKey: 'metadata', isDms: false, setSource, format, source, pgEnv, falcor, id, pattern: datasetsPattern});
            if (!!confirmed?.isEditable !== e) {
                setError('The change did not save — please try again.');
            }
        } catch (err) {
            setError(err?.message || 'Failed to update.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={t.editableToggleRow}
             title={pkeyInfo?.hasPkey ? undefined : 'Requires a primary key — set one on the Advanced Metadata page'}
        >
            {t.editableToggleHint ? (
                // v6: label + a visible hint (and the no-primary-key reason, not just a tooltip)
                <div className={t.editableToggleMain}>
                    <FieldLabel activeStyle={'inline'} text={'Allow editing'} />
                    <div className={t.editableToggleHint}>
                        {pkeyInfo?.hasPkey || isEditable
                            ? 'Lets permitted users edit rows in the Table tab.'
                            : 'Requires a primary key — set one on Advanced Metadata.'}
                    </div>
                    {error ? <div className={t.errorText}>{error}</div> : null}
                </div>
            ) : (
                <>
                    <FieldLabel activeStyle={'inline'} text={'Allow editing'} />
                    {saving ? <Icon icon={'LoadingHourGlass'} className={t.editableToggleSavingIcon} /> : null}
                    {error ? <span className={t.errorText}>{error}</span> : null}
                </>
            )}
            {t.editableToggleHint && saving ? <Icon icon={'LoadingHourGlass'} className={t.editableToggleSavingIcon} /> : null}
            <Switch
                enabled={isEditable}
                disabled={saving || (!pkeyInfo?.hasPkey && !isEditable)}
                setEnabled={handleToggle}
                size={'small'}
            />
        </div>
    );
};

const Admin = ({ apiUpdate, apiLoad, format, source, setSource, params, isDms }) => {
    const {id} = params;
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {baseUrl, pageBaseUrl, parent, UI, datasources, isUserAuthed} = React.useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const {Button, Icon} = UI;
    // Each control shows to the users the server lets use it (SourcePage gates the tab on any of these).
    const can = (perms) => (isUserAuthed ? isUserAuthed(perms) : false);
    const canUpdate = can(['update-source']);
    const canAddVersion = can(isDms ? ['create-view'] : ['create-view', 'update-source']);

    if (!can(['update-source', 'edit-source-permissions', 'delete-source', 'create-view'])) return <></>

    // todo add setAuth feature for internal and external sources.
    // use statistics column. make a route to update sources.
    return (
            <div className={t.adminWrapper}>
                <div className={t.adminRow}>
                    <div className={t.adminMain}>
                        {/* New string-permission Access editor (pattern ⊕ source). Replaces the
                            legacy numeric statistics.auth UAC panels; gated by edit-source-permissions. */}
                        <SourceAccessEditor source={source} setSource={setSource} format={format}
                                            apiUpdate={apiUpdate} isDms={isDms} id={id}/>
                    </div>

                    <div className={t.adminSidebar}>
                        <div className={t.sidebarActionsPanel}>
                            {canUpdate && <Button activeStyle='actionFull'>{t.actionIconMetadata && <Icon icon={t.actionIconMetadata} className={t.actionIcon}/>}<Link to={`${pageBaseUrl}/${id}/metadata`}>Advanced Metadata</Link></Button>}
                            {
                                isDms ? (
                                    <>
                                        {canAddVersion && <AddViewBtn source={source} format={format} apiLoad={apiLoad} apiUpdate={apiUpdate}/>}
                                        {/*<ClearDataBtn app={app} type={source.doc_type} apiLoad={apiLoad} apiUpdate={apiUpdate}/>*/}
                                        <DeleteDmsSourceBtn source={source} baseUrl={baseUrl}/>
                                    </>
                                ) : (
                                    <>
                                        {canUpdate && <Button><Link to={`${pageBaseUrl}/${id}/rules`}>Rules</Link></Button>}
                                        {canAddVersion && <AddExternalVersionBtn source={source} />}
                                        {canUpdate && <EditableToggle source={source} setSource={setSource} format={format} pgEnv={pgEnv} id={id} />}
                                        <DeleteDamaSourceBtn source={source} baseUrl={baseUrl} pgEnv={pgEnv} />
                                    </>
                                )
                            }

                        </div>
                    </div>
                </div>
                {
                    isDms || !canUpdate ? null : (
                        <div className={t.tasksWrapper}>
                            <div className={t.tasksLabel}>Tasks</div>
                            <UdaTaskList sourceId={source.source_id} />
                        </div>
                    )
                }
            </div>
    )
}

export default Admin
