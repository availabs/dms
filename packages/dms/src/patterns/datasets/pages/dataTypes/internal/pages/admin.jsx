import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../../../../context";
import { AuthContext } from "../../../../../auth/context"
import { cloneDeep } from "lodash-es";
import {Link, useNavigate} from "react-router";
import {updateSourceData, parseIfJson, getSourceData} from "../../default/utils";
import { getInstance } from "../../../../../../utils/type-utils";
import { clearDatasetsListCache } from "../../../../utils/datasetsListCache";
import UdaTaskList from "../../../Tasks/UdaTaskList";

const buttonRedClass = 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md';
const buttonGreenClass = 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md';

const DeleteSourceBtn = ({parent, source, apiUpdate, baseUrl}) => {
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
            <button className={buttonRedClass} onClick={() => setShowDeleteModal(true)}>Delete Source</button>

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
    const {UI, app, type, falcor} = useContext(DatasetsContext);
    const {Modal} = UI;
    const [showModal, setShowModal] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState(null);
    const views = source?.views || [];
    const defaultViewName = `version ${views.length + 1}`;

    const addView = async () => {
        try {
            setError(null);
            const sourceId = source.source_id;

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
    return (
        <>
            <button disabled={!source?.source_id} className={buttonGreenClass}
                    onClick={() => { setError(null); setShowModal(true); }}>Add Version</button>
            <Modal open={showModal} setOpen={(v) => { setShowModal(v); if (!v) setError(null); }}>
                {error && <div className={'text-red-500 text-sm p-2'}>{error}</div>}
                <input key={'view-name'} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>
                <button className={buttonGreenClass} onClick={() => {
                    async function add() {
                        const ok = await addView()
                        if (ok) {
                            setShowModal(false)
                            setName('')
                        }
                    }

                    add()
                }}>add</button>
            </Modal>
        </>
    )
}

const Admin = ({ apiUpdate, apiLoad, format, source, setSource, params }) => {
    const {id} = params;
    const {app, type, baseUrl, pageBaseUrl, user, parent, UI, falcor, datasources} = React.useContext(DatasetsContext) || {};
    // Tasks for internal_table sources live in the DMS task tables
    // (`dms.tasks` / `dms_tasks`), not in any DAMA pgEnv. The UDA route
    // layer routes to DMS when the env contains '+', so we build the
    // DMS env from the pattern's app + instance.
    const taskEnv = app && type ? `${app}+${type}` : null;
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const {Select, Input, Button} = UI;

    useEffect(() => {
        async function load () {
            if(!user?.token) return;

            const users = await AuthAPI.getUsers({user});
            const groups = await AuthAPI.getGroups({user});

            setUsers(users?.users || []);
            setGroups(groups?.groups || [])
        }

        load();
    }, []);

    if(!user || !user.token) return <></>

    return (
            <div className={'p-2'}>
                <div className={'flex gap-12'}>
                    <div className={'w-3/4'}>
                        <div className={'shadow-md rounded-md place-content-center p-4 w-full'}>
                            <label className={'text-xl text-gray-900 font-semibold'}>User Access Controls</label>
                            <Select className={'w-1/2'}
                                    options={[{label: 'Add user access', value: undefined}, ...users.map(u => ({label: u.email, value: u.id}))]}
                                    onChange={e => {
                                        const newAuth = {
                                            ...parseIfJson(source?.statistics, {})?.auth,
                                            users: {
                                                ...(parseIfJson(source?.statistics, {})?.auth?.users || {}),
                                                [e.target.value]: "1",
                                            },
                                        };
                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms: true, apiUpdate, setSource, format, source, falcor, id})
                                    }}
                            />

                            <div>
                                <div className={'grid grid-cols-3'}>
                                    <div>User</div>
                                    <div>Auth</div>
                                </div>
                                {
                                    Object.entries(parseIfJson(source?.statistics, {})?.auth?.users || {})
                                        .map(([userId, authLevel]) => <div key={userId} className={'grid grid-cols-3'}>
                                            <div>{users.find(user => +user.id === +userId)?.email}</div>
                                            <Input type={'text'} value={authLevel} onChange={e => {
                                                const newAuth = {
                                                    ...parseIfJson(source?.statistics, {})?.auth,
                                                    users: {
                                                        ...(parseIfJson(source?.statistics, {})?.auth?.users || {}),
                                                        [userId]: e.target.value,
                                                    },
                                                };
                                                updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms: true, apiUpdate, setSource, format, source, falcor, id})
                                            }} />
                                            <Button className={'w-fit'}
                                                    onClick={() => {
                                                        const newAuth = {
                                                            ...parseIfJson(source?.statistics, {})?.auth,
                                                        };

                                                        delete newAuth.users[userId];

                                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms: true, apiUpdate, setSource, format, source, falcor, id})
                                                    }}>remove</Button>
                                        </div>)
                                }
                            </div>
                        </div>

                        <div className={'shadow-lg rounded-md place-content-center p-4 w-full'}>
                            <label className={'text-xl text-gray-900 font-semibold'}>Group Access Controls</label>
                            <Select className={'w-1/2'}
                                    options={[{label: 'Add group access', value: undefined}, ...groups.map(u => ({label: u.name, value: u.name}))]}
                                    onChange={e => {
                                        const newAuth = {
                                            ...parseIfJson(source?.statistics, {})?.auth,
                                            groups: {
                                                ...(parseIfJson(source?.statistics, {})?.auth?.groups || {}),
                                                [e.target.value]: "1",
                                            },
                                        };
                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms: true, apiUpdate, setSource, format, source, falcor, id})
                                    }}
                            />

                            <div>
                                <div className={'grid grid-cols-3'}>
                                    <div>Group</div>
                                    <div>Auth</div>
                                </div>
                                {
                                    Object.entries(parseIfJson(source?.statistics, {})?.auth?.groups || {})
                                        .map(([groupName, authLevel]) => <div key={groupName} className={'grid grid-cols-3'}>
                                            <div>{groupName}</div>
                                            <Input type={'text'} value={authLevel} onChange={e => {
                                                const newAuth = {
                                                    ...parseIfJson(source?.statistics, {})?.auth,
                                                    groups: {
                                                        ...(parseIfJson(source?.statistics, {})?.auth?.groups || {}),
                                                        [groupName]: e.target.value,
                                                    },
                                                };
                                                updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms: true, apiUpdate, setSource, format, source, falcor, id})
                                            }} />
                                            <Button className={'w-fit'}
                                                    onClick={() => {
                                                        const newAuth = {
                                                            ...parseIfJson(source?.statistics, {})?.auth,
                                                        };

                                                        delete newAuth.groups[groupName];

                                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms: true, apiUpdate, setSource, format, source, falcor, id})
                                                    }}>remove</Button>
                                        </div>)
                                }
                            </div>
                        </div>
                    </div>

                    <div className={'w-1/4'}>
                        <div className={'flex flex-col gap-4 shadow-lg rounded-md place-content-center p-4'}>
                            <Button><Link to={`${pageBaseUrl}/${id}/metadata`}>Advanced Metadata</Link></Button>
                            <AddViewBtn source={source} setSource={setSource}/>
                            <DeleteSourceBtn parent={parent} source={source} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                        </div>
                    </div>
                </div>
                {taskEnv && (
                    <div className={'w-full pt-12'}>
                        <div className={'text-sm font-medium text-gray-500 pb-2'}>Tasks</div>
                        <UdaTaskList env={taskEnv} sourceId={source.source_id} />
                    </div>
                )}
            </div>
    )
}

export default Admin
