import React from "react";
import { isEqual, set, cloneDeep } from "lodash-es";

import { AuthContext } from "../../../../auth/context";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { permissionsEditorTheme } from './permissionsEditor.theme';

const DEFAULT_PERMISSIONS = { groups: { public: ['view-page'] }, users: {} };
const parseIfJSON = (text, fallback = {}) => { try { if (text && typeof text === 'object') return text; if (typeof text !== 'string' || !text) return fallback; return JSON.parse(text); } catch { return fallback; } };

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
    const { UI, theme } = React.useContext(ThemeContext);
    const t = { ...permissionsEditorTheme, ...(theme?.admin?.permissionsEditor || {}) }
    const { user, apiUpdate } = React.useContext(AdminContext) || {};
    const { FieldSet, Permissions } = UI;
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
        <div className={t.wrapper}>
            {Object.entries(tmpAuthPermissions).map(([subdomain, perms]) => (
                <div key={subdomain} className={t.subdomainSection}>
                    <div className={t.subdomainHeader}>
                        <span className={t.subdomainBadge}>
                            subdomain: {subdomain === '*' ? 'none' : subdomain}
                        </span>
                        {subdomain !== '*' && (
                            <button
                                className={t.subdomainRemoveBtn}
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

            <div className={t.addSubdomainRow}>
                <input
                    className={t.subdomainInput}
                    placeholder="subdomain name"
                    value={newSubdomain}
                    onChange={e => setNewSubdomain(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubdomain()}
                />
                <button
                    className={t.addSubdomainBtn}
                    onClick={addSubdomain}
                >
                    Add subdomain
                </button>
            </div>

            <FieldSet
                className={t.saveGrid}
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
