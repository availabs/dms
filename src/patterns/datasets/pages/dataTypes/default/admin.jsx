import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { AuthContext } from "../../../../auth/context"
import SourcesLayout from "../../layout";
import { cloneDeep } from "lodash-es";
import {useNavigate, Link} from "react-router";
import {getSourceData, updateSourceData, parseIfJson} from "./utils";
const buttonRedClass = 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md';
const buttonGreenClass = 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md';

const DeleteSourceBtn = ({parent, source, apiUpdate, baseUrl}) => {
    // update parent to exclude source. the source still stays in the DB.
    const {UI} = useContext(DatasetsContext);
    const {DeleteModal} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const navigate = useNavigate();

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
        console.log('parent', config, data, source)

        await apiUpdate({data, config});
        // navigate(baseUrl)
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
        console.log('res', res)
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

const AddExternalVersionBtn = ({source}) => {
    const {UI, datasets} = useContext(DatasetsContext);
    const {Modal, Button} = UI;
    const [showModal, setShowModal] = useState(false);
    const srcType = (source?.categories || [])[0]?.[0];
    const CreatePage = (datasets[source?.type] || datasets[srcType])?.sourceCreate?.component;
    console.log('????', srcType, source)
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
    const {app, API_HOST, baseUrl, pageBaseUrl, user, parent, UI, falcor, datasets, pgEnv} = React.useContext(DatasetsContext) || {};
    const {theme} = React.useContext(ThemeContext) || {};
    const {AuthAPI, ...restAuth} = React.useContext(AuthContext) || {};
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const {Select, Input, Button} = UI;
    console.log(datasets, source) // if external source, find sourceCreate from this and render its component for add version

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

    console.log('users?', source, format)

    if(!user || !user.token) return <></>

    // todo add setAuth feature for internal and external sources.
    // use statistics column. make a route to update sources.
    return (
            <div className={`${theme?.page?.wrapper1} max-w-7xl mx-auto`}>
                <div className={'w-full p-2 bg-white flex gap-12'}>
                    <div className={'flex flex-col grow'}>
                        <div className={'shadow-md rounded-md place-content-center p-4'}>
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

                        <div className={'shadow-lg rounded-md place-content-center p-4'}>
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
                                    <Button>Delete</Button>
                                </>
                            )
                        }

                    </div>
                </div>
            </div>
    )
}

export default Admin