import React from "react";
import { isEqual, set, cloneDeep } from "lodash-es";

import { AuthContext } from "../../../../auth/context";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { permissionsEditorTheme } from './permissionsEditor.theme';
import { parseIfJSON } from '../../../utils';
import { hasAuthGrants } from '../../../../../utils/auth.js';
import { permissionOptionsFor, siteCan, isAppAdmin } from '../../../../../utils/adminPermissions';

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
    const { user, apiUpdate, app, adminRowHasGrants } = React.useContext(AdminContext) || {};
    const { Permissions } = UI;

    const inputValue = cloneDeep(parseIfJSON(value));
    // Options for this pattern's type. Saved values outside the list stay
    // (MultiSelect keeps unknown values), so nothing stored is dropped.
    const permissionDomain = permissionOptionsFor(inputValue?.pattern_type, { adminRowHasGrants });
    const normalised = normaliseAuthPermissions(inputValue?.authPermissions);

    const [tmpAuthPermissions, setTmpAuthPermissions] = React.useState(normalised);
    const [newSubdomain, setNewSubdomain] = React.useState('');
    // UI.Permissions keeps its own copy of `value` and never re-reads the prop,
    // so "reset" cleared the pending save but left the edited grants on screen;
    // the next edit then re-applied them (found 2026-09-30). Bumping this key on
    // reset remounts it from the restored value.
    const [resetKey, setResetKey] = React.useState(0);

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

    // The site's admin pattern row: until it grants something itself, site
    // access comes from the auth pattern (render/spa/utils/index.js
    // pattern2routes / hasAuthGrants). Once it does, a save that doesn't
    // leave the saving user with `*` would lock them out of the admin panel —
    // blocked, unless they're in the `${app} Admin` group (always let in).
    const isAdminPattern = inputValue?.pattern_type === 'admin';
    const adminGrantsSaved = isAdminPattern && hasAuthGrants(normalised);
    const adminGrantsPending = isAdminPattern && hasAuthGrants(tmpAuthPermissions);
    const wouldLockOut = adminGrantsPending && !isAppAdmin(user, app)
        && !siteCan(user, app, tmpAuthPermissions['*'], '*');
    // Domain vocabulary summary (mockup: "domain: * · view-page · create · update") —
    // same list every subdomain group's permission MultiSelect offers.

    return (
        <div className={t.outerWrapper}>
            <div className={t.header}>
                <span className={t.headerTitle}>Permissions</span>
                {isAdminPattern && (
                    <span className={t.headerHint}>
                        {adminGrantsSaved
                            ? 'admin panel access'
                            : 'admin access comes from the auth pattern until a user or group is granted here'}
                    </span>
                )}
            </div>

            <div className={t.wrapper}>
            {Object.entries(tmpAuthPermissions).map(([subdomain, perms]) => (
                <div key={`${subdomain}-${resetKey}`} className={t.subdomainSection}>
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
                {wouldLockOut && (
                    <span className={t.lockoutWarning}>saving this would remove your own access to the admin panel — grant yourself or one of your groups *</span>
                )}
                <span className='flex-1' />
                <button
                    type={'button'}
                    className={t.btnReset}
                    disabled={!isDirty}
                    onClick={() => { setTmpAuthPermissions(normalised); setResetKey(k => k + 1); }}
                >
                    reset
                </button>
                <button
                    type={'button'}
                    className={t.btnSave}
                    disabled={!isDirty || wouldLockOut}
                    onClick={() => apiUpdate({ data: { id: value.id, authPermissions: tmpAuthPermissions } })}
                >
                    save changes
                </button>
            </div>
            </div>
        </div>
    );
};
