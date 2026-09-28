import React, {useContext, useEffect, useState} from "react";
import {ThemeContext, getComponentTheme} from "../useTheme";
import {cloneDeep} from "lodash-es";
import {permissionsTheme as defaultPermissionsTheme} from "./Permissions.theme";

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

export default function Permissions ({
    value, inheritedValue, user, getUsers, getGroups, onChange,
    permissionDomain = defaultPermissionsDomain,
    defaultPermission = []
}) {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const permissionsTheme = { ...defaultPermissionsTheme, ...getComponentTheme(themeFromContext, 'permissions') };
    const { MultiSelect, Button, Pill, ColumnTypes, Icon } = UI;
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
        const newAuth = Object.assign({users: {}, groups: {}}, cloneDeep(tmpValue));
        newAuth.users = {...(newAuth.users || {}), [userId]: []};
        applyChanges(newAuth);
    }

    const undoDisableUser = userId => {
        const newAuth = cloneDeep(tmpValue);
        delete newAuth.users[userId];
        applyChanges(newAuth);
    }

    const disableInheritedGroup = groupName => {
        const newAuth = Object.assign({users: {}, groups: {}}, cloneDeep(tmpValue));
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
                <div className={permissionsTheme.headerRow}>
                    <label className={permissionsTheme.selectLabel}>User Access Controls</label>
                    <span className='flex-1' />
                    <div className={permissionsTheme.addAccessWrapper}>
                        <MultiSelect activeStyle='addAccess'
                                placeholder='add user access'
                                singleSelectOnly
                                searchable={true}
                                options={[{label: 'Add user access', value: undefined}, ...users
                                    .filter(u => !(u.id in inheritedUsers))
                                    .map(u => ({label: u.email, value: u.id}))]}
                                onChange={v => {
                                    const clonedValue = cloneDeep(tmpValue);
                                    const newAuth = {
                                        ...clonedValue,
                                        users: {
                                            ...(clonedValue?.users || {}),
                                            [v]: defaultPermission || [],
                                        },
                                    };
                                    applyChanges(newAuth)
                                }}
                        />
                    </div>
                </div>

                <div className={permissionsTheme.valueWrapperInherited}>
                    {
                        Object.entries(inheritedUsers)
                            .map(([userId, permissions]) => {
                                const hasOverride = userId in (tmpValue?.users || {});
                                const isDisabled = hasOverride && (tmpValue.users[userId] || []).length === 0;
                                const effectivePermissions = hasOverride ? (tmpValue.users[userId] || []) : permissions;
                                return (
                                    <div className={permissionsTheme.valueSubWrapperInherited} key={`permissions_user_${userId}`}>
                                        <div className='flex items-center gap-2'>
                                            <div className={permissionsTheme.title}>{users.find(u => +u.id === +userId)?.email}</div>
                                            {isDisabled && <span className={permissionsTheme.disabledLabel}>Disabled</span>}
                                            {!isDisabled &&
                                                <Pill color={'orange'} text={'Disable'} onClick={() => disableInheritedUser(userId)} />
                                            }
                                            {hasOverride &&
                                                <Pill color={'orange'} text={isDisabled ? 'Undo' : 'Reset'} onClick={() => undoDisableUser(userId)} />
                                            }
                                        </div>
                                        {!isDisabled &&
                                            <div className={permissionsTheme.valueEditorWrapper}>
                                                <ColumnTypes.multiselect.EditComp
                                                    activeStyle='plain'
                                                    value={effectivePermissions}
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
                                            </div>
                                        }
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
                                    <div className={permissionsTheme.valueEditorWrapper}>
                                        <ColumnTypes.multiselect.EditComp
                                            activeStyle='plain'
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
                                    </div>

                                    <Button className={permissionsTheme.removeBtn}
                                            title='Remove grant' aria-label='Remove grant'
                                            onClick={() => {
                                                const newAuth = cloneDeep(tmpValue);

                                                delete newAuth.users[userId];

                                                applyChanges(newAuth)
                                            }}><Icon icon='TrashCan' className={permissionsTheme.removeIcon}/></Button>
                                </div>)
                            )
                    }
                </div>
            </div>

            <div className={permissionsTheme.selectWrapper}>
                <div className={permissionsTheme.headerRow}>
                    <label className={permissionsTheme.selectLabel}>Group Access Controls</label>
                    <span className='flex-1' />
                    <div className={permissionsTheme.addAccessWrapper}>
                        <MultiSelect activeStyle='addAccess'
                                placeholder='add group access'
                                singleSelectOnly
                                searchable={true}
                                options={[{label: 'Add group access', value: undefined}, ...groups
                                    .filter(g => !(g.name in inheritedGroups))
                                    .map(g => ({label: g.name, value: g.name}))]}
                                onChange={v => {
                                    const clonedValue = cloneDeep(tmpValue);
                                    const newAuth = {
                                        ...clonedValue,
                                        groups: {
                                            ...(clonedValue?.groups || {}),
                                            [v]: defaultPermission || [],
                                        },
                                    };

                                    applyChanges(newAuth)
                                }}
                        />
                    </div>
                </div>

                <div className={permissionsTheme.valueWrapperInherited}>
                    {
                        Object.entries(inheritedGroups)
                            .map(([groupName, permissions]) => {
                                const hasOverride = groupName in (tmpValue?.groups || {});
                                const isDisabled = hasOverride && (tmpValue.groups[groupName] || []).length === 0;
                                const effectivePermissions = hasOverride ? (tmpValue.groups[groupName] || []) : permissions;
                                return (
                                    <div className={permissionsTheme.valueSubWrapperInherited} key={`permissions_group_${groupName}`}>
                                        <div className='flex items-center gap-2'>
                                            <div className={permissionsTheme.title}>{groupName}</div>
                                            {isDisabled && <span className={permissionsTheme.disabledLabel}>Disabled</span>}
                                            {!isDisabled &&
                                                <Pill color={'orange'} text={'Disable'} onClick={() => disableInheritedGroup(groupName)} />
                                            }
                                            {hasOverride &&
                                                <Pill color={'orange'} text={isDisabled ? 'Undo' : 'Reset'} onClick={() => undoDisableGroup(groupName)} />
                                            }
                                        </div>
                                        {!isDisabled &&
                                            <div className={permissionsTheme.valueEditorWrapper}>
                                                <ColumnTypes.multiselect.EditComp
                                                    activeStyle='plain'
                                                    value={effectivePermissions}
                                                    multiple={true}
                                                    options={permissionDomain}
                                                    onChange={e => {
                                                        const clonedValue = cloneDeep(tmpValue);
                                                        const newAuth = {
                                                            ...clonedValue,
                                                            groups: {
                                                                ...(clonedValue?.groups || {}),
                                                                [groupName]: e
                                                            },
                                                        };
                                                        applyChanges(newAuth)
                                                    }}/>
                                            </div>
                                        }
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
                                        <div className={permissionsTheme.valueEditorWrapper}>
                                            <ColumnTypes.multiselect.EditComp
                                                activeStyle='plain'
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
                                        </div>
                                        <Button className={permissionsTheme.removeBtn}
                                                title='Remove grant' aria-label='Remove grant'
                                                onClick={() => {
                                                    const newAuth = cloneDeep(tmpValue);

                                                    delete newAuth.groups[groupName];

                                                    applyChanges(newAuth)
                                                }}><Icon icon='TrashCan' className={permissionsTheme.removeIcon}/></Button>
                                    </div>
                                )
                            )
                    }
                </div>
            </div>
        </div>
    )
}
