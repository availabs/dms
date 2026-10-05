import {useEffect, useState} from 'react'
import {Link} from 'react-router'
import {udaGetViewsLineage, udaDeleteView} from '../../../api'

// View lineage on the datasets pages (dama-parent-child-etl-support.md G1/G3/G5). Lineage lives on
// VIEWS: each version records what it was built from and which run produced it, and two versions of
// one source can be built from entirely different sources. These components only read and display
// it; the server derives it (dms-server dama/lineage.js).

const viewLabel = (v) => v?.version || (v?.view_id != null ? `v${v.view_id}` : '');

const ViewLink = ({t, pageBaseUrl, view}) => {
    if (view?.missing) return <span className={t.linMissing}>#{view.view_id} (deleted)</span>;
    return (
        <span className={t.linItem}>
            <Link className={t.linLink} to={`${pageBaseUrl}/${view.source_id}/version/${view.view_id}`}>
                {view.source_name || `source ${view.source_id}`}
            </Link>
            <span className={t.linMeta}>{viewLabel(view)} · #{view.view_id}</span>
        </span>
    );
};

/**
 * "Produced by" / "Built from" / "Produced" for one DaMa version. Renders nothing when the version
 * records no lineage (most uploads), or when the server predates lineage.
 */
export function VersionLineage({t, envKey, viewId, pageBaseUrl, falcor}) {
    const [lineage, setLineage] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setLineage(null);
        if (!viewId || !envKey) return;
        udaGetViewsLineage(falcor, {env: envKey, view_ids: [viewId]})
            .then(byId => { if (!cancelled) setLineage(byId[+viewId] || null); });
        return () => { cancelled = true; };
    }, [envKey, viewId, falcor]);

    if (!lineage) return null;
    const {inputs = [], produced_by, outputs = []} = lineage;
    if (!inputs.length && !produced_by && !outputs.length) return null;

    return (
        <div className={t.linCard}>
            {produced_by ? (
                <div className={t.linSection}>
                    <div className={t.linLabel}>Produced by</div>
                    <span className={t.linItem}>
                        {produced_by.missing
                            ? <span className={t.linMissing}>run view #{produced_by.view_id} (deleted)</span>
                            : <Link className={t.linLink} to={`${pageBaseUrl}/${produced_by.source_id}/version/${produced_by.view_id}`}>
                                run view #{produced_by.view_id} of {produced_by.source_name || `source ${produced_by.source_id}`}
                            </Link>}
                        {(produced_by.output || produced_by.stage) ? (
                            <span className={t.linMeta}>{[produced_by.stage, produced_by.output].filter(Boolean).join(' · ')}</span>
                        ) : null}
                    </span>
                </div>
            ) : null}
            {inputs.length ? (
                <div className={t.linSection}>
                    <div className={t.linLabel}>Built from</div>
                    <div className={t.linList}>
                        {inputs.map(v => <ViewLink key={v.view_id} t={t} pageBaseUrl={pageBaseUrl} view={v}/>)}
                    </div>
                </div>
            ) : null}
            {outputs.length ? (
                <div className={t.linSection}>
                    <div className={t.linLabel}>Produced {outputs.length} {outputs.length === 1 ? 'version' : 'versions'}</div>
                    <div className={t.linList}>
                        {outputs.map(v => (
                            <span key={v.view_id} className={t.linItem}>
                                <ViewLink t={t} pageBaseUrl={pageBaseUrl} view={v}/>
                                {v.output ? <span className={t.linMeta}>{v.output}</span> : null}
                            </span>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

/**
 * The Versions-list marker for a version built from different SOURCES than the previous version.
 * `entry` is that version's row from the source lineage roll-up; `names` maps source id → name.
 */
export function InputsChangedChip({t, entry, names = {}}) {
    if (!entry?.inputs_changed) return null;
    const label = (id) => names[id] || `source ${id}`;
    const title = [
        'Built from different sources than the previous version.',
        ...(entry.inputs_added || []).map(id => `+ ${label(id)}`),
        ...(entry.inputs_removed || []).map(id => `− ${label(id)}`),
    ].join('\n');
    return <span className={t.verInputsChangedChip} title={title}>inputs changed</span>;
}

/**
 * Delete one DaMa version and drop its table. The server refuses while another version was built
 * from it, while it is authoritative, or while it is a run whose outputs would be orphaned; the
 * refusal is shown as written, and an orphaning refusal offers the cascade.
 */
export function DeleteVersionButton({t, envKey, viewId, label, canDelete, falcor, onDeleted}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [refusal, setRefusal] = useState(null);
    if (!canDelete || !viewId) return null;

    const close = () => { setOpen(false); setRefusal(null); setBusy(false); };
    const run = async (cascade) => {
        setBusy(true); setRefusal(null);
        try {
            const result = await udaDeleteView(falcor, {env: envKey, view_id: viewId, cascade});
            if (!result || result.error) {
                setRefusal(result || {error: 'The server did not answer the delete.'});
                setBusy(false);
                return;
            }
            close();
            onDeleted?.(result);
        } catch (e) {
            setRefusal({error: e?.message || String(e)});
            setBusy(false);
        }
    };

    if (!open) return <button type="button" className={t.verDeleteBtn} onClick={() => setOpen(true)}>Delete version</button>;
    return (
        <div className={t.verDeleteDialog}>
            <div className={t.verDeleteTitle}>Delete {label || `version #${viewId}`}?</div>
            <div className={t.verDeleteText}>
                This removes the version and drops its data table. It cannot be undone. To retire a version
                without deleting it, mark another version authoritative instead.
            </div>
            {refusal ? <div className={t.verDeleteRefusal}>{refusal.error}</div> : null}
            <div className={t.verDeleteButtons}>
                <button type="button" className={t.verDeleteCancel} disabled={busy} onClick={close}>Cancel</button>
                {refusal?.reason === 'has_outputs' ? (
                    <button type="button" className={t.verDeleteConfirm} disabled={busy} onClick={() => run(true)}>
                        {busy ? 'Deleting…' : `Delete it and the ${refusal.details?.outputs?.length || ''} versions it produced`}
                    </button>
                ) : (
                    <button type="button" className={t.verDeleteConfirm} disabled={busy || !!refusal} onClick={() => run(false)}>
                        {busy ? 'Deleting…' : 'Delete version'}
                    </button>
                )}
            </div>
        </div>
    );
}
