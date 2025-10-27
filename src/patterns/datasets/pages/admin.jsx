import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from "../context";
import { ThemeContext } from "../../../ui/useTheme";
import { AuthContext } from "../../auth/context"
import SourcesLayout from "../components/DatasetsListComponent/layout";
import { cloneDeep } from "lodash-es";
import {useNavigate, Link} from "react-router";
import {getSourceData, updateSourceData, parseIfJson} from "./utils";
const buttonRedClass = 'p-2 mx-1 bg-red-500 hover:bg-red-700 text-white rounded-md';
const buttonGreenClass = 'p-2 mx-1 bg-green-500 hover:bg-green-700 text-white rounded-md';

const DeleteSourceBtn = ({parent, item, apiUpdate, baseUrl}) => {
    // update parent to exclude item. the item still stays in the DB.
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
        data.sources = data.sources.filter(s => s.id !== item.id);
        console.log('parent', config, data, item)

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

const AddViewBtn = ({item, format, apiLoad, apiUpdate}) => {
    // update parent to exclude item. the item still stays in the DB.
    const {UI} = useContext(DatasetsContext);
    const {Modal} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [name, setName] = useState('');
    const navigate = useNavigate();
    const defaultViewName = `version ${(item?.views?.length || 0) + 1}`;

    const addView = async () => {
        const config = {format}
        const data = cloneDeep(item);
        data.views = [...(data.views || []), {name: name || defaultViewName}];

        const res = await apiUpdate({data, config});
        console.log('res', res)
        // navigate(baseUrl)
        // window.location.assign(baseUrl);
    }
    return (
        <>
            <button disabled={!item.id} className={buttonGreenClass} onClick={() => setShowDeleteModal(true)}>Add Version</button>

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

const ClearDataBtn = ({app, type, apiLoad, apiUpdate}) => {
    const {UI} = useContext(DatasetsContext);
    const {DeleteModal} = UI;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const clearData = async () => {
        // fetch all ids based on app and type (doc_type of source), and then call dmsDataEditor with config={app, type}, data={id}, requestType='delete
        const attributes = ['id']
        const action = 'load'
        const config = {
            format: {
                app: app,
                type: type,
                attributes
            },
            children: [
                {
                    type: () => {},
                    action,
                    filter: {
                        options: JSON.stringify({}),
                        attributes
                    },
                    path: '/'
                }
            ]
        }

        const res = await apiLoad(config);
        if(!res?.length) return;
        const ids = res.map(r => r.id).filter(r => typeof r !== 'object' && r);
        if(!ids?.length) return;

        await apiUpdate({data: {id: ids}, config, requestType: 'delete'});
    }
    return (
        <>
            <button className={buttonRedClass} onClick={() => setShowDeleteModal(true)}>Clear Data</button>

            <DeleteModal
                title={`Clear Uploaded Data`} open={showDeleteModal}
                prompt={`Are you sure you want to clear all uploaded data for this source? This action cannot be undone.`}
                setOpen={(v) => setShowDeleteModal(v)}
                onDelete={() => {
                    async function deleteItem() {
                        await clearData()
                        setShowDeleteModal(false)
                    }

                    deleteItem()
                }}
            />
        </>
    )
}
const Admin = ({
                   status,
                   apiUpdate,
                   apiLoad,
                   attributes = {},
                   dataItems,
                   format,
                   item,
                   setItem,
                   updateAttribute,
                   params,
                   submit,
                   manageTemplates = false,
                   ...r
               }) => {
    const {pgEnv, id} = params;
    const isDms = pgEnv === 'internal';
    const {app, API_HOST, baseUrl, pageBaseUrl, user, parent, UI, falcor, ...rest} = React.useContext(DatasetsContext) || {};
    const {theme} = React.useContext(ThemeContext) || {};
    const {AuthAPI, ...restAuth} = React.useContext(AuthContext) || {};
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const [source, setSource] = React.useState(isDms ? item : {});
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

    useEffect(() => {
        // if(isDms) // use item
        if((!isDms || (isDms && !Object.entries(item).length)) && id && pgEnv){
            // fetch source data
            getSourceData({pgEnv, falcor, source_id: id, setSource});
        }
    }, [isDms, item.config])

    console.log('users?', source, format)

    if(!user || !user.token) return <></>

    // todo add setAuth feature for internal and external sources.
    // use statistics column. make a route to update sources.
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false}
                       hideBreadcrumbs={false}
                       form={{name: source.name || source.doc_type, href: format.url_slug}}
                       page={{name: 'Admin', href: `${pageBaseUrl}/${pgEnv}/${params.id}/admin`}}
                       pgEnv={pgEnv}
                       id={params.id} //page id to use for navigation
        >
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
                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
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
                                                updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
                                            }} />
                                            <Button className={'w-fit'}
                                                    onClick={() => {
                                                        const newAuth = {
                                                            ...parseIfJson(source?.statistics, {})?.auth,
                                                        };

                                                        delete newAuth.users[userId];

                                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
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
                                        updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
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
                                                updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
                                            }} />
                                            <Button className={'w-fit'}
                                                onClick={() => {
                                                    const newAuth = {
                                                        ...parseIfJson(source?.statistics, {})?.auth,
                                                    };

                                                    delete newAuth.groups[groupName];

                                                    updateSourceData({data: ({auth: newAuth}), attrKey: 'statistics', isDms, apiUpdate, setSource, item, format, source, pgEnv, falcor, id})
                                            }}>remove</Button>
                                        </div>)
                                }
                            </div>
                        </div>
                    </div>

                    <div className={'flex flex-col gap-4 shadow-lg rounded-md place-content-center p-4'}>
                        <Button><Link to={`${baseUrl}/source/${pgEnv}/${id}/metadata`}>Advanced Metadata</Link></Button>
                        {
                            isDms ? (
                                <>
                                    <AddViewBtn item={item} format={format} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                                    <ClearDataBtn app={app} type={item.doc_type} apiLoad={apiLoad} apiUpdate={apiUpdate}/>
                                    <DeleteSourceBtn parent={parent} item={item} apiUpdate={apiUpdate} baseUrl={baseUrl}/>
                                </>
                            ) : (
                                <>
                                    <Button>Add Version</Button>
                                    <Button>Delete</Button>
                                </>
                            )
                        }

                    </div>
                </div>
            </div>
        </SourcesLayout>

    )
}

export default Admin