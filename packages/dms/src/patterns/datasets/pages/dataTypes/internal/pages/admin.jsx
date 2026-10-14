import React, {useContext, useState} from "react";
import { DatasetsContext } from "../../../../context";
import { cloneDeep } from "lodash-es";
import {Link} from "react-router";
import {getSourceData} from "../../default/utils";
import { getInstance } from "../../../../../../utils/type-utils";
import UdaTaskList from "../../../Tasks/UdaTaskList";
import SourceAccessEditor from "../../../../components/SourceAccessEditor";
import ChangeHistoryEditor from "../../../../components/ChangeHistoryEditor";
import { DeleteDmsSourceBtn } from "../../../../components/DeleteSource";
import { ThemeContext } from "../../../../../../ui/useTheme";
import { adminTheme } from "../../default/admin.theme";

// Styled through `datasets.admin` (default/admin.theme.js) like the default Admin page — the
// classes that used to be hardcoded here are the frozen pre-v6 values in src/themes/_legacy/datasets.js.

function getNewId(falcorRes) {
    return Object.keys(falcorRes?.json?.dms?.data?.byId || {})
        .find(k => k !== '$__path');
}

/**
 * AddViewBtn — creates a new view row for an internal_table source.
 *
 * The legacy dms-format / apiUpdate path derived the view type from
 * format.attributes.views.format (e.g. `cenrep+cenrep|view`). After the
 * type-system refactor, views are typed per-source as
 * `${sourceSlug}|v${N}:view` and referenced as `${app}+${sourceSlug}|view`
 * — same as sourceCreate.jsx does on initial create. Going through the
 * legacy path creates the view in the wrong namespace, so it never shows
 * up in the source's views list.
 *
 * This direct-Falcor implementation mirrors sourceCreate.jsx's pattern.
 */
const AddViewBtn = ({source, setSource}) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, app, type, falcor} = useContext(DatasetsContext);
    const {Modal, Icon} = UI;
    const [showModal, setShowModal] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState(null);
    const views = source?.views || [];
    const defaultViewName = `version ${views.length + 1}`;

    const addView = async () => {
        try {
            setError(null);
            // DMS row id; `source_id` is only set when getSourceData loaded the source (route-preloaded
            // items carry `id` only — gating on it alone left Add Version permanently disabled).
            const sourceId = source.id || source.source_id;

            // source.type from UDA is `data->>'type'` (e.g. 'internal_table'),
            // not the row type column. Fetch the row type to derive the slug.
            const typeRes = await falcor.get(['dms', 'data', app, 'byId', +sourceId, 'type']);
            const rowType = typeRes?.json?.dms?.data?.[app]?.byId?.[+sourceId]?.type;
            const sourceSlug = getInstance(rowType);
            if (!sourceSlug) {
                throw new Error(`Cannot derive source slug from row type='${rowType}' (id=${sourceId})`);
            }

            // Next version number based on existing view count
            const viewType = `${sourceSlug}|v${views.length + 1}:view`;

            // UDA env must match what SourcePage used to load the source
            // (sources are stored under `${app}+${instance}|source`).
            const udaEnv = `${app}+${type}|source`;

            // 1. Create the view data_items row
            const viewRes = await falcor.call(
                ["dms", "data", "create"],
                [app, viewType, { name: name || defaultViewName }]
            );
            const newViewId = getNewId(viewRes);
            if (!newViewId) throw new Error('Failed to create view row');

            // 2. Update the source's views array — preserve existing refs, append new
            const viewRef = `${app}+${sourceSlug}|view`;
            const existingRefs = views
                .filter(v => v.view_id)
                .map(v => ({ ref: viewRef, id: +v.view_id }));

            await falcor.call(
                ["dms", "data", "edit"],
                [app, +sourceId, {
                    views: [...existingRefs, { ref: viewRef, id: +newViewId }]
                }]
            );

            // 3. Invalidate so the source view list refreshes from the server
            await falcor.invalidate(['dms', 'data', app, 'byId', +sourceId]);
            await falcor.invalidate(['uda', udaEnv, 'sources', 'byId', +sourceId]);

            // 4. Re-load source data to refresh the views list in local state
            await getSourceData({
                pgEnv: udaEnv,
                falcor,
                source_id: sourceId,
                setSource,
                isDms: true,
            });
            return true;
        } catch (e) {
            console.error('Error adding view:', e);
            setError(e.message || 'Failed to add version');
            return false;
        }
    }
    const onAdd = () => {
        async function add() {
            const ok = await addView()
            if (ok) {
                setShowModal(false)
                setName('')
            }
        }

        add()
    }
    const errorLine = error && <div className={t.addVersionError}>{error}</div>;
    const input = <input key={'view-name'} className={t.addVersionInput} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>;
    return (
        <>
            <button disabled={!(source?.id || source?.source_id)} className={t.buttonGreen}
                    onClick={() => { setError(null); setShowModal(true); }}>{t.actionIconAdd && <Icon icon={t.actionIconAdd} className={t.actionIcon}/>}Add Version</button>
            <Modal open={showModal} setOpen={(v) => { setShowModal(v); if (!v) setError(null); }}>
                {t.addVersionTitle ? (
                    <div className={t.addVersionBody}>
                        <h2 className={t.addVersionTitle}>Add version</h2>
                        {errorLine}
                        <label className={t.addVersionLabel}>version name</label>
                        {input}
                        <p className={t.addVersionHint}>Leave blank for “{defaultViewName}”.</p>
                        <div className={t.addVersionFooter}>
                            <button type="button" className={t.addVersionCancelBtn} onClick={() => { setShowModal(false); setError(null); }}>cancel</button>
                            <button type="button" className={t.addVersionBtn} onClick={onAdd}>add</button>
                        </div>
                    </div>
                ) : (
                    <>
                        {errorLine}
                        {input}
                        <button className={t.buttonGreen} onClick={onAdd}>add</button>
                    </>
                )}
            </Modal>
        </>
    )
}

