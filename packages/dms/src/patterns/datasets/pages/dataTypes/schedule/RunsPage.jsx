import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { get } from "lodash-es";

import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";
import {
    cronToHuman,
    timeAgo,
    formatTimestamp,
    formatDuration,
} from "./scheduleUtils";

const TASK_ATTRS = [
    'task_id', 'status', 'worker_path', 'progress', 'queued_at', 'started_at',
    'completed_at', 'error', 'schedule_id', 'attempt', 'max_attempts',
];

const PAGE_SIZE = 20;
const MAX_TASKS = 200;
const POLL_MS = 4000;

const buttonBlueClass = 'px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-600 text-sm rounded-md cursor-pointer disabled:opacity-40';

const STATUS_COLORS = {
    done: 'bg-green-100 text-green-800',
    error: 'bg-red-100 text-red-800',
    running: 'bg-blue-100 text-blue-800',
    queued: 'bg-gray-100 text-gray-600',
    SKIPPED_BUSY: 'bg-amber-100 text-amber-800',
    BLOCKED: 'bg-orange-100 text-orange-800',
    ERROR: 'bg-red-100 text-red-800',
};

const StatusChip = ({ status }) => (
    <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_COLORS[status] || 'bg-gray-100 text-gray-600'}`}>
        {String(status || '').replace('_', ' ').toLowerCase()}
    </span>
);

function parseMaybeJson(value, fallback = null) {
    if (value == null) return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return fallback; }
    }
    return value;
}

/** schedule_id → short display label ("NPMRDS raw download · monthly on the 1st…"). */
function scheduleLabel(scheduleId, schedulesById, schedulables) {
    const sched = schedulesById[scheduleId];
    if (!sched) return `schedule #${scheduleId}`;
    const spec = (schedulables || []).find(s => s.worker_path === sched.worker_path);
    return `${spec?.label || sched.worker_path} (${cronToHuman(sched.cron)})`;
}

/** One-line summary for the listing: error first, then a compact result digest. */
function resultSummary(task) {
    if (task.error) return String(task.error);
    const result = parseMaybeJson(task.result);
    if (!result || typeof result !== 'object') return result ? String(result) : '';
    if (result.message) return String(result.message);
    const bits = Object.entries(result)
        .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
        .slice(0, 4)
        .map(([k, v]) => `${k}: ${v}`);
    return bits.join(', ');
}

/** Numeric `view_id`-ish entries found in a descriptor/result — for "open view" links. */
function findViewIds(...objects) {
    const found = {};
    for (const obj of objects) {
        const o = parseMaybeJson(obj);
        if (!o || typeof o !== 'object') continue;
        for (const [key, value] of Object.entries(o)) {
            if (/(^|_)view_id$/i.test(key) && Number.isFinite(+value) && +value > 0) {
                found[key] = +value;
            }
        }
    }
    return Object.entries(found); // [[key, viewId], ...]
}

const WINDOW_KEY_RE = /^(start|end)_?(date|time|epoch)$/i;

/** Pretty descriptor block; window fields get called out above the raw JSON. */
const DescriptorBlock = ({ descriptor }) => {
    const d = parseMaybeJson(descriptor, {});
    if (!d || typeof d !== 'object') return null;
    const windowEntries = Object.entries(d).filter(([k]) => WINDOW_KEY_RE.test(k));
    return (
        <div className={'flex flex-col gap-1'}>
            {windowEntries.length ? (
                <div className={'flex gap-2 flex-wrap'}>
                    {windowEntries.map(([k, v]) => (
                        <span key={k} className={'px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium'}>
                            {k}: {String(v)}
                        </span>
                    ))}
                </div>
            ) : null}
            <pre className={'text-xs bg-gray-50 rounded p-2 overflow-auto max-h-72 scrollbar-sm'}>
                {JSON.stringify(d, null, 2)}
            </pre>
        </div>
    );
};

const EVENT_ATTRS = ['event_id', 'type', 'message', 'payload', 'created_at'];
const MAX_EVENTS = 500;

/**
 * Run detail: live task_events timeline polled every 4s while the task is
 * queued/running (falcor `uda` task/events reads, invalidated per tick —
 * the legacy REST /events/query shim drops the `message` column, so the
 * uda path keeps the timeline readable), the descriptor that ran, error
 * text, view links, re-run button.
 */
