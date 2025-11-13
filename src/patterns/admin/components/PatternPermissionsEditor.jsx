import React, {useEffect, useState} from "react";
import {AuthContext} from "../../auth/context";

const parseIfJSON = strValue => {
    try {
        return JSON.parse(strValue)
    }catch (e){
        return strValue
    }
}

const defaultPermissionsDomain = [
    {label: 'create', value: 'create'},
    {label: 'update', value: 'update'},
]
export const PatternPermissionsEditor = ({value={}, onChange, UI, user, permissionDomain=defaultPermissionsDomain, defaultPermission=[]}) => {
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const [tmpValue, setTmpValue] = useState(parseIfJSON(value));
    const {Select, Input, Button, FieldSet, ColumnTypes} = UI;

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

    return (
        <div className={''}>
            <div className={'shadow-md rounded-md place-content-center p-4 w-full'}>
                <label className={'text-xl text-gray-900 font-semibold'}>User Access Controls</label>
                <Select className={'w-1/2'}
                        options={[{label: 'Add user access', value: undefined}, ...users.map(u => ({label: u.email, value: u.id}))]}
                        onChange={e => {
                            const newAuth = {
                                ...tmpValue,
                                users: {
                                    ...(tmpValue?.users || {}),
                                    [e.target.value]: defaultPermission || [],
                                },
                            };
                            setTmpValue(newAuth)
                            onChange(JSON.stringify(newAuth))
                        }}
                />

                <div>
                    <div className={'grid grid-cols-3'}>
                        <div>User</div>
                        <div>Auth</div>
                    </div>
                    {
                        Object.entries(tmpValue?.users || {})
                            .map(([userId, permissions]) => <div className={'grid grid-cols-3'}>
                                <div>{users.find(user => +user.id === +userId)?.email}</div>
                                <ColumnTypes.multiselect.EditComp
                                    value={permissions}
                                    multiple={true}
                                    options={permissionDomain}
                                    onChange={e => {
                                        const newAuth = {
                                            ...tmpValue,
                                            users: {
                                                ...(tmpValue?.users || {}),
                                                [userId]: e
                                            },
                                        };
                                        setTmpValue(newAuth)
                                        onChange(JSON.stringify(newAuth))
                                    }} />

                                <Button className={'w-fit'}
                                        onClick={() => {
                                            const newAuth = {
                                                ...tmpValue,
                                            };

                                            delete newAuth.users[userId];

                                            setTmpValue(newAuth)
                                            onChange(JSON.stringify(newAuth))
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
                                ...tmpValue,
                                groups: {
                                    ...(tmpValue?.groups || {}),
                                    [e.target.value]: defaultPermission || [],
                                },
                            };

                            setTmpValue(newAuth)
                            onChange(JSON.stringify(newAuth))
                        }}
                />

                <div>
                    <div className={'grid grid-cols-3'}>
                        <div>Group</div>
                        <div>Auth</div>
                    </div>
                    {
                        Object.entries(tmpValue?.groups || {})
                            .map(([groupName, permissions]) => <div className={'grid grid-cols-3'}>
                                <div>{groupName}</div>
                                <ColumnTypes.multiselect.EditComp
                                    value={permissions}
                                    multiple={true}
                                    options={permissionDomain}
                                    onChange={e => {
                                        const newAuth = {
                                            ...tmpValue,
                                            groups: {
                                                ...(tmpValue?.groups || {}),
                                                [groupName]: e
                                            },
                                        };

                                        setTmpValue(newAuth)
                                        onChange(JSON.stringify(newAuth))
                                    }} />
                                <Button className={'w-fit'}
                                        onClick={() => {
                                            const newAuth = {
                                                ...tmpValue,
                                            };

                                            delete newAuth.groups[groupName];

                                            setTmpValue(newAuth)
                                            onChange(JSON.stringify(newAuth))
                                        }}>remove</Button>
                            </div>)
                    }
                </div>
            </div>
        </div>
    )
}