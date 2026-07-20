import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../../../context";
import { cloneDeep } from "lodash-es";
import {useNavigate, Link} from "react-router";
import { getExternalEnv } from "../../../utils/datasources";
import { clearDatasetsListCache } from "../../../utils/datasetsListCache";
import UdaTaskList from "../../Tasks/UdaTaskList";
import SourceAccessEditor from "../../../components/SourceAccessEditor";
import { ThemeContext } from "../../../../../ui/useTheme";
import { adminTheme } from "./admin.theme";
import { updateSourceData } from "./utils";

const DeleteSourceBtn = ({parent, source, apiUpdate, baseUrl}) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, app, type, falcor} = useContext(DatasetsContext);
    const {DeleteModal} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();

    const deleteSource = async () => {
        const sourceId = source.source_id || source.id;
        const sourceType = `${type}|source`;

        // Delete the source row from the database
        await falcor.call(["dms", "data", "delete"], [app, sourceType, sourceId]);

        // Delete-specific invalidation: length + byIndex (positions shift) +
        // the deleted source's own byId entry. Other byId rows stay cached.
        const udaEnv = `${app}+${type}`;
        await falcor.invalidate(['uda', udaEnv, 'sources', 'length']);
        await falcor.invalidate(['uda', udaEnv, 'sources', 'byIndex']);
        await falcor.invalidate(['uda', udaEnv, 'sources', 'byId', +sourceId]);
        clearDatasetsListCache();

        navigate(baseUrl);
    }
    return (
        <>
            <button className={t.buttonRed} onClick={() => setShowDeleteModal(true)}>Delete Source</button>

            <DeleteModal
                title={`Delete Source`} open={showDeleteModal}
                prompt={`Are you sure you want to delete this source? All of the source data will be permanently removed
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
        </>
    )
}

const AddViewBtn = ({source, format, apiLoad, apiUpdate}) => {
    // update parent to exclude source. the source still stays in the DB.
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI} = useContext(DatasetsContext);
    const {Modal} = UI;
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
    return (
        <>
            <button disabled={!source.id} className={t.buttonGreen} onClick={() => setShowDeleteModal(true)}>Add Version</button>

            <Modal open={showDeleteModal} setOpen={(v) => setShowDeleteModal(v)}>
                <input key={'view-name'} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>
                <button className={t.buttonGreen} onClick={() => {
                    async function add() {
                        await addView()
                        setShowDeleteModal(false)
                    }

                    add()
                }}>add</button>
            </Modal>
        </>
    )
}

/**
 * 3-option delete button for DAMA sources.
 * Cancel: close. Delete: soft (source+view rows only). Hard Delete: also drops
 * data tables, removes download files, and clears task history — requires the
 * user to type the source name to confirm.
 */
const DeleteDamaSourceBtn = ({source, baseUrl, pgEnv}) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, falcor} = useContext(DatasetsContext);
    const {Modal} = UI;
    const [open, setOpen] = useState(false);
    const [typedName, setTypedName] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const navigate = useNavigate();

    const sourceId = source?.source_id || source?.id;
    const sourceName = source?.name || '';
    const nameMatches = typedName.trim() === sourceName.trim() && sourceName.length > 0;

    const reset = () => { setTypedName(''); setErr(null); setBusy(false); };
    const close = () => { setOpen(false); reset(); };

    const runDelete = async (hard) => {
        if (!sourceId) { setErr('No source_id on this source'); return; }
        setBusy(true); setErr(null);
        try {
            const callPath = hard
                ? ['uda', 'sources', 'hardDelete']
                : ['uda', 'sources', 'delete'];
            await falcor.call(callPath, [pgEnv, sourceId]);
            await falcor.invalidate(['uda', pgEnv, 'sources']);
            await falcor.invalidate(['uda', pgEnv, 'sources', 'byId', sourceId]);
            close();
            navigate(baseUrl);
        } catch (e) {
            setErr(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button className={t.buttonRed} onClick={() => setOpen(true)}>Delete Source</button>

            <Modal open={open} setOpen={(v) => (v ? setOpen(true) : close())}>
                {/* Stop click propagation so the shared Modal's outer onClick doesn't close on interior clicks (which would steal focus from the input) */}
                <div onClick={e => e.stopPropagation()}>
                    <div className={t.deleteModalTitle}>Delete source #{sourceId}</div>
                    <div className={t.deleteModalDesc}>
                        <p>
                            <span className={t.emphasisBold}>Delete</span> removes the source and view rows from <code>data_manager</code>.
                            Per-view data tables and files remain and could be recovered by an admin.
                        </p>
                        <p className={t.deleteModalDescHard}>
                            <span className={t.emphasisBoldDanger}>Hard Delete</span> additionally drops each view's data table,
                            removes download files from storage, and deletes task history. This cannot be undone.
                        </p>
                    </div>
                    <div className={t.deleteModalConfirmLabel}>
                        To confirm a <span className={t.emphasisBoldDanger}>Hard Delete</span>, type the source name
                        <code className={t.codeInline}>{sourceName || '(unnamed)'}</code>:
                    </div>
                    <input
                        type="text"
                        value={typedName}
                        onChange={e => setTypedName(e.target.value)}
                        placeholder={sourceName}
                        autoFocus
                        className={t.deleteModalInput}
                    />
                    {err ? <div className={t.errorText}>Error: {err}</div> : null}
                    <div className={t.deleteModalFooter}>
                        <button
                            type="button"
                            disabled={busy || !nameMatches}
                            className={t.deleteModalHardBtn}
                            onClick={() => runDelete(true)}
                        >
                            {busy ? 'Working…' : 'Hard Delete'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className={t.deleteModalSoftBtn}
                            onClick={() => runDelete(false)}
                        >
                            {busy ? 'Working…' : 'Delete'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className={t.deleteModalCancelBtn}
                            onClick={close}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};

const AddExternalVersionBtn = ({source}) => {
    const {UI, damaDataTypes} = useContext(DatasetsContext);
    const {Modal, Button} = UI;
    const [showModal, setShowModal] = useState(false);

    const sourceType = source?.categories?.[0]?.[0]; // source identifier. this is how the source is named in the script. this used to be type.
    const sourceDataType = source?.type; // csv / gis / analysis
    const sourcePages = damaDataTypes[sourceType] || damaDataTypes[sourceDataType] || {};
    const CreatePage = sourcePages?.sourceCreate?.component;

    return (
        <>
            <Button onClick={() => setShowModal(true)}>Add Version</Button>

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
    const {UI, falcor} = useContext(DatasetsContext);
    const {Switch, Icon} = UI;
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
            const confirmed = await updateSourceData({data, attrKey: 'metadata', isDms: false, setSource, format, source, pgEnv, falcor, id});
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
            <label className={t.editableToggleLabel}>Allow editing</label>
            {saving ? <Icon icon={'LoadingHourGlass'} className={t.editableToggleSavingIcon} /> : null}
            {error ? <span className={t.errorText}>{error}</span> : null}
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
    const {baseUrl, pageBaseUrl, user, parent, UI, datasources} = React.useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const {Button} = UI;

    if(!user || !user.token) return <></>

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
                            <Button><Link to={`${pageBaseUrl}/${id}/metadata`}>Advanced Metadata</Link></Button>
                            {
                                isDms ? (
                                    <>
                                        <AddViewBtn source={source} format={format} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                                        {/*<ClearDataBtn app={app} type={source.doc_type} apiLoad={apiLoad} apiUpdate={apiUpdate}/>*/}
                                        <DeleteSourceBtn parent={parent} source={source} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                                    </>
                                ) : (
                                    <>
                                        <AddExternalVersionBtn source={source} />
                                        <EditableToggle source={source} setSource={setSource} format={format} pgEnv={pgEnv} id={id} />
                                        <DeleteDamaSourceBtn source={source} baseUrl={baseUrl} pgEnv={pgEnv} />
                                    </>
                                )
                            }

                        </div>
                    </div>
                </div>
                {
                    isDms ? null : (
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
