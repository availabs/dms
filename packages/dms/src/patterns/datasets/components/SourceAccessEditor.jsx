import React, { useContext } from "react";
import { DatasetsContext } from "../context";
import { AuthContext } from "../../auth/context";
import { ThemeContext } from "../../../ui/useTheme";
import { updateSourceData } from "../pages/dataTypes/default/utils";
import { getExternalEnv } from "../utils/datasources";
import { adminTheme } from "../pages/dataTypes/default/admin.theme";

// Per-source Access editor — the new string-permission model (replaces the legacy numeric
// statistics.auth UAC panels). Writes `source.authPermissions` ({groups,users} → [perm…]);
// effective perms are pattern ⊕ source (merged by DatasetsContext.isUserAuthed). Editing access
// is itself gated by `edit-source-permissions`. Vocabulary comes from the source format's
// `authPermissions` attribute (permissionDomain) — see datasets.format.js.
export default function SourceAccessEditor ({ source, setSource, format, apiUpdate, isDms, id }) {
    const { UI, user, authPermissions: patternAuthPermissions, isUserAuthed, falcor, datasources } = useContext(DatasetsContext) || {};
    const { AuthAPI } = useContext(AuthContext) || {};
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const { Permissions } = UI;
    const pgEnv = getExternalEnv(datasources);

    if (!isUserAuthed || !isUserAuthed(['edit-source-permissions'])) return null;

    const authAttr = (format?.attributes || []).find(a => a.key === 'auth_permissions');

    return (
        <div className={t.uacPanel}>
            <label className={t.uacPanelLabel}>Access</label>
            <Permissions
                value={source?.auth_permissions}
                inheritedValue={patternAuthPermissions}
                user={user}
                getUsers={AuthAPI?.getUsers}
                getGroups={AuthAPI?.getGroups}
                permissionDomain={authAttr?.permissionDomain}
                defaultPermission={authAttr?.default}
                onChange={(data) => updateSourceData({ data, attrKey: 'auth_permissions', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id })}
            />
        </div>
    );
}
