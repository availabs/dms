import React, { useContext } from "react";
import { DatasetsContext } from "../context";
import { AuthContext } from "../../auth/context";
import { ThemeContext } from "../../../ui/useTheme";
import { updateSourceData } from "../pages/dataTypes/default/utils";
import { getExternalEnv } from "../utils/datasources";
import { adminTheme } from "../pages/dataTypes/default/admin.theme";
import { source as sourceFormatDef } from "../datasets.format";

// Per-source Access editor for the CHAIN auth model.
//
// A copy of SourceAccessEditor.jsx, deliberately left as a separate file: the original is part of
// the `permissions_move` work and is still changing there, so the two models evolve without
// colliding. See planning/tasks/current/row-auth-vocabulary.md.
//
// Only one thing differs — where the vocabulary comes from.
//
//   old shape:  permissionDomain: [ {label, value}, … ]
//   new shape:  permissionDomain: { self:        [ {label, value, implies}, … ],
//                                   descendants: [ {label, value, implies}, … ] }
//
// `self` verbs govern the row itself; `descendants` verbs govern the rows beneath it (hub,
// "Grants have a scope"). A source's grants normally mean BOTH — its own metadata and the views
// and rows under it — which is exactly what the chain model calls a flat grant, and flat is the
// common case that carries no scope keys at all. So this editor offers the union of the two
// buckets and keeps writing a flat `{groups, users}` object, unchanged from today.
//
// Splitting a source's grants by scope (editors may change rows but not the source's own metadata,
// say) is a deliberate, rarer act, and wants its own control rather than being implied by this
// panel. Not built here.
//
// The old flat array is still accepted, so a pattern that has not declared `authVocabulary` yet
// renders exactly as before.
const flattenDomain = (domain) => {
    if (!domain) return domain;
    if (Array.isArray(domain)) return domain;              // the pre-chain shape
    const seen = new Set();
    return [...(domain.self || []), ...(domain.descendants || [])].filter((entry) => {
        const v = entry && entry.value;
        if (v == null || seen.has(v)) return false;        // a verb in both buckets is offered once
        seen.add(v);
        return true;
    });
};

export default function SourceAccessEditorChain ({ source, setSource, format, apiUpdate, isDms, id }) {
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
                permissionDomain={flattenDomain(authAttr?.permissionDomain)}
                // the attribute's `default` ({}) is the column's empty value, not a grant's starting perms
                defaultPermission={Array.isArray(authAttr?.default) ? authAttr.default : []}
                heading='on this source'
                inheritedFrom='the pattern'
                onChange={(data) => updateSourceData({ data, attrKey: 'auth_permissions', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id, pattern: datasetsPattern })}
            />
        </div>
    );
}
