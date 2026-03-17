import React from "react";
import { isEqual, set, cloneDeep } from "lodash-es";

import { AuthContext } from "../../../../auth/context";
import { AdminContext } from "../../../context";
import { parseIfJSON } from "../../../../page/pages/_utils";
import { ThemeContext } from "../../../../../ui/useTheme";

const DEFAULT_PERMISSIONS = { groups: { public: ['view-page'] }, users: {} };

// Normalise raw authPermissions (flat {groups,users} or subdomain-keyed object) → subdomain-keyed object
function normaliseAuthPermissions(raw) {
    const parsed = parseIfJSON(raw, {});
    // New format: has a "*" key
    if (parsed['*'] !== undefined) return parsed;
    // Old format: has groups/users keys, or is empty
    const base = cloneDeep(parsed);
    if (!base?.groups?.public) {
        set(base, 'groups.public', ['view-page']);
    }
    return { '*': base };
}

export const PatternPermissionsEditor = ({
    value = "{}",
    onChange,
    attributes,
    defaultPermission = []
}) => {
    const { AuthAPI } = React.useContext(AuthContext) || {};
    const { UI } = React.useContext(ThemeContext);
    const { user, apiUpdate } = React.useContext(AdminContext) || {};
    const { Permissions, FieldSet } = UI;
    const permissionDomain = attributes?.authPermissions?.permissionDomain;

    const inputValue = cloneDeep(parseIfJSON(value));
    const normalised = normaliseAuthPermissions(inputValue?.authPermissions);

    const [tmpAuthPermissions, setTmpAuthPermissions] = React.useState(normalised);
    const [newSubdomain, setNewSubdomain] = React.useState('');

    const updateSubdomainPermissions = (subdomain, perms) => {
        setTmpAuthPermissions(prev => ({ ...prev, [subdomain]: perms }));
    };

    const removeSubdomain = (subdomain) => {
        setTmpAuthPermissions(prev => {
            const next = { ...prev };
            delete next[subdomain];
            return next;
        });
    };

    const addSubdomain = () => {
        const key = newSubdomain.trim();
        if (!key || tmpAuthPermissions[key] !== undefined) return;
        setTmpAuthPermissions(prev => ({ ...prev, [key]: cloneDeep(DEFAULT_PERMISSIONS) }));
        setNewSubdomain('');
    };

    return (
        <div className="max-w-5xl flex flex-col gap-2">
            {Object.entries(tmpAuthPermissions).map(([subdomain, perms]) => (
                <div key={subdomain} className="flex flex-col gap-1 border rounded p-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded">
                            subdomain: {subdomain === '*' ? 'none' : subdomain}
                        </span>
                        {subdomain !== '*' && (
                            <button
                                className="text-xs text-red-500 hover:text-red-700"
                                onClick={() => removeSubdomain(subdomain)}
                            >
                                remove subdomain
                            </button>
                        )}
                    </div>
                    <Permissions
                        value={perms || {}}
                        user={user}
                        getUsers={AuthAPI?.getUsers}
                        getGroups={AuthAPI?.getGroups}
                        onChange={(v) => updateSubdomainPermissions(subdomain, v)}
                        permissionDomain={permissionDomain}
                        defaultPermission={defaultPermission}
                    />
                </div>
            ))}

            <div className="flex gap-2 items-center mt-1">
                <input
                    className="border rounded px-2 py-1 text-sm"
                    placeholder="subdomain name"
                    value={newSubdomain}
                    onChange={e => setNewSubdomain(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubdomain()}
                />
                <button
                    className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
                    onClick={addSubdomain}
                >
                    Add subdomain
                </button>
            </div>

            <FieldSet
                className={'grid grid-cols-12 gap-1 border rounded p-4'}
                components={[
                    {
                        type: 'Spacer',
                        customTheme: { field: 'bg-white col-span-10 ' }
                    },
                    {
                        type: 'Button',
                        children: <span>Reset</span>,
                        buttonType: 'plain',
                        disabled: isEqual(tmpAuthPermissions, normalised),
                        onClick: () => setTmpAuthPermissions(normalised),
                        customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    },
                    {
                        type: 'Button',
                        children: <span>Save</span>,
                        disabled: isEqual(tmpAuthPermissions, normalised),
                        onClick: () => apiUpdate({ data: { id: value.id, authPermissions: tmpAuthPermissions } }),
                        customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    }
                ]}
            />
        </div>
    );
};
