import React, { useContext } from "react";
import { DatasetsContext } from "../context";
import { AuthContext } from "../../auth/context";
import { ThemeContext } from "../../../ui/useTheme";
import { updateSourceData } from "../pages/dataTypes/default/utils";
import { getExternalEnv } from "../utils/datasources";
import { adminTheme } from "../pages/dataTypes/default/admin.theme";
import { source as sourceFormatDef } from "../datasets.format";

// Per-source Access editor — the new string-permission model (replaces the legacy numeric
// statistics.auth UAC panels). Writes `source.authPermissions` ({groups,users} → [perm…]);
// effective perms are pattern ⊕ source (merged by DatasetsContext.isUserAuthed). Editing access
// is itself gated by `edit-source-permissions`. Vocabulary comes from the source format's
// `authPermissions` attribute (permissionDomain) — see datasets.format.js.
export default function SourceAccessEditor ({ source, setSource, format, apiUpdate, isDms, id }) {
    const { UI, user, authPermissions: patternAuthPermissions, isUserAuthed, falcor, datasources, datasetsPattern } = useContext(DatasetsContext) || {};
    const { AuthAPI } = useContext(AuthContext) || {};
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const { Permissions } = UI;
    const pgEnv = getExternalEnv(datasources);

    if (!isUserAuthed || !isUserAuthed(['edit-source-permissions'])) return null;

    // SourcePage's `format` can be the pattern format (its registerFormats lookup misses: the source
    // format registers as `<instance>|source`, the lookup asks for `<instance>|form-manager|source`),
    // so fall back to the source format's own vocabulary rather than UI.Permissions' generic one.
    const authAttr = [...(format?.attributes || []), ...sourceFormatDef.attributes].find(a => a.key === 'auth_permissions');

    return (
        <div className={t.uacPanel}>
            <div className={t.uacPanelLabel}>Access</div>
            <Permissions
                value={source?.auth_permissions}
                inheritedValue={patternAuthPermissions}
                user={user}
                getUsers={AuthAPI?.getUsers}
                getGroups={AuthAPI?.getGroups}
                permissionDomain={authAttr?.permissionDomain}
                // the attribute's `default` ({}) is the column's empty value, not a grant's starting perms
                defaultPermission={Array.isArray(authAttr?.default) ? authAttr.default : []}
                heading='on this source'
                inheritedFrom='the pattern'
                onChange={(data) => updateSourceData({ data, attrKey: 'auth_permissions', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id, pattern: datasetsPattern })}
            />
        </div>
    );
}
