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
    defaultPermission = [],
    // optional chrome (all callers work without them):
    heading = 'Access',            // label above the grants
    inheritedFrom = 'the parent',  // "Inherited from {inheritedFrom}"
    summary = null,                // node rendered first (the page pane's "who can do what")
}) {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const permissionsTheme = { ...defaultPermissionsTheme, ...getComponentTheme(themeFromContext, 'permissions') };
    const { MultiSelect, Button, ColumnTypes, Icon } = UI;
    const [users, setUsers] = React.useState([]);
    const [groups, setGroups] = React.useState([]);
    const [tmpValue, setTmpValue] = useState(parseIfJSON(value));
    const inheritedParsedValue = parseIfJSON(inheritedValue);

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
    // The users list only loads for accounts allowed to list users; fall back
    // to the id so a grant row is never blank.
    const userLabel = userId => users.find(u => +u.id === +userId)?.email || `user ${userId}`;

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


    // One editor for every grant row (own or inherited): the permission-domain multiselect, as pills.
    const setGrant = (kind, key, perms) => {
        const clonedValue = cloneDeep(tmpValue);
        applyChanges({...clonedValue, [kind]: {...(clonedValue?.[kind] || {}), [key]: perms}});
    };
    const permEditor = (kind, key, perms) => (
        <div className={permissionsTheme.valueEditorWrapper}>
            <ColumnTypes.multiselect.EditComp
                activeStyle={permissionsTheme.permEditorStyle}
                value={perms}
                multiple={true}
                options={permissionDomain}
                onChange={e => setGrant(kind, key, e)}/>
        </div>
    );
    const removeGrant = (kind, key) => {
        const newAuth = cloneDeep(tmpValue);
        delete newAuth[kind][key];
        applyChanges(newAuth);
    };

    const ownGroups = Object.entries(tmpValue?.groups || {}).filter(([name]) => !(name in inheritedGroups));
    const ownUsers = Object.entries(tmpValue?.users || {}).filter(([userId]) => !(userId in inheritedUsers));
    const inheritedRows = [
        ...Object.entries(inheritedGroups).map(([key, perms]) => ({kind: 'groups', key, label: key, perms})),
        ...Object.entries(inheritedUsers).map(([key, perms]) => ({kind: 'users', key, label: userLabel(key), perms})),
    ].map(row => {
        const hasOverride = row.key in (tmpValue?.[row.kind] || {});
        const isDisabled = hasOverride && (tmpValue[row.kind][row.key] || []).length === 0;
        return {...row, hasOverride, isDisabled, effective: hasOverride ? (tmpValue[row.kind][row.key] || []) : row.perms};
    });
    const disabledCount = inheritedRows.filter(r => r.isDisabled).length;
    const disableInherited = row => row.kind === 'users' ? disableInheritedUser(row.key) : disableInheritedGroup(row.key);
    const undoInherited = row => row.kind === 'users' ? undoDisableUser(row.key) : undoDisableGroup(row.key);

    return (
        <div className={permissionsTheme.componentWrapper}>
            {summary}

            <div className={permissionsTheme.headerRow}>
                <label className={permissionsTheme.selectLabel}>{heading}</label>
                <div className={permissionsTheme.addAccessWrapper}>
                    <MultiSelect activeStyle='addAccess'
                            placeholder='+ group'
                            singleSelectOnly
                            searchable={true}
                            options={[{label: 'Add group access', value: undefined}, ...groups
                                .filter(g => !(g.name in inheritedGroups))
                                .map(g => ({label: g.name, value: g.name}))]}
                            onChange={v => setGrant('groups', v, defaultPermission || [])}
                    />
                </div>
                <div className={permissionsTheme.addAccessWrapper}>
                    <MultiSelect activeStyle='addAccess'
                            placeholder='+ person'
                            singleSelectOnly
                            searchable={true}
                            options={[{label: 'Add user access', value: undefined}, ...users
                                .filter(u => !(u.id in inheritedUsers))
                                .map(u => ({label: u.email, value: u.id}))]}
                            onChange={v => setGrant('users', v, defaultPermission || [])}
                    />
                </div>
            </div>

            <div className={permissionsTheme.grantList}>
                {!ownGroups.length && !ownUsers.length &&
                    <div className={permissionsTheme.emptyText}>No grants here yet — add a group or a person.</div>}
                {[...ownGroups.map(([key, perms]) => ({kind: 'groups', key, label: key, icon: 'Group', perms})),
                  ...ownUsers.map(([key, perms]) => ({kind: 'users', key, label: userLabel(key), icon: 'User', perms}))]
                    .map(row => (
                        <div className={permissionsTheme.grantRow} key={`permissions_${row.kind}_${row.key}`}>
                            <div className={permissionsTheme.grantHead}>
                                <Icon icon={row.icon} className={permissionsTheme.grantIcon}/>
                                <div className={permissionsTheme.title} title={row.label}>{row.label}</div>
                                <Button activeStyle='iconRowDanger'
                                        title='Remove grant' aria-label='Remove grant'
                                        onClick={() => removeGrant(row.kind, row.key)}>
                                    <Icon icon='TrashCan' className={permissionsTheme.removeIcon}/>
                                </Button>
                            </div>
                            {permEditor(row.kind, row.key, row.perms)}
                        </div>
                    ))}
            </div>

            {inheritedRows.length > 0 &&
                <details className={permissionsTheme.inheritedWrap}>
                    <summary className={permissionsTheme.inheritedSummary}>
                        <span className={permissionsTheme.inheritedSummaryLabel}>Inherited from {inheritedFrom}</span>
                        <span className={permissionsTheme.inheritedSummaryCount}>
                            {inheritedRows.length}{disabledCount ? ` · ${disabledCount} disabled` : ''}
                        </span>
                        <Icon icon='CaretDown' className={permissionsTheme.inheritedSummaryIcon}/>
                    </summary>
                    {inheritedRows.map(row => (
                        <div className={permissionsTheme.inheritedRow} key={`permissions_inherited_${row.kind}_${row.key}`}>
                            <div className={permissionsTheme.inheritedHead}>
                                <div className={row.isDisabled ? permissionsTheme.inheritedNameDisabled : permissionsTheme.inheritedName}
                                     title={row.label}>{row.label}</div>
                                {row.isDisabled && <span className={permissionsTheme.disabledLabel}>disabled here</span>}
                                {row.hasOverride && !row.isDisabled && <span className={permissionsTheme.overriddenLabel}>changed here</span>}
                                {!row.isDisabled &&
                                    <button type='button' className={permissionsTheme.inheritedAction} onClick={() => disableInherited(row)}>disable here</button>}
                                {row.hasOverride &&
                                    <button type='button' className={permissionsTheme.inheritedActionQuiet} onClick={() => undoInherited(row)}>
                                        {row.isDisabled ? 'undo' : 'reset'}
                                    </button>}
                            </div>
                            {!row.isDisabled && permEditor(row.kind, row.key, row.effective)}
                        </div>
                    ))}
                </details>
            }
        </div>
    )
}