const Admin = ({ apiUpdate, apiLoad, format, source, setSource, params }) => {
    const {id} = params;
    const {app, type, baseUrl, pageBaseUrl, user, UI} = React.useContext(DatasetsContext) || {};
    // Tasks for internal_table sources live in the DMS task tables
    // (`dms.tasks` / `dms_tasks`), not in any DAMA pgEnv. The UDA route
    // layer routes to DMS when the env contains '+', so we build the
    // DMS env from the pattern's app + instance.
    const taskEnv = app && type ? `${app}+${type}` : null;
    const {Button, Icon} = UI;
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };

    if(!user || !user.token) return <></>

    return (
            <div className={t.adminWrapper}>
                <div className={t.adminRow}>
                    <div className={t.adminMain}>
                        {/* New string-permission Access editor (pattern ⊕ source) — replaces the
                            legacy numeric statistics.auth UAC; gated by edit-source-permissions. */}
                        <SourceAccessEditor source={source} setSource={setSource} format={format}
                                            apiUpdate={apiUpdate} isDms={true} id={id}/>
                        {/* Whether edits to this dataset's rows are recorded in a history dataset. */}
                        <ChangeHistoryEditor source={source} id={id}/>
                    </div>

                    <div className={t.adminSidebar}>
                        <div className={t.sidebarActionsPanel}>
                            <Button activeStyle='actionFull'>{t.actionIconMetadata && <Icon icon={t.actionIconMetadata} className={t.actionIcon}/>}<Link to={`${pageBaseUrl}/${id}/metadata`}>Advanced Metadata</Link></Button>
                            <AddViewBtn source={source} setSource={setSource}/>
                            <DeleteDmsSourceBtn source={source} baseUrl={baseUrl}/>
                        </div>
                    </div>
                </div>
                {taskEnv && (
                    <div className={t.tasksWrapper}>
                        <div className={t.tasksLabel}>Tasks</div>
                        <UdaTaskList env={taskEnv} sourceId={source.id || source.source_id} />
                    </div>
                )}
            </div>
    )
}

export default Admin
