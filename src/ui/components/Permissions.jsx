import React, {useEffect, useState} from "react";
import Select from "./Select";
import Button from "./Button";
import ColumnTypes from "../columnTypes"
import {cloneDeep} from "lodash-es";

const parseIfJSON = strValue => {
    try {
        return JSON.parse(strValue)
    } catch (e) {
        return strValue
    }
}

const defaultPermissionsDomain = [
    {label: '*', value: '*'},
    {label: 'create', value: 'create'},
    {label: 'update', value: 'update'},
]

const permissionsTheme = {
    componentWrapper: '',
    selectWrapper: 'shadow-md rounded-md place-content-center p-4 w-full',
    selectLabel: 'text-xl text-gray-900 font-semibold',
    select: 'w-1/2',
    valueWrapper: 'flex flex-col gap-4 p-2 hover:bg-gray-100 rounded-md',
    valueSubWrapper: 'flex flex-wrap',
    title: 'font-semibold',
    removeBtn: 'w-fit'
}

export default function ({
                             value, user, getUsers, getGroups, onChange,
                             permissionDomain = defaultPermissionsDomain,
                             defaultPermission = []
                         }) {
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const [tmpValue, setTmpValue] = useState(parseIfJSON(value));

    useEffect(() => {
        async function load() {
            if (!user?.token) return;

            const users = await getUsers({user});
            const groups = await getGroups({user});

            setUsers(users?.users || []);
            setGroups(groups?.groups || [])
        }

        load();
    }, []);

    const applyChanges = value => {
        // if current user or one of its groups isn't included in newAuth, add current user with * permission
        const newAuth = Object.assign({users: {}, groups: {}}, cloneDeep(value));
        const isEmptyAuth = !Object.keys(newAuth.users).length && !Object.keys(newAuth.groups).length
        const currentUserHasPermissions = Array.isArray(newAuth.users[user.id]) && newAuth.users[user.id].length;
        const currentUserGroupHasPermissions = user.groups.some(g => g!== 'public' && Array.isArray(newAuth.groups[g]) && newAuth.groups[g].length);

        if(!isEmptyAuth && !currentUserHasPermissions && !currentUserGroupHasPermissions){
            newAuth.users[user.id] = ['*'];
        }
        setTmpValue(newAuth)
        onChange(JSON.stringify(newAuth))
    }
    return (
        <div className={permissionsTheme.componentWrapper}>
            <div className={permissionsTheme.selectWrapper}>
                <label className={permissionsTheme.selectLabel}>User Access Controls</label>
                <Select className={permissionsTheme.select}
                        options={[{label: 'Add user access', value: undefined}, ...users.map(u => ({
                            label: u.email,
                            value: u.id
                        }))]}
                        onChange={e => {
                            const newAuth = {
                                ...tmpValue,
                                users: {
                                    ...(tmpValue?.users || {}),
                                    [e.target.value]: defaultPermission || [],
                                },
                            };
                            applyChanges(newAuth)
                        }}
                />

                <div className={permissionsTheme.valueWrapper}>
                    {
                        Object.entries(tmpValue?.users || {})
                            .map(([userId, permissions]) => (
                                <div className={permissionsTheme.valueSubWrapper}>
                                    <div
                                        className={permissionsTheme.title}>{users.find(user => +user.id === +userId)?.email}</div>
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
                                            applyChanges(newAuth)
                                        }}/>

                                    <Button className={permissionsTheme.removeBtn}
                                            onClick={() => {
                                                const newAuth = {
                                                    ...tmpValue,
                                                };

                                                delete newAuth.users[userId];

                                                applyChanges(newAuth)
                                            }}>remove</Button>
                                </div>)
                            )
                    }
                </div>
            </div>

            <div className={permissionsTheme.selectWrapper}>
                <label className={permissionsTheme.selectLabel}>Group Access Controls</label>
                <Select className={permissionsTheme.select}
                        options={[{label: 'Add group access', value: undefined}, ...groups.map(u => ({
                            label: u.name,
                            value: u.name
                        }))]}
                        onChange={e => {
                            const newAuth = {
                                ...tmpValue,
                                groups: {
                                    ...(tmpValue?.groups || {}),
                                    [e.target.value]: defaultPermission || [],
                                },
                            };

                            applyChanges(newAuth)
                        }}
                />

                <div className={permissionsTheme.valueWrapper}>
                    {
                        Object.entries(tmpValue?.groups || {})
                            .map(([groupName, permissions]) => (
                                    <div className={permissionsTheme.valueSubWrapper}>
                                        <div className={permissionsTheme.title}>{groupName}</div>
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

                                                applyChanges(newAuth)
                                            }}/>
                                        <Button className={permissionsTheme.removeBtn}
                                                onClick={() => {
                                                    const newAuth = {
                                                        ...tmpValue,
                                                    };

                                                    delete newAuth.groups[groupName];

                                                    applyChanges(newAuth)
                                                }}>remove</Button>
                                    </div>
                                )
                            )
                    }
                </div>
            </div>
        </div>
    )
}