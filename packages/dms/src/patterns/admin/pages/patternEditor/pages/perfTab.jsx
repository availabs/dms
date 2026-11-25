import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AdminContext } from '../../../context';
import { ThemeContext, getComponentTheme } from '../../../../../ui/useTheme';
import { getInstance } from '../../../../../utils/type-utils';
import { authedFetch } from '../../../../../utils/authedFetch';
import { perfTabTheme } from './perfTab.theme';

// Performance (pattern-perf-report-tab.md): run a performance test of this pattern's pages on the server, and read
// the reports of past runs. dms-server runs the `dms perf` engine as a background job (/_dms/perf routes; one run
// at a time per server) and keeps the newest runs of each pattern. It loads the pages from the address this admin
// is open on, as a signed-out visitor, one page at a time. Needs edit-pattern (the server judges it again).

// what the "Visits" choice runs (the engine's visit types: cold = a new visitor, warm = a returning one,
// click = an in-app click from page to page, journey = a session of clicks from the home page)
const VISIT_SETS = {
    'first, returning, click': ['cold', 'warm', 'click'],
    'returning, click': ['warm', 'click'],
    'all, with a journey': ['cold', 'warm', 'click', 'journey'],
};
const KIND_COLUMNS = [['cold', 'First load'], ['warm', 'Returning'], ['click', 'Navigate']];

