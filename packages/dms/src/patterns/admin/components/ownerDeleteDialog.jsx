import React from "react";
import { useRevalidator } from "react-router";
import { useFalcor } from "@availabs/avl-falcor";
import { ThemeContext } from "../../../ui/useTheme";
import { AdminContext } from "../context";
import { dmsOwnerDeletePlan, dmsOwnerDelete } from "../../../api";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What a pattern delete takes, from the server's read-only plan (dms-server routes/dms/ownerDeleteHttp.js).
function patternPlanView(plan) {
    const items = [{ id: 'pattern', label: `Pattern "${plan.pattern.name}"` }];
    for (const [kind, n] of Object.entries(plan.rows.byKind || {}).sort((a, b) => b[1] - a[1])) {
        items.push({ id: `kind-${kind}`, label: `— ${kind} rows`, detail: plural(n, 'row') });
    }
    const env = plan.dmsEnv;
    const notes = [];
    if (env && env.action === 'delete') {
        items.push({ id: 'env', label: `Data environment "${env.name}"`,
            detail: [plural(env.sources.length, 'source'), plural(env.views, 'view'), plural(env.tables, 'data table'), env.files ? plural(env.files, 'file') : '']
                .filter(Boolean).join(', ') });
        for (const s of env.sources) items.push({ id: `src-${s.id}`, label: `— source "${s.name}"` });
    } else if (env && env.reason === 'shared') {
        notes.push(`Kept: data environment "${env.name}", still used by ${env.sharedWith.map(p => `"${p.name}"`).join(', ')}.`);
    } else if (env && env.reason === 'pgEnv') {
        notes.push(`Kept: data environment "${env.name}" and its database (${env.pgEnv}). Data in a database is never deleted here.`);
    }
    for (const b of plan.blocked || []) {
        items.push({ id: `blocked-${b.reason}`, label: b.patterns.map(p => `"${p.name}"`).join(', '), blocked: true, reason: 'same name' });
    }
    const blockedNote = plan.blocked?.length ? `Can't delete: ${plan.blocked[0].reason}. Nothing will be deleted.` : undefined;
    const total = 1 + plan.rows.total + (env && env.action === 'delete' ? 1 + env.sources.length + env.views : 0);
    return {
        items, notes, blockedNote,
        prompt: `This deletes the pattern and everything it owns (${plural(total, 'row')}). A backup is written on the server first. This cannot be undone.`,
    };
}

function themePlanView(plan) {
    const items = [{ id: 'theme', label: `Theme "${plan.theme.name}"` }];
    for (const p of plan.usedBy || []) items.push({ id: `p-${p.id}`, label: `Pattern "${p.name}"`, blocked: true, reason: 'uses this theme' });
    return {
        items,
        notes: [],
        blockedNote: plan.usedBy?.length
            ? `Can't delete: ${plan.usedBy.map(p => `"${p.name}"`).join(', ')} still ${plan.usedBy.length === 1 ? 'uses' : 'use'} this theme. Choose another theme for ${plan.usedBy.length === 1 ? 'it' : 'them'} first.`
            : undefined,
        prompt: 'The theme is deleted and removed from the site. A backup is written on the server first. This cannot be undone.',
    };
}

// Delete a pattern (`kind` 'patterns') or a theme ('themes') for real: the dialog lists the server's plan, and
// Delete applies it (safe-delete-removes-rows.md F4 / F5). `row` needs `id` and a `name`. `onDeleted(row)` runs
// after the server deleted it; the site is reloaded here.
export function OwnerDeleteDialog({ kind, row, onClose, onDeleted }) {
    const { API_HOST, user, app } = React.useContext(AdminContext) || {};
    const { UI } = React.useContext(ThemeContext) || {};
    const { falcor } = useFalcor();
    const { revalidate } = useRevalidator();
    const [plan, setPlan] = React.useState(null);
    const [error, setError] = React.useState('');
    const id = row?.id;

    React.useEffect(() => {
        setPlan(null); setError('');
        if (!id) return;
        let live = true;
        dmsOwnerDeletePlan({ API_HOST, user, app, kind, id })
            .then(p => { if (live) setPlan(p); })
            .catch(e => { if (live) setError(e.message); });
        return () => { live = false; };
    }, [API_HOST, app, kind, id, user?.token]);

    if (!row) return null;
    const view = plan ? (kind === 'patterns' ? patternPlanView(plan) : themePlanView(plan)) : null;
    const name = row.name || row.title || `#${id}`;

    const remove = async () => {
        const deleted = kind === 'patterns' ? plan.pattern : plan.theme;
        const rows = [deleted, ...(plan.sites || []), ...(plan.dmsEnv?.sites || [])].map(r => ({ id: r.id, type: r.type }));
        await dmsOwnerDelete(falcor, { API_HOST, user, app, kind, id, expect: plan.expect || {}, rows });
        onDeleted?.(row);
        onClose();
        revalidate();
    };

    return (
        <UI.DeleteModal
            open={true}
            setOpen={() => onClose()}
            title={`Delete ${kind === 'patterns' ? 'pattern' : 'theme'} ${name}`}
            prompt={view ? view.prompt : (error ? null : 'Checking what this deletes…')}
            items={view?.items}
            itemsTitle="What will be deleted"
            blockedNote={view?.blockedNote}
            notes={view?.notes}
            error={error}
            disabled={!plan}
            onDelete={remove}
        />
    );
}