const RunDetail = ({ taskId, source, params }) => {
    const navigate = useNavigate();
    const { user, datasources, API_HOST, falcor, pageBaseUrl } = useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const rtPfx = `${API_HOST || ''}/dama-admin/${pgEnv}`;
    const runsBaseUrl = `${pageBaseUrl}/${params.id}/runs`;

    const [task, setTask] = useState(null);
    const [events, setEvents] = useState([]);
    const [schedule, setSchedule] = useState(null);
    const [rerunError, setRerunError] = useState(null);
    const [rerunning, setRerunning] = useState(false);

    const detailAttrs = useMemo(() => [...TASK_ATTRS, 'descriptor', 'result', 'source_id'], []);

    const loadTask = useCallback(async () => {
        if (!falcor || !pgEnv || !taskId) return null;
        await falcor.invalidate(['uda', pgEnv, 'tasks', 'byId', +taskId]);
        const res = await falcor.get(['uda', pgEnv, 'tasks', 'byId', +taskId, detailAttrs]);
        const row = get(res, ['json', 'uda', pgEnv, 'tasks', 'byId', +taskId], null);
        if (row && row.task_id != null) {
            setTask(row);
            return row;
        }
        return null;
    }, [falcor, pgEnv, taskId, detailAttrs]);

    const loadEvents = useCallback(async () => {
        if (!falcor || !pgEnv || !taskId) return;
        try {
            await falcor.invalidate(['uda', pgEnv, 'tasks', 'byId', +taskId, 'events']);
            const lenPath = ['uda', pgEnv, 'tasks', 'byId', +taskId, 'events', 'length'];
            const lenRes = await falcor.get(lenPath);
            const length = Math.min(+get(lenRes, ['json', ...lenPath], 0), MAX_EVENTS);
            if (!length) return;
            const res = await falcor.get(
                ['uda', pgEnv, 'tasks', 'byId', +taskId, 'events', 'byIndex', { from: 0, to: length - 1 }, EVENT_ATTRS]);
            const indexed = get(res, ['json', 'uda', pgEnv, 'tasks', 'byId', +taskId, 'events', 'byIndex'], {});
            const out = [];
            for (let i = 0; i < length; i++) {
                if (indexed[i] && indexed[i].event_id != null) out.push(indexed[i]);
            }
            setEvents(out);
        } catch { /* keep last events on transient poll failure */ }
    }, [falcor, pgEnv, taskId]);

    // Initial load + 4s poll while the task is queued/running.
    useEffect(() => {
        let cancelled = false;
        let timer = null;
        const tick = async () => {
            const row = await loadTask();
            await loadEvents();
            if (cancelled) return;
            const status = row?.status;
            if (status === 'queued' || status === 'running' || !row) {
                timer = setTimeout(tick, POLL_MS);
            }
        };
        tick();
        return () => { cancelled = true; if (timer) clearTimeout(timer); };
    }, [loadTask, loadEvents]);

    // The schedule that fired this run (for the "fired by" label).
    useEffect(() => {
        if (!task?.schedule_id || !pgEnv) return;
        fetch(`${rtPfx}/schedules?source_id=${task.source_id ?? source?.source_id}`)
            .then(r => r.json())
            .then(rows => {
                if (Array.isArray(rows)) {
                    setSchedule(rows.find(s => +s.schedule_id === +task.schedule_id) || null);
                }
            })
            .catch(() => {});
    }, [rtPfx, pgEnv, task?.schedule_id]);

    const rerun = async () => {
        setRerunning(true);
        setRerunError(null);
        try {
            const res = await fetch(`${rtPfx}/tasks/${taskId}/rerun`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: user?.token },
                body: '{}',
            });
            const json = await res.json();
            if (json?.queued === true) {
                navigate(`${runsBaseUrl}/${json.task_id}`);
            } else {
                setRerunError(json?.error || 'Re-run failed');
            }
        } catch (e) {
            setRerunError(e.message);
        }
        setRerunning(false);
    };

    const isLive = !task || task.status === 'queued' || task.status === 'running';
    const descriptor = parseMaybeJson(task?.descriptor, {});
    const viewLinks = findViewIds(task?.result, task?.descriptor);

    return (
        <div className={'w-full p-2 flex flex-col gap-3'}>
            <div className={'flex items-center gap-2 text-sm'}>
                <Link className={'text-blue-500 hover:underline'} to={runsBaseUrl}>← All runs</Link>
            </div>

            {!task ? (
                <div className={'text-gray-400 text-sm'}>Loading run #{taskId}…</div>
            ) : (
                <>
                    <div className={'shadow-md rounded-md p-4 flex flex-col gap-2'}>
                        <div className={'flex items-center gap-3 flex-wrap'}>
                            <div className={'text-base font-semibold text-gray-900'}>Run #{task.task_id}</div>
                            <StatusChip status={task.status} />
                            <div className={'text-sm text-gray-600 capitalize'}>{(task.worker_path || '').replace(/\//g, ' ')}</div>
                            {+task.max_attempts > 1 ? (
                                <div className={'text-xs text-gray-400'}>attempt {task.attempt || 1}/{task.max_attempts}</div>
                            ) : null}
                            <div className={'grow'} />
                            {user?.token ? (
                                <button className={buttonBlueClass} disabled={rerunning || isLive} onClick={rerun}
                                        title={isLive ? 'Wait for the run to finish' : 'Queue a new run with this exact descriptor'}>
                                    {rerunning ? 'Queuing…' : 'Re-run with same descriptor'}
                                </button>
                            ) : null}
                        </div>
                        <div className={'flex gap-4 text-sm text-gray-600 flex-wrap'}>
                            <div><span className={'text-gray-400'}>queued:</span> {formatTimestamp(task.queued_at)}</div>
                            <div><span className={'text-gray-400'}>duration:</span> {formatDuration(task.started_at, task.completed_at) || '—'}</div>
                            <div>
                                <span className={'text-gray-400'}>fired by:</span>{' '}
                                {task.schedule_id
                                    ? (schedule
                                        ? `schedule #${task.schedule_id} — ${cronToHuman(schedule.cron)}`
                                        : `schedule #${task.schedule_id}`)
                                    : (descriptor?.rerun_of ? `manual re-run of #${descriptor.rerun_of}` : 'manual')}
                            </div>
                            {task.status === 'running' && task.progress > 0 ? (
                                <div><span className={'text-gray-400'}>progress:</span> {Math.round(task.progress * 100)}%</div>
                            ) : null}
                        </div>
                        {task.error ? (
                            <div className={'text-sm text-red-700 bg-red-50 rounded p-2 whitespace-pre-wrap'}>{task.error}</div>
                        ) : null}
                        {rerunError ? <div className={'text-sm text-red-600'}>{rerunError}</div> : null}
                        {viewLinks.length ? (
                            <div className={'flex gap-2 flex-wrap text-sm'}>
                                {viewLinks.map(([key, viewId]) => (
                                    <Link key={key} className={'text-blue-500 hover:underline'}
                                          to={`${pageBaseUrl}/${params.id}/table/${viewId}`}>
                                        {key}: open view {viewId}
                                    </Link>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    <div className={'shadow-md rounded-md p-4'}>
                        <div className={'text-sm font-medium text-gray-500 pb-2'}>Descriptor</div>
                        <DescriptorBlock descriptor={task.descriptor} />
                    </div>

                    <div className={'shadow-md rounded-md p-4'}>
                        <div className={'flex items-center pb-2'}>
                            <div className={'text-sm font-medium text-gray-500'}>Events</div>
                            {isLive ? <div className={'pl-2 text-xs text-blue-500'}>live — polling every {POLL_MS / 1000}s</div> : null}
                        </div>
                        {!events.length ? (
                            <div className={'text-gray-400 text-sm'}>No events yet.</div>
                        ) : (
                            <div className={'flex flex-col'}>
                                {events.map((ev, i) => {
                                    const isError = /:ERROR$/i.test(ev.type || '') || ev.error === true;
                                    const payload = parseMaybeJson(ev.payload);
                                    return (
                                        <div key={ev.event_id ?? i}
                                             className={`py-1.5 border-l-2 pl-3 ${isError ? 'border-red-400' : 'border-gray-200'}`}>
                                            <div className={'flex gap-2 items-baseline flex-wrap'}>
                                                <span className={`text-xs font-mono ${isError ? 'text-red-700' : 'text-gray-700'}`}>{ev.type}</span>
                                                <span className={'text-sm text-gray-600'}>{ev.message || ''}</span>
                                                <span className={'text-xs text-gray-400'}>{formatTimestamp(ev.created_at)}</span>
                                            </div>
                                            {payload && typeof payload === 'object' && Object.keys(payload).length ? (
                                                <details className={'pt-0.5'}>
                                                    <summary className={'text-xs text-gray-400 cursor-pointer'}>payload</summary>
                                                    <pre className={'text-xs bg-gray-50 rounded p-2 overflow-auto max-h-48 scrollbar-sm'}>
                                                        {JSON.stringify(payload, null, 2)}
                                                    </pre>
                                                </details>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const RunsList = ({ source, params }) => {
    const ref = useRef();
    const { datasources, API_HOST, falcor, UI, pageBaseUrl } = useContext(DatasetsContext) || {};
    const { Table, Pagination } = UI;
    const pgEnv = getExternalEnv(datasources);
    const rtPfx = `${API_HOST || ''}/dama-admin/${pgEnv}`;
    const sourceId = source?.source_id;
    const runsBaseUrl = `${pageBaseUrl}/${params.id}/runs`;

    const [tasks, setTasks] = useState([]);
    const [scheduleEvents, setScheduleEvents] = useState([]);
    const [schedulesById, setSchedulesById] = useState({});
    const [schedulables, setSchedulables] = useState([]);
    const [currentPage, setCurrentPage] = useState(0);
    const [loading, setLoading] = useState(true);

    // Tasks for this source (scheduled AND manual) via the pre-existing
    // per-source tasks path — same backend route UdaTaskList uses.
    useEffect(() => {
        if (!pgEnv || !falcor || !sourceId) return;
        const load = async () => {
            const lenPath = ['uda', pgEnv, 'tasks', 'forSource', +sourceId, 'length'];
            const lenRes = await falcor.get(lenPath);
            const length = Math.min(+get(lenRes, ['json', ...lenPath], 0), MAX_TASKS);
            if (!length) { setTasks([]); setLoading(false); return; }

            const res = await falcor.get(
                ['uda', pgEnv, 'tasks', 'forSource', +sourceId, 'byIndex', { from: 0, to: length - 1 }, [...TASK_ATTRS, 'result']]);
            const indexed = get(res, ['json', 'uda', pgEnv, 'tasks', 'forSource', +sourceId, 'byIndex'], {});
            const byId = get(res, ['json', 'uda', pgEnv, 'tasks', 'byId'], {});
            const out = [];
            for (let i = 0; i < length; i++) {
                let row = indexed[i];
                if (row && row.$type === 'ref' && Array.isArray(row.value)) {
                    row = byId[row.value[row.value.length - 1]];
                }
                if (row && row.task_id != null) out.push(row);
            }
            setTasks(out);
            setLoading(false);
        };
        load();
    }, [falcor, pgEnv, sourceId]);

    // Schedules for the source + their SKIPPED_BUSY/BLOCKED/ERROR events
    // (these fires created NO task row — interleave them so silent-failure
    // legacy behavior is gone).
    useEffect(() => {
        if (!pgEnv || !sourceId) return;
        const load = async () => {
            try {
                const res = await fetch(`${rtPfx}/schedules?source_id=${sourceId}`);
                const schedules = await res.json();
                if (!Array.isArray(schedules)) return;
                setSchedulesById(schedules.reduce((out, s) => ({ ...out, [s.schedule_id]: s }), {}));
                const eventLists = await Promise.all(schedules.map(async (s) => {
                    const r = await fetch(`${rtPfx}/schedules/${s.schedule_id}/runs`);
                    const json = await r.json();
                    return (json?.events || []).map(ev => ({ ...ev, schedule_id: s.schedule_id }));
                }));
                setScheduleEvents(eventLists.flat());
            } catch { /* schedules are optional context for the listing */ }
        };
        load();
    }, [rtPfx, pgEnv, sourceId]);

    useEffect(() => {
        if (!pgEnv) return;
        fetch(`${rtPfx}/schedulables`)
            .then(r => r.json())
            .then(json => { if (Array.isArray(json)) setSchedulables(json); })
            .catch(() => {});
    }, [rtPfx, pgEnv]);

    // Merge task rows + schedule-event rows, newest first.
    const rows = useMemo(() => {
        const taskRows = tasks.map(t => ({
            kind: 'task',
            sortKey: String(t.started_at || t.queued_at || ''),
            task_id: t.task_id,
            status: t.status,
            started: t.started_at || t.queued_at,
            duration: formatDuration(t.started_at, t.completed_at),
            progress: t.status === 'running' && t.progress > 0 ? `${Math.round(t.progress * 100)}%` : '',
            firedBy: t.schedule_id
                ? scheduleLabel(t.schedule_id, schedulesById, schedulables)
                : (parseMaybeJson(t.descriptor)?.rerun_of ? 'manual (re-run)' : 'manual'),
            summary: resultSummary(t),
        }));
        const eventRows = scheduleEvents.map(ev => ({
            kind: 'event',
            sortKey: String(ev.created_at || ''),
            task_id: null,
            status: String(ev.type || '').replace('schedule:', ''),
            started: ev.created_at,
            duration: '',
            progress: '',
            firedBy: scheduleLabel(ev.schedule_id, schedulesById, schedulables),
            summary: ev.message || '',
        }));
        return [...taskRows, ...eventRows].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    }, [tasks, scheduleEvents, schedulesById, schedulables]);

    const pageRows = rows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    const COLUMNS = [
        {
            name: 'task_id', display_name: 'Run', show: true, size: 90, type: 'ui',
            Comp: ({ value, ...rest }) => value
                ? <Link className={'text-blue-500 hover:underline'} to={`${runsBaseUrl}/${value}`} {...rest}>#{value}</Link>
                : <div {...rest}>—</div>,
        },
        {
            name: 'started', display_name: 'Started', show: true, type: 'ui',
            Comp: ({ value, ...rest }) => <div title={formatTimestamp(value)} {...rest}>{timeAgo(value)}</div>,
        },
        { name: 'duration', display_name: 'Duration', show: true },
        {
            name: 'status', display_name: 'Status', show: true, type: 'ui',
            Comp: ({ value, ...rest }) => <div {...rest}><StatusChip status={value} /></div>,
        },
        { name: 'progress', display_name: 'Progress', show: true, size: 90 },
        { name: 'firedBy', display_name: 'Fired by', show: true },
        {
            name: 'summary', display_name: 'Result', show: true, size: 360, type: 'ui',
            Comp: ({ value, className = '', ...rest }) => (
                <div className={`truncate text-xs text-gray-600 ${className}`} title={value} {...rest}>{value}</div>
            ),
        },
    ];

    if (!sourceId) return <div className={'p-4 text-gray-400'}>Runs are available for external (DAMA) sources only.</div>;

    return (
        <div className={'w-full p-2 flex flex-col gap-3'}>
            <div className={'flex items-center'}>
                <div className={'text-sm font-medium text-gray-500'}>
                    Runs for <span className={'text-gray-900'}>{source?.name}</span>
                    {tasks.length >= MAX_TASKS ? <span className={'pl-2 text-xs text-gray-400'}>(latest {MAX_TASKS})</span> : null}
                </div>
                <div className={'grow'} />
                <Link className={'text-sm text-blue-500 hover:underline'} to={`${pageBaseUrl}/${params.id}/schedule`}>
                    Manage schedules →
                </Link>
            </div>

            {loading ? (
                <div className={'text-gray-400 text-sm'}>Loading runs…</div>
            ) : !rows.length ? (
                <div className={'text-gray-400 text-sm shadow-md rounded-md p-4'}>
                    No runs for this source yet. Scheduled fires and manual loader runs will show up here.
                </div>
            ) : (
                <div className={'w-full'}>
                    <Table data={pageRows} columns={COLUMNS} gridRef={ref} display={{ striped: true }} />
                    <Pagination
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                        pageSize={PAGE_SIZE}
                        usePagination={true}
                        totalLength={rows.length}
                    />
                </div>
            )}
        </div>
    );
};

export default function RunsPage({ source, params }) {
    // SourcePage's route is `source/:id/:page?/:view_id?` — for the runs page
    // the third segment carries a task_id (run detail anchor), not a view_id.
    const taskId = params?.view_id;
    return taskId
        ? <RunDetail taskId={taskId} source={source} params={params} />
        : <RunsList source={source} params={params} />;
}
