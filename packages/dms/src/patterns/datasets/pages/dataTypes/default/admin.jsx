import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../../../context";
import { AuthContext } from "../../../../auth/context"
import { cloneDeep } from "lodash-es";
import {useNavigate, Link} from "react-router";
import {updateSourceData, parseIfJson} from "./utils";
import { getExternalEnv } from "../../../utils/datasources";
import UdaTaskList from "../../Tasks/UdaTaskList";
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

        // Invalidate the UDA sources list so it refetches without the deleted source
        await falcor.invalidate(['uda', `${app}+${type}`, 'sources']);

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

const AddViewBtn = ({source, format, apiLoad, apiUpdate}) => {
    // update parent to exclude source. the source still stays in the DB.
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
            <button disabled={!source.id} className={buttonGreenClass} onClick={() => setShowDeleteModal(true)}>Add Version</button>

            <Modal open={showDeleteModal} setOpen={(v) => setShowDeleteModal(v)}>
                <input key={'view-name'} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>
                <button className={buttonGreenClass} onClick={() => {
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
            <button className={buttonRedClass} onClick={() => setOpen(true)}>Delete Source</button>

            <Modal open={open} setOpen={(v) => (v ? setOpen(true) : close())}>
                {/* Stop click propagation so the shared Modal's outer onClick doesn't close on interior clicks (which would steal focus from the input) */}
                <div onClick={e => e.stopPropagation()}>
                    <div className="text-base font-semibold text-gray-900">Delete source #{sourceId}</div>
                    <div className="mt-2 text-sm text-gray-600">
                        <p>
                            <span className="font-semibold">Delete</span> removes the source and view rows from <code>data_manager</code>.
                            Per-view data tables and files remain and could be recovered by an admin.
                        </p>
                        <p className="mt-2">
                            <span className="font-semibold text-red-700">Hard Delete</span> additionally drops each view's data table,
                            removes download files from storage, and deletes task history. This cannot be undone.
                        </p>
                    </div>
                    <div className="mt-3 text-sm text-gray-700">
                        To confirm a <span className="font-semibold text-red-700">Hard Delete</span>, type the source name
                        <code className="ml-1">{sourceName || '(unnamed)'}</code>:
                    </div>
                    <input
                        type="text"
                        value={typedName}
                        onChange={e => setTypedName(e.target.value)}
                        placeholder={sourceName}
                        autoFocus
                        className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    {err ? <div className="mt-2 text-sm text-red-700">Error: {err}</div> : null}
                    <div className="mt-5 flex flex-row-reverse gap-2">
                        <button
                            type="button"
                            disabled={busy || !nameMatches}
                            className="inline-flex justify-center rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-40"
                            onClick={() => runDelete(true)}
                        >
                            {busy ? 'Working…' : 'Hard Delete'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="inline-flex justify-center rounded-md bg-yellow-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-yellow-700 disabled:opacity-40"
                            onClick={() => runDelete(false)}
                        >
                            {busy ? 'Working…' : 'Delete'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            className="inline-flex justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
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
const Admin = ({ apiUpdate, apiLoad, format, source, setSource, params, isDms }) => {
    const {id} = params;
    const {app, API_HOST, baseUrl, pageBaseUrl, user, parent, UI, falcor, damaDataTypes, datasources} = React.useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const {AuthAPI, ...restAuth} = React.useContext(AuthContext) || {};
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

    // todo add setAuth feature for internal and external sources.
    // use statistics column. make a route to update sources.
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
                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                    }}
                            />

                            <div>
                                <div className={'grid grid-cols-3'}>
                                    <div>User</div>
                                    <div>Auth</div>
                                </div>
                                {
                                    Object.entries(parseIfJson(source?.statistics, {})?.auth?.users || {})
                                        .map(([userId, authLevel]) => <div className={'grid grid-cols-3'}>
                                            <div>{users.find(user => +user.id === +userId)?.email}</div>
                                            <Input type={'text'} value={authLevel} onChange={e => {
                                                const newAuth = {
                                                    ...parseIfJson(source?.statistics, {})?.auth,
                                                    users: {
                                                        ...(parseIfJson(source?.statistics, {})?.auth?.users || {}),
                                                        [userId]: e.target.value,
                                                    },
                                                };
                                                updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                            }} />
                                            <Button className={'w-fit'}
                                                    onClick={() => {
                                                        const newAuth = {
                                                            ...parseIfJson(source?.statistics, {})?.auth,
                                                        };

                                                        delete newAuth.users[userId];

                                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
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
                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                    }}
                            />

                            <div>
                                <div className={'grid grid-cols-3'}>
                                    <div>Group</div>
                                    <div>Auth</div>
                                </div>
                                {
                                    Object.entries(parseIfJson(source?.statistics, {})?.auth?.groups || {})
                                        .map(([groupName, authLevel]) => <div className={'grid grid-cols-3'}>
                                            <div>{groupName}</div>
                                            <Input type={'text'} value={authLevel} onChange={e => {
                                                const newAuth = {
                                                    ...parseIfJson(source?.statistics, {})?.auth,
                                                    groups: {
                                                        ...(parseIfJson(source?.statistics, {})?.auth?.groups || {}),
                                                        [groupName]: e.target.value,
                                                    },
                                                };
                                                updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                            }} />
                                            <Button className={'w-fit'}
                                                    onClick={() => {
                                                        const newAuth = {
                                                            ...parseIfJson(source?.statistics, {})?.auth,
                                                        };

                                                        delete newAuth.groups[groupName];

                                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                                    }}>remove</Button>
                                        </div>)
                                }
                            </div>
                        </div>
                    </div>

                    <div className={'w-1/4'}>
                        <div className={'flex flex-col gap-4 shadow-lg rounded-md place-content-center p-4'}>
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
                                        <DeleteDamaSourceBtn source={source} baseUrl={baseUrl} pgEnv={pgEnv} />
                                    </>
                                )
                            }

                        </div>
                    </div>
                </div>
                {
                    isDms ? null : (
                        <div className={'w-full pt-12'}>
                            <div className={'text-sm font-medium text-gray-500 pb-2'}>Tasks</div>
                            <UdaTaskList sourceId={source.source_id} />
                        </div>
                    )
                }
            </div>
    )
}

export default Admin
