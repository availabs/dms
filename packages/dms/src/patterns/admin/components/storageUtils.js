import React from "react";
import { dmsStoragePlan } from "../../../api";

// Shared by the Storage pages (pages/siteStorage.jsx, patternEditor/pages/storageTab.jsx).
// The server's plan: dms-server routes/dms/storageHttp.js (orphan-sweeper.md, Phase 2).

export const fmtBytes = (b = 0) => b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${Math.round(b / 1e3)} kB` : `${b} B`;
export const fmtNum = (n = 0) => Number(n || 0).toLocaleString('en-US');
export const sum = (list, key) => list.reduce((s, x) => s + (Number(x[key]) || 0), 0);

// The page pattern's row kinds read as the names authors know; any other kind reads as itself.
const KIND_LABELS = { component: ['section', 'sections'], page: ['page', 'pages'], 'page-edit': ['history entry', 'history'], pattern: ['pattern', 'patterns'] };
export function kindLabel(kind, n = 2) {
    const l = KIND_LABELS[kind] || [`${kind} row`, `${kind} rows`];
    return n === 1 ? l[0] : l[1];
}
export const capitalize = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);

/** The child kinds the formats declare (`childRefs`: page.sections → component, page.history → page-edit). */
export function childKindsOf(childRefs = {}) {
    const out = new Set();
    for (const attrs of Object.values(childRefs || {})) for (const k of Object.values(attrs || {})) out.add(k);
    return [...out];
}
export const ownerKindsOf = (childRefs = {}) => Object.keys(childRefs || {});

/**
 * `expect` for a clean up of these plan groups: their rows per category, 0 for a category asked for
 * that has none. The server re-plans with the same scope and refuses when its counts differ.
 */
export function expectFor(app, groups, only) {
    const counts = Object.fromEntries((only || []).map(c => [c, 0]));
    for (const g of groups) counts[g.category] = (counts[g.category] || 0) + g.rows;
    return { [app]: counts };
}

/** Load the plan for `parents` (none = the whole site), once `enabled` (the user may see it). `reload()` checks again. */
export function useStoragePlan({ API_HOST, user, app, parents = [], enabled = true }) {
    const [state, setState] = React.useState({ plan: null, error: '', loading: true, checkedAt: null });
    const [tick, setTick] = React.useState(0);
    const key = parents.join('\n');
    React.useEffect(() => {
        if (!enabled || !app || !user?.authed || user?.isAuthenticating) return;
        let live = true;
        setState(s => ({ ...s, loading: true, error: '' }));
        dmsStoragePlan({ API_HOST, user, app, parents })
            .then(plan => { if (live) setState({ plan, error: '', loading: false, checkedAt: new Date() }); })
            .catch(e => { if (live) setState(s => ({ ...s, error: e.message, loading: false })); });
        return () => { live = false; };
    }, [API_HOST, app, key, tick, enabled, user?.token, user?.authed, user?.isAuthenticating]);
    return { ...state, reload: () => setTick(t => t + 1) };
}
