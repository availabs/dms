import {useContext, useEffect, useMemo, useState} from 'react'
import {Link} from 'react-router'
import {DatasetsContext} from '../../../context'
import {ThemeContext, getComponentTheme} from '../../../../../ui/useTheme'
import {sourceOverviewTheme} from './sourceOverview.theme'
import {getExternalEnv} from '../../../utils/datasources'
import {isAuthoritative} from '../../../utils/authority'
import {AuthorityBadge} from '../../../components/AuthorityControl'
import {udaGetSourceLineage, udaGetViewsLineage, udaGetSourceAuthorities} from '../../../../../api'

// How many produced versions each output source lists before "and N more".
const VERSIONS_SHOWN = 5;

const viewLabel = (v) => v?.version || (v?.view_id != null ? `v${v.view_id}` : '');
const fmtDay = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}) : '';
};

/**
 * Outputs (dama-parent-child-etl-support.md G2): the sources a pipeline's runs write into, for a data
 * type that owns ordinary csv/gis child sources. Opt in with `defaultPages: ['outputs']`.
 *
 * Everything here is DERIVED from the parent's run views. Each produced version names the run view
 * that produced it (`metadata.produced_by`), so the page asks the server for this source's run views
 * and their outputs; it never reads a stored child list (a source holds no lineage).
 */
export default function OutputsPage({params, isDms}) {
    const {pageBaseUrl, falcor, datasources} = useContext(DatasetsContext) || {};
    const {theme: fullTheme} = useContext(ThemeContext) || {};
    const t = {...sourceOverviewTheme, ...getComponentTheme(fullTheme, 'datasets.sourceOverview')};
    const pgEnv = getExternalEnv(datasources);
    const id = +params?.id;
    const [state, setState] = useState({loading: true, available: true, runs: [], outputs: [], authority: {}});

    useEffect(() => {
        if (isDms || !pgEnv || !id) return;
        let cancelled = false;
        (async () => {
            const lineage = await udaGetSourceLineage(falcor, {env: pgEnv, source_id: id});
            const runs = (lineage?.views || []).filter(v => v.output_count > 0).sort((a, b) => b.view_id - a.view_id);
            const byRun = await udaGetViewsLineage(falcor, {env: pgEnv, view_ids: runs.map(r => r.view_id)});
            const outputs = runs.flatMap(r => (byRun[r.view_id]?.outputs || []).map(o => ({...o, run_view_id: r.view_id})));
            const authority = await udaGetSourceAuthorities(falcor, {env: pgEnv, source_ids: outputs.map(o => o.source_id)});
            if (!cancelled) setState({loading: false, available: !!lineage, runs, outputs, authority});
        })();
        return () => { cancelled = true; };
    }, [isDms, pgEnv, id, falcor]);

    // One row per output source, its produced versions newest first.
    const children = useMemo(() => {
        const bySource = new Map();
        for (const o of state.outputs) {
            const c = bySource.get(o.source_id) || {source_id: o.source_id, source_name: o.source_name, source_type: o.source_type, names: new Set(), views: []};
            if (o.output) c.names.add(o.output);
            c.views.push(o);
            bySource.set(o.source_id, c);
        }
        return [...bySource.values()]
            .map(c => ({...c, names: [...c.names], views: c.views.sort((a, b) => b.view_id - a.view_id)}))
            .sort((a, b) => String(a.source_name || '').localeCompare(String(b.source_name || '')));
    }, [state.outputs]);

    if (isDms) return <div className={t.grid}><div className={t.mainCol}><div className={t.verEmpty}>Outputs are recorded for external (DaMa) sources only.</div></div></div>;

    return (
        <div className={t.grid}>
            <div className={t.mainCol}>
                <div className={t.verCard}>
                    <div className={t.verHeader}>
                        <span className={t.verHeaderTitle}>Outputs</span>
                        <span className={t.verHeaderCount}>{children.length} {children.length === 1 ? 'source' : 'sources'}</span>
                    </div>
                    <div className={t.verList}>
                        {state.loading ? <div className={t.verEmpty}>Loading…</div>
                            : !state.available ? <div className={t.verEmpty}>This server does not report lineage yet.</div>
                            : !children.length ? <div className={t.verEmpty}>No run of this source has produced versions of other sources yet.</div>
                            : children.map(c => {
                                const authoritySource = {authority: state.authority[c.source_id] || null};
                                const newest = c.views[0]?.view_id;
                                return (
                                    <div key={c.source_id} className={t.verRow}>
                                        <div className={t.verNameRow}>
                                            <Link className={t.verName} to={`${pageBaseUrl}/${c.source_id}`}>{c.source_name || `source ${c.source_id}`}</Link>
                                            {!state.authority[c.source_id] ? <span className={t.verUndecidedChip}>undecided</span> : null}
                                        </div>
                                        <div className={t.verMeta}>
                                            {[c.source_type, c.names.join(' · '), `${c.views.length} ${c.views.length === 1 ? 'version' : 'versions'}`].filter(Boolean).join(' · ')}
                                        </div>
                                        <div className={t.linList}>
                                            {c.views.slice(0, VERSIONS_SHOWN).map(v => (
                                                <span key={v.view_id} className={t.linItem}>
                                                    <Link className={t.linLink} to={`${pageBaseUrl}/${v.source_id}/version/${v.view_id}`}>{viewLabel(v)}</Link>
                                                    <AuthorityBadge t={t} entry={isAuthoritative(authoritySource, v.view_id)}/>
                                                    {v.view_id === newest ? <span className={t.verCurrentBadge}>latest</span> : null}
                                                    <span className={t.linMeta}>
                                                        #{v.view_id}{v.end_date ? ` · through ${fmtDay(v.end_date)}` : ''} · run{' '}
                                                    </span>
                                                    <Link className={t.linLink} to={`${pageBaseUrl}/${id}/version/${v.run_view_id}`}>#{v.run_view_id}</Link>
                                                </span>
                                            ))}
                                            {c.views.length > VERSIONS_SHOWN ? (
                                                <Link className={t.linLink} to={`${pageBaseUrl}/${c.source_id}`}>and {c.views.length - VERSIONS_SHOWN} more</Link>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>
            <div className={t.sideCol}>
                <div className={t.verCard}>
                    <div className={t.verHeader}>
                        <span className={t.verHeaderTitle}>Runs</span>
                        <span className={t.verHeaderCount}>{state.runs.length}</span>
                    </div>
                    <div className={t.verList}>
                        {!state.loading && !state.runs.length ? <div className={t.verEmpty}>No runs with outputs</div> : null}
                        {state.runs.map(r => (
                            <div key={r.view_id} className={t.verRow}>
                                <div className={t.verNameRow}>
                                    <Link className={t.verName} to={`${pageBaseUrl}/${id}/version/${r.view_id}`}>{viewLabel(r)}</Link>
                                </div>
                                <div className={t.verMeta}>#{r.view_id} · {r.output_count} {r.output_count === 1 ? 'output' : 'outputs'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