const joinPath = (base, slug) => '/' + [base, slug].map(s => String(s || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
const fmtMs = (ms) => (ms == null ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '–');

export function PerfTab({ value = {}, apiLoad }) {
    const { API_HOST, user } = useContext(AdminContext) || {};
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const { Button, Input, Select, Pill } = UI;
    const t = { ...perfTabTheme, ...getComponentTheme(themeFromContext, 'admin.perfTab') };

    const app = value.app, patternId = value.id;
    const instance = useMemo(() => getInstance(value.type || ''), [value.type]);
    const query = `app=${encodeURIComponent(app || '')}&patternId=${encodeURIComponent(patternId || '')}`;

    const [list, setList] = useState(null);            // { running, busy, runs }
    const [unsupported, setUnsupported] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({ sample: '10', runs: '3', visits: 'first, returning, click', label: '' });
    const [job, setJob] = useState(null);              // the run going on this pattern
    const [starting, setStarting] = useState(false);
    const [ticked, setTicked] = useState([]);
    const [report, setReport] = useState(null);        // { key, title, html }

    const call = useCallback((path, options = {}) => authedFetch(`${API_HOST}/_dms/perf${path}`, { user, ...options }), [API_HOST, user?.token]);
    const jsonOf = async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `request failed (${res.status})`);
        return json;
    };

    const load = useCallback(async () => {
        if (!app || !patternId) return;
        try {
            const res = await call(`/runs?${query}`);
            // a server without the routes answers a bare 404
            if (res.status === 404) { const json = await res.json().catch(() => null); if (!json?.error) { setUnsupported(true); return; } }
            const json = await jsonOf(res);
            setList(json);
            if (json.running) setJob(json.running);
        } catch (e) { setError(e.message); }
    }, [call, query]);
    useEffect(() => { load(); }, [load]);

    // progress, while a run is going
    useEffect(() => {
        if (!job || job.state !== 'running') return;
        const timer = setInterval(async () => {
            try {
                const next = await jsonOf(await call(`/run/${job.id}`));
                setJob(next);
                if (next.state !== 'running') load();
            } catch (e) { setError(e.message); }
        }, 2000);
        return () => clearInterval(timer);
    }, [job?.id, job?.state, call, load]);

    const start = async () => {
        setError('');
        setStarting(true);
        try {
            // every page row of the pattern, with the path it is served at (as `dms perf` reads them); the server
            // picks the sample, always with the home page
            const items = await apiLoad({
                format: { app, type: `${instance}|page`, attributes: [] },
                children: [{ action: 'list', path: '/*' }],
            }, '/').catch(() => []);
            const pages = (items || []).filter(p => p?.id && p.id !== 'no-access').map(p => ({
                id: String(p.id), slug: p.url_slug || '', title: p.title || '', parent: p.parent ? String(p.parent) : null,
                index: +p.index || 0, published: (p.published ?? 'draft') !== 'draft', path: joinPath(value.base_url, p.url_slug),
            }));
            if (!pages.some(p => p.published)) throw new Error('This pattern has no published pages to measure.');
            const res = await call('/run', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app, patternId, pattern: { name: value.name, base_url: value.base_url || '/', preload_data: value.preload_data === true },
                    // the address this admin is open on: the site as its visitors load it
                    origin: window.location.origin,
                    pages, label: form.label.trim() || undefined, sample: form.sample === 'all' ? 'all' : +form.sample,
                    runs: +form.runs, visits: VISIT_SETS[form.visits],
                }),
            });
            setJob(await jsonOf(res));
        } catch (e) { setError(e.message); }
        finally { setStarting(false); }
    };

    const cancel = async () => {
        try { setJob(await jsonOf(await call(`/run/${job.id}`, { method: 'DELETE' }))); }
        catch (e) { setError(e.message); }
    };

    const openReport = async (key, title, path) => {
        if (report?.key === key) { setReport(null); return; }
        setError('');
        try {
            const res = await call(path);
            if (!res.ok) await jsonOf(res);
            setReport({ key, title, html: await res.text() });
        } catch (e) { setError(e.message); }
    };
    const compare = () => {
        const [a, b] = (list?.runs || []).filter(r => ticked.includes(r.id)).sort((x, y) => String(x.started).localeCompare(String(y.started)));
        openReport(`compare|${a.id}|${b.id}`, `${a.label} → ${b.label}`, `/compare?${query}&a=${a.id}&b=${b.id}`);
    };

    if (unsupported) return <div className={t.wrapper}><div className={t.notice}>This server can't run performance tests yet: it needs a newer dms-server.</div></div>;

    const running = job?.state === 'running';
    const pct = job?.total ? Math.min(100, Math.round((100 * (job.done || 0)) / job.total)) : 0;
    const scoreClass = (s) => (s == null ? t.score : s >= 90 ? t.scoreGood : s >= 50 ? t.scoreOk : t.scoreBad);

    return (
        <div className={t.wrapper}>
            <p className={t.intro}>
                Loads this pattern's published pages the way a signed-out visitor does, from this server, and reports how long
                they wait: a first visit, a returning one, and a click from page to page. The server's browser shares its CPU
                with the site, so compare runs with each other rather than with a run from a laptop.
            </p>

            <div className={t.card}>
                <div className={t.cardHeader}>
                    <span className={t.cardTitle}>Run</span>
                    <span className={t.cardNote}>one page at a time · one run at a time on this server</span>
                </div>
                <div className={t.cardBody}>
                    {running ? (
                        <>
                            <div className={t.progressRow}>
                                <div className={t.progressTrack}><div className={t.progressBar} style={{ width: `${pct}%` }} /></div>
                                <span className={t.progressText}>{job.done || 0} of {job.total} visits</span>
                                <Button activeStyle='smallDanger' onClick={cancel}>Cancel</Button>
                            </div>
                            <div className={t.progressLine}>{job.current || 'Starting…'}</div>
                        </>
                    ) : (
                        <>
                            <div className={t.fields}>
                                <label className={t.field}><span className={t.fieldLabel}>Pages</span>
                                    <Select value={form.sample} options={['10', '25', 'all']} onChange={(v) => v && setForm({ ...form, sample: v })} /></label>
                                <label className={t.field}><span className={t.fieldLabel}>Repetitions</span>
                                    <Select value={form.runs} options={['1', '3', '5']} onChange={(v) => v && setForm({ ...form, runs: v })} /></label>
                                <label className={t.field}><span className={t.fieldLabel}>Visits</span>
                                    <Select value={form.visits} options={Object.keys(VISIT_SETS)} onChange={(v) => v && setForm({ ...form, visits: v })} /></label>
                                <label className={t.field}><span className={t.fieldLabel}>Label</span>
                                    <Input value={form.label} placeholder='e.g. before the theme change' onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
                            </div>
                            <div className={t.actions}>
                                <Button activeStyle='primary' disabled={starting || list?.busy} onClick={start}>{starting ? 'Starting…' : 'Run'}</Button>
                                {list?.busy && <span className={t.cardNote}>Another pattern's run is going on this server.</span>}
                                {job && job.state !== 'running' && (
                                    <span className={t.cardNote}>Last run {job.state}{job.error ? `: ${job.error}` : ''}.</span>
                                )}
                            </div>
                        </>
                    )}
                    {error && <div className={t.error}>{error}</div>}
                </div>
            </div>

            <div className={t.card}>
                <div className={t.cardHeader}>
                    <span className={t.cardTitle}>Runs</span>
                    <span className={t.cardNote}>median time until everything has arrived · score: share of pages that meet the goal</span>
                    <span className={t.spacer} />
                    <Button activeStyle='small' disabled={ticked.length !== 2} onClick={compare}>Compare</Button>
                </div>
                <div className={t.table}>
                    <div className={t.headRow}>
                        <span />
                        <span>Run</span>
                        {KIND_COLUMNS.map(([, name]) => <span key={name}>{name}</span>)}
                        <span>Mode</span>
                        <span />
                    </div>
                    {!list ? <div className={t.empty}>Loading…</div>
                        : !list.runs.length ? <div className={t.empty}>No runs yet.</div>
                        : list.runs.map(r => {
                            const kind = (v) => r.kinds.find(k => k.visit === v);
                            const open = report?.key === r.id;
                            return (
                                <div key={r.id} className={open ? t.rowOpen : t.row}>
                                    <input type='checkbox' className={t.checkbox} checked={ticked.includes(r.id)}
                                        onChange={(e) => setTicked(e.target.checked ? [...ticked, r.id].slice(-2) : ticked.filter(x => x !== r.id))} />
                                    <div className={t.runCell}>
                                        <div className={t.runName}>{r.label}</div>
                                        <div className={t.runMeta}>{when(r.started)}{r.by ? ` · ${r.by}` : ''} · {r.pages} pages × {r.runs}</div>
                                    </div>
                                    {KIND_COLUMNS.map(([v]) => {
                                        const k = kind(v);
                                        return (
                                            <div key={v}>
                                                <div className={k ? t.num : t.numMuted}>{k ? fmtMs(k.complete) : '–'}</div>
                                                {k && <div className={scoreClass(k.goals.complete)}>score {k.goals.complete ?? '–'}</div>}
                                            </div>
                                        );
                                    })}
                                    <div className={t.pills}>
                                        {r.cancelled ? <Pill activeStyle='status_warn' text='cancelled' />
                                            : r.aborted ? <Pill activeStyle='status_bad' text='stopped' /> : null}
                                        {r.mode && <Pill activeStyle='marker' text={r.mode.ssr ? 'SSR' : 'SPA'} />}
                                        {r.mode?.sync && <Pill activeStyle='marker' text='sync' />}
                                        {r.mode?.preload && <Pill activeStyle='marker' text='preload' />}
                                    </div>
                                    <Button activeStyle='small' onClick={() => openReport(r.id, r.label, `/runs/${r.id}/report.html?${query}`)}>{open ? 'Close' : 'Report'}</Button>
                                </div>
                            );
                        })}
                </div>
            </div>

            {report && (
                <div className={t.reportCard}>
                    <div className={t.cardHeader}>
                        <span className={t.cardTitle}>{report.key.startsWith('compare|') ? 'Comparison' : 'Report'}: {report.title}</span>
                        <span className={t.spacer} />
                        <Button activeStyle='small' onClick={() => setReport(null)}>Close</Button>
                    </div>
                    {/* the report is a page of its own (its styles and its script), so it gets a frame and no access to this one */}
                    <iframe title='Performance report' className={t.reportFrame} sandbox='allow-scripts' srcDoc={report.html} />
                </div>
            )}
        </div>
    );
}
