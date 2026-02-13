import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../../../../context";
import { AuthContext } from "../../../../../auth/context"
import { cloneDeep } from "lodash-es";
import {Link} from "react-router";
import {updateSourceData, parseIfJson} from "../../default/utils";

const buttonRedClass = 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md';
const buttonGreenClass = 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md';

const DeleteSourceBtn = ({parent, source, apiUpdate, baseUrl}) => {
    const {UI} = useContext(DatasetsContext);
    const {DeleteModal} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    const deleteSource = async () => {
        const parentType = parent.ref.split('+')[1];
        if(!parentType) return;

        const config = {
            format: {
                app: parent.app,
                type: parentType
            }
        }
        const data = cloneDeep(parent);
        data.sources = data.sources.filter(s => s.id !== source.id);

        await apiUpdate({data, config});
        window.location.assign(baseUrl);
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

/**
 * AddViewBtn — follows the forms pattern.
 * Uses `item` (DMS data_items row with .id) rather than `source` (UDA object with .source_id).
 * dmsDataEditor needs data.id to locate the item, and format.attributes must include
 * the views dms-format attribute (ensured by the sourceFormat fix in SourcePage).
 */
const AddViewBtn = ({item, format, apiUpdate}) => {
    const {UI} = useContext(DatasetsContext);
    const {Modal} = UI;
    const [showModal, setShowModal] = useState(false);
    const [name, setName] = useState('');
    const defaultViewName = `version ${(item?.views?.length || 0) + 1}`;

    const addView = async () => {
        const config = {format}
        const data = cloneDeep(item);
        data.views = [...(data.views || []), {name: name || defaultViewName}];

        await apiUpdate({data, config});
    }
    console.log('add view btn', item)
    return (
        <>
            <button disabled={!item.id} className={buttonGreenClass} onClick={() => setShowModal(true)}>Add Version</button>
            <Modal open={showModal} setOpen={(v) => setShowModal(v)}>
                <input key={'view-name'} placeholder={defaultViewName} value={name} onChange={e => setName(e.target.value)}/>
                <button className={buttonGreenClass} onClick={() => {
                    async function add() {
                        await addView()
                        setShowModal(false)
                    }

                    add()
                }}>add</button>
            </Modal>
        </>
    )
}

const Admin = ({ apiUpdate, apiLoad, format, item, source, setSource, params }) => {
    const {id} = params;
    const {app, baseUrl, pageBaseUrl, user, parent, UI, falcor, datasources} = React.useContext(DatasetsContext) || {};
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
                            <AddViewBtn item={item} format={format} apiUpdate={apiUpdate}/>
                            <DeleteSourceBtn parent={parent} source={source} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                        </div>
                    </div>
                </div>
            </div>
    )
}

export default Admin
