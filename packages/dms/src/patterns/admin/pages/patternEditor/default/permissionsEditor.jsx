import React from "react";
import { isEqual, set, cloneDeep } from "lodash-es";

import { AuthContext } from "../../../../auth/context";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { permissionsEditorTheme } from './permissionsEditor.theme';
import { parseIfJSON } from '../../../utils';

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
    const { UI, theme } = React.useContext(ThemeContext);
    const t = { ...permissionsEditorTheme, ...(theme?.admin?.permissionsEditor || {}) }
    const { user, apiUpdate } = React.useContext(AdminContext) || {};
    const { Permissions } = UI;
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

    const isDirty = !isEqual(tmpAuthPermissions, normalised);
    // Domain vocabulary summary (mockup: "domain: * · view-page · create · update") —
    // same list every subdomain group's permission MultiSelect offers.

    return (
        <div className={t.outerWrapper}>
            <div className={t.header}>
                <span className={t.headerTitle}>Permissions</span>
            </div>

            <div className={t.wrapper}>
            {Object.entries(tmpAuthPermissions).map(([subdomain, perms]) => (
                <div key={subdomain} className={t.subdomainSection}>
                    <div className={t.subdomainHeader}>
                        <span className={t.subdomainBadge}>
                            subdomain: {subdomain === '*' ? 'none' : subdomain}
                        </span>
                        {subdomain !== '*' && (
                            <button
                                type={'button'}
                                className={t.subdomainRemoveBtn}
                                onClick={() => removeSubdomain(subdomain)}
                            >
                                remove subdomain
                            </button>
                        )}
                    </div>
                    <div className={t.subdomainBody}>
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
                    type={'button'}
                    className={t.addSubdomainBtn}
                    onClick={addSubdomain}
                >
                    + add subdomain
                </button>
            </div>

            <div className={t.saveGrid}>
                <span className='flex-1' />
                <button
                    type={'button'}
                    className={t.btnReset}
                    disabled={!isDirty}
                    onClick={() => setTmpAuthPermissions(normalised)}
                >
                    reset
                </button>
                <button
                    type={'button'}
                    className={t.btnSave}
                    disabled={!isDirty}
                    onClick={() => apiUpdate({ data: { id: value.id, authPermissions: tmpAuthPermissions } })}
                >
                    save changes
                </button>
            </div>
            </div>
        </div>
    );
};
