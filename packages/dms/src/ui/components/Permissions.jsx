import React, {useEffect, useState} from "react";
import Select from "./Select";
import Button from "./Button";
import Pill from "./Pill"
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
    valueWrapperInherited: 'flex flex-col gap-4 p-2 bg-gray-100 rounded-md',
    valueSubWrapper: 'flex flex-wrap',
    valueSubWrapperInherited: 'flex flex-col hover:bg-gray-50 rounded-md',
    title: 'font-semibold',
    removeBtn: 'w-fit'
}

export default function ({
    value, inheritedValue, user, getUsers, getGroups, onChange,
    permissionDomain = defaultPermissionsDomain,
    defaultPermission = []
}) {
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const [tmpValue, setTmpValue] = useState(parseIfJSON(value));
    const inheritedParsedValue = parseIfJSON(inheritedValue);

    // useEffect(() => setTmpValue(parseIfJSON(value)),[value])
    // console.log('UI - Permissions value', tmpValue)

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
        const currentUserGroupHasPermissions = user.groups.some(g => g !== 'public' && Array.isArray(newAuth.groups[g]) && newAuth.groups[g].length);

        if (!isEmptyAuth && !currentUserHasPermissions && !currentUserGroupHasPermissions) {
            newAuth.users[user.id] = ['*'];
        }
        setTmpValue(newAuth)
        onChange(JSON.stringify(newAuth))
    }

    const inheritedUsers = inheritedParsedValue?.users || {};
    const inheritedGroups = inheritedParsedValue?.groups || {};

    const disableInheritedUser = userId => {
        const newAuth = cloneDeep(tmpValue);
        newAuth.users = {...(newAuth.users || {}), [userId]: []};
        applyChanges(newAuth);
    }

    const undoDisableUser = userId => {
        const newAuth = cloneDeep(tmpValue);
        delete newAuth.users[userId];
        applyChanges(newAuth);
    }

    const disableInheritedGroup = groupName => {
        const newAuth = cloneDeep(tmpValue);
        newAuth.groups = {...(newAuth.groups || {}), [groupName]: []};
        applyChanges(newAuth);
    }

    const undoDisableGroup = groupName => {
        const newAuth = cloneDeep(tmpValue);
        delete newAuth.groups[groupName];
        applyChanges(newAuth);
    }

    return (
        <div className={permissionsTheme.componentWrapper}>
            <div className={permissionsTheme.selectWrapper}>
                <label className={permissionsTheme.selectLabel}>User Access Controls</label>
                <Select className={permissionsTheme.select}
                        options={[{label: 'Add user access', value: undefined}, ...users
                            .filter(u => !(u.id in inheritedUsers))
                            .map(u => ({label: u.email, value: u.id}))]}
                        onChange={e => {
                            const clonedValue = cloneDeep(tmpValue);
                            const newAuth = {
                                ...clonedValue,
                                users: {
                                    ...(clonedValue?.users || {}),
                                    [e.target.value]: defaultPermission || [],
                                },
                            };
                            applyChanges(newAuth)
                        }}
                />

                <div className={permissionsTheme.valueWrapperInherited}>
                    {
                        Object.entries(inheritedUsers)
                            .map(([userId, permissions]) => {
                                const isDisabled = userId in (tmpValue?.users || {}) && (tmpValue.users[userId] || []).length === 0;
                                return (
                                    <div className={permissionsTheme.valueSubWrapperInherited} key={`permissions_user_${userId}`}>
                                        <div className='flex items-center gap-2'>
                                            <div className={permissionsTheme.title}>{users.find(u => +u.id === +userId)?.email}</div>
                                            {isDisabled && <span className='text-xs text-red-600 font-semibold'>Disabled</span>}
                                            {isDisabled
                                                ? <Pill color={'orange'} text={'Undo'} onClick={() => undoDisableUser(userId)} />
                                                : <Pill color={'orange'} text={'Disable'} onClick={() => disableInheritedUser(userId)} />
                                            }
                                        </div>
                                        {!isDisabled && <div>{permissions.join(', ')}</div>}
                                    </div>
                                );
                            })
                    }
                </div>
                <div className={permissionsTheme.valueWrapper}>
                    {
                        Object.entries(tmpValue?.users || {})
                            .filter(([userId]) => !(userId in inheritedUsers))
                            .map(([userId, permissions]) => (
                                <div className={permissionsTheme.valueSubWrapper} key={`permissions_user_local_${userId}`}>
                                    <div
                                        className={permissionsTheme.title}>{users.find(u => +u.id === +userId)?.email}</div>
                                    <ColumnTypes.multiselect.EditComp
                                        value={permissions}
                                        multiple={true}
                                        options={permissionDomain}
                                        onChange={e => {
                                            const clonedValue = cloneDeep(tmpValue);
                                            const newAuth = {
                                                ...clonedValue,
                                                users: {
                                                    ...(clonedValue?.users || {}),
                                                    [userId]: e
                                                },
                                            };
                                            applyChanges(newAuth)
                                        }}/>

                                    <Button className={permissionsTheme.removeBtn}
                                            onClick={() => {
                                                const newAuth = cloneDeep(tmpValue);

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
                        options={[{label: 'Add group access', value: undefined}, ...groups
                            .filter(g => !(g.name in inheritedGroups))
                            .map(g => ({label: g.name, value: g.name}))]}
                        onChange={e => {
                            const clonedValue = cloneDeep(tmpValue);
                            const newAuth = {
                                ...clonedValue,
                                groups: {
                                    ...(clonedValue?.groups || {}),
                                    [e.target.value]: defaultPermission || [],
                                },
                            };

                            applyChanges(newAuth)
                        }}
                />

                <div className={permissionsTheme.valueWrapperInherited}>
                    {
                        Object.entries(inheritedGroups)
                            .map(([groupName, permissions]) => {
                                const isDisabled = groupName in (tmpValue?.groups || {}) && (tmpValue.groups[groupName] || []).length === 0;
                                return (
                                    <div className={permissionsTheme.valueSubWrapperInherited} key={`permissions_group_${groupName}`}>
                                        <div className='flex items-center gap-2'>
                                            <div className={permissionsTheme.title}>{groupName}</div>
                                            {isDisabled && <span className='text-xs text-red-600 font-semibold'>Disabled</span>}
                                            {isDisabled
                                                ? <Pill color={'orange'} text={'Undo'} onClick={() => undoDisableGroup(groupName)} />
                                                : <Pill color={'orange'} text={'Disable'} onClick={() => disableInheritedGroup(groupName)} />
                                            }
                                        </div>
                                        {!isDisabled && <div>{permissions.join(', ')}</div>}
                                    </div>
                                );
                            })
                    }
                </div>
                <div className={permissionsTheme.valueWrapper}>
                    {
                        Object.entries(tmpValue?.groups || {})
                            .filter(([groupName]) => !(groupName in inheritedGroups))
                            .map(([groupName, permissions]) => (
                                    <div className={permissionsTheme.valueSubWrapper} key={`permissions_group_local_${groupName}`}>
                                        <div className={permissionsTheme.title}>{groupName}</div>
                                        <ColumnTypes.multiselect.EditComp
                                            value={permissions}
                                            multiple={true}
                                            options={permissionDomain}
                                            onChange={e => {
                                                const clonedValue = cloneDeep(tmpValue)
                                                const newAuth = {
                                                    ...clonedValue,
                                                    groups: {
                                                        ...(clonedValue?.groups || {}),
                                                        [groupName]: e
                                                    },
                                                };

                                                applyChanges(newAuth)
                                            }}/>
                                        <Button className={permissionsTheme.removeBtn}
                                                onClick={() => {
                                                    const newAuth = cloneDeep(tmpValue);

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
