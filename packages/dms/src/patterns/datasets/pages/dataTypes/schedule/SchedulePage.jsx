import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { get } from "lodash-es";

import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";
import {
    cronToHuman,
    nextCronFires,
    timeAgo,
    formatTimestamp,
    schedulableMatchRank,
} from "./scheduleUtils";

const CADENCE_PRESETS = [
    { key: 'daily', label: 'Daily 02:00', cron: '0 2 * * *' },
    { key: 'weekly', label: 'Weekly Mon 02:00', cron: '0 2 * * 1' },
    { key: 'monthly', label: 'Monthly 1st 02:00', cron: '0 2 1 * *' },
    { key: 'custom', label: 'Custom cron' },
];

const DEFAULT_TIMEZONE = 'America/New_York';

const inputClass = 'w-full p-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500';
const labelClass = 'block text-xs font-medium text-gray-500 pb-0.5';
const buttonBlueClass = 'px-2 py-1 bg-blue-100 hover:bg-blue-200 text-blue-600 text-sm rounded-md cursor-pointer disabled:opacity-40';
const buttonGrayClass = 'px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-md cursor-pointer';
const buttonRedClass = 'px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 text-sm rounded-md cursor-pointer';

function presetForCron(cron) {
    return (CADENCE_PRESETS.find(p => p.cron === cron) || CADENCE_PRESETS[3]).key;
}

/** Live "next 3 fires" preview — client-side estimate; the server validates on save. */
const CronPreview = ({ cron, timezone }) => {
    let fires = null;
    try { fires = nextCronFires(cron, timezone, 3); } catch { fires = null; }
    if (!fires || !fires.length) {
        return <div className={'text-xs text-amber-600'}>custom — validated on save</div>;
    }
    return (
        <div className={'text-xs text-gray-500'}>
            <span className={'font-medium'}>{cronToHuman(cron)}</span>
            <span className={'pl-2'}>next: {fires.map(d => d.toLocaleString()).join('  •  ')}</span>
        </div>
    );
};

/**
 * One input per param descriptor from GET /schedulables:
 * string[] (comma list), source_id (select over the env's sources),
 * number, boolean, string.
 */
const ParamInput = ({ param, value, onChange, sources }) => {
    const { name, type, desc, optional } = param;
    if (type === 'boolean') {
        return (
            <label className={'flex items-center gap-2 text-sm text-gray-700'}>
                <input type={'checkbox'} checked={!!value} onChange={e => onChange(e.target.checked)} />
                {name}{desc ? <span className={'text-xs text-gray-400'}>{desc}</span> : null}
            </label>
        );
    }
    return (
        <div>
            <label className={labelClass}>
                {name}{optional ? ' (optional)' : ''}{desc ? <span className={'pl-1 text-gray-400 normal-case'}>— {desc}</span> : null}
            </label>
            {type === 'source_id' ? (
                <select className={inputClass}
                        value={value ?? ''}
                        onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)}>
                    <option value={''}>{optional ? 'None' : 'Select a source…'}</option>
                    {(sources || []).map(s => (
                        <option key={s.source_id} value={s.source_id}>{s.name} (#{s.source_id}, {s.type})</option>
                    ))}
                </select>
            ) : type === 'number' ? (
                <input className={inputClass} type={'number'} value={value ?? ''}
                       onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />
            ) : type === 'string[]' ? (
                <input className={inputClass} type={'text'} placeholder={'comma-separated, e.g. NY,NJ'}
                       value={Array.isArray(value) ? value.join(',') : (value ?? '')}
                       onChange={e => onChange(e.target.value)} />
            ) : (
                <input className={inputClass} type={'text'} value={value ?? ''}
                       onChange={e => onChange(e.target.value)} />
            )}
        </div>
    );
};

const ScheduleForm = ({ schedulables, sources, source, editing, onSaved, onCancel, rtPfx, user }) => {
    const [workerPath, setWorkerPath] = useState(editing?.worker_path || '');
    const [preset, setPreset] = useState(editing ? presetForCron(editing.cron) : 'daily');
    const [cron, setCron] = useState(editing?.cron || '0 2 * * *');
    const [timezone, setTimezone] = useState(editing?.timezone || DEFAULT_TIMEZONE);
    const [paramValues, setParamValues] = useState(editing?.descriptor || {});
    const [maxInFlight, setMaxInFlight] = useState(editing?.max_in_flight ?? 1);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);

    // Loader select: matching loaders first (exact, then type family), the
    // rest below a divider. See schedulableMatchRank for the rule.
    const sortedSchedulables = useMemo(() => {
        return [...(schedulables || [])]
            .map(s => ({ ...s, rank: schedulableMatchRank(s.datatype, source?.type) }))
            .sort((a, b) => a.rank - b.rank || String(a.label).localeCompare(String(b.label)));
    }, [schedulables, source?.type]);
    const matching = sortedSchedulables.filter(s => s.rank < 2);
    const others = sortedSchedulables.filter(s => s.rank === 2);

    const selected = (schedulables || []).find(s => s.worker_path === workerPath);

    const pickLoader = (wp) => {
        setWorkerPath(wp);
        const spec = (schedulables || []).find(s => s.worker_path === wp);
        if (!spec) return;
        if (!editing) {
            // seed param defaults + the plugin's preferred cadence
            const defaults = {};
            for (const p of spec.params || []) {
                if (p.default !== undefined) defaults[p.name] = p.default;
            }
            setParamValues(defaults);
            if (spec.defaultCron) {
                setCron(spec.defaultCron);
                setPreset(presetForCron(spec.defaultCron));
            }
        }
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        // Build the descriptor template from the param form. string[] values
        // may still be raw comma strings; coerce here. Empty optionals are
        // omitted entirely.
        const descriptor = {};
        for (const p of (selected?.params || [])) {
            let v = paramValues[p.name];
            if (p.type === 'string[]' && typeof v === 'string') {
                v = v.split(',').map(s => s.trim()).filter(Boolean);
            }
            const empty = v === '' || v === undefined || v === null ||
                (Array.isArray(v) && v.length === 0);
            if (empty) {
                if (!p.optional && p.type !== 'boolean') {
                    setError(`Param "${p.name}" is required`);
                    setSaving(false);
                    return;
                }
                continue;
            }
            descriptor[p.name] = v;
        }

        const body = {
            source_id: source?.source_id,
            worker_path: workerPath,
            cron,
            timezone,
            descriptor,
            max_in_flight: Math.max(1, +maxInFlight || 1),
        };
        try {
            const res = await fetch(
                editing ? `${rtPfx}/schedules/${editing.schedule_id}` : `${rtPfx}/schedules`,
                {
                    method: editing ? 'PATCH' : 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: user?.token },
                    body: JSON.stringify(body),
                });
            const json = await res.json();
            if (!res.ok) {
                setError(json?.error || `Save failed (${res.status})`);
            } else {
                onSaved(json);
            }
        } catch (e) {
            setError(e.message);
        }
        setSaving(false);
    };

    return (
        <div className={'shadow-md rounded-md p-4 flex flex-col gap-3 bg-gray-50'}>
            <div className={'text-base font-semibold text-gray-900'}>
                {editing ? `Edit schedule #${editing.schedule_id}` : 'New schedule'}
            </div>

            <div>
                <label className={labelClass}>Loader</label>
                <select className={inputClass} value={workerPath} disabled={!!editing}
                        onChange={e => pickLoader(e.target.value)}>
                    <option value={''}>Select a loader…</option>
                    {matching.length ? (
                        <optgroup label={`Matches this source (${source?.type})`}>
                            {matching.map(s => (
                                <option key={s.worker_path} value={s.worker_path}>{s.label}</option>
                            ))}
                        </optgroup>
                    ) : null}
                    {others.length ? (
                        <optgroup label={'Other schedulable loaders'}>
                            {others.map(s => (
                                <option key={s.worker_path} value={s.worker_path}>{s.label}</option>
                            ))}
                        </optgroup>
                    ) : null}
                </select>
                {selected ? <div className={'text-xs text-gray-400 pt-0.5'}>{selected.worker_path}</div> : null}
            </div>

            <div>
                <label className={labelClass}>Cadence</label>
                <div className={'flex gap-2 flex-wrap items-center'}>
                    {CADENCE_PRESETS.map(p => (
                        <button key={p.key}
                                className={`px-2 py-1 text-sm rounded-md cursor-pointer border ${
                                    preset === p.key
                                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                                onClick={() => {
                                    setPreset(p.key);
                                    if (p.cron) setCron(p.cron);
                                }}>
                            {p.label}
                        </button>
                    ))}
                    {preset === 'custom' ? (
                        <input className={`${inputClass} w-40 font-mono`} value={cron}
                               onChange={e => setCron(e.target.value)}
                               placeholder={'m h dom mon dow'} />
                    ) : (
                        <span className={'text-xs font-mono text-gray-400'}>{cron}</span>
                    )}
                </div>
                <div className={'pt-1'}><CronPreview cron={cron} timezone={timezone} /></div>
            </div>

            <div className={'flex gap-4'}>
                <div className={'w-1/2'}>
                    <label className={labelClass}>Timezone</label>
                    <input className={inputClass} value={timezone} onChange={e => setTimezone(e.target.value)} />
                </div>
                <div className={'w-1/2'}>
                    <label className={labelClass}>Max in flight (duplicate guard)</label>
                    <input className={inputClass} type={'number'} min={1} value={maxInFlight}
                           onChange={e => setMaxInFlight(e.target.value)} />
                </div>
            </div>

            {(selected?.params || []).length ? (
                <div className={'flex flex-col gap-2'}>
                    <div className={'text-xs font-semibold text-gray-500 uppercase'}>Loader params</div>
                    {selected.params.map(p => (
                        <ParamInput key={p.name} param={p} sources={sources}
                                    value={paramValues[p.name]}
                                    onChange={v => setParamValues(prev => ({ ...prev, [p.name]: v }))} />
                    ))}
                </div>
            ) : null}

            {error ? <div className={'text-sm text-red-600'}>{error}</div> : null}

            <div className={'flex gap-2'}>
                <button className={buttonBlueClass} disabled={!workerPath || saving} onClick={save}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Create schedule'}
                </button>
                <button className={buttonGrayClass} onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
};

const ScheduleRow = ({ schedule, schedulables, canEdit, onPatch, onDelete, onEdit, onFire, fireResult, runsBaseUrl }) => {
    const { UI } = useContext(DatasetsContext);
    const { Switch, DeleteModal } = UI;
    const [showDelete, setShowDelete] = useState(false);
    const spec = (schedulables || []).find(s => s.worker_path === schedule.worker_path);

    return (
        <div className={'border-b border-gray-100 py-2 flex flex-col gap-1'}>
            <div className={'flex items-center gap-3 flex-wrap'}>
                <div className={'font-medium text-gray-900'}>{spec?.label || schedule.worker_path}</div>
                <div className={'text-sm text-gray-600'} title={schedule.cron}>
                    {cronToHuman(schedule.cron)} <span className={'font-mono text-xs text-gray-400'}>({schedule.cron})</span>
                </div>
                <div className={'text-xs text-gray-400'}>{schedule.timezone}</div>
                <div className={'grow'} />
                <Switch enabled={!!schedule.enabled} size={'small'} label={'enabled'}
                        disabled={!canEdit}
                        setEnabled={(v) => onPatch(schedule.schedule_id, { enabled: v })} />
            </div>
            <div className={'flex items-center gap-4 text-sm text-gray-600 flex-wrap'}>
                <div>
                    <span className={'text-gray-400'}>next fire:</span>{' '}
                    {schedule.enabled && schedule.next_fire_at
                        ? <>{formatTimestamp(schedule.next_fire_at)} <span className={'text-gray-400'}>({timeAgo(schedule.next_fire_at)})</span></>
                        : '—'}
                </div>
                <div>
                    <span className={'text-gray-400'}>last fired:</span>{' '}
                    {schedule.last_fired_at ? (
                        <>
                            {timeAgo(schedule.last_fired_at)}
                            {schedule.last_task_id ? (
                                <Link className={'pl-1 text-blue-500 hover:underline'}
                                      to={`${runsBaseUrl}/${schedule.last_task_id}`}>
                                    view run #{schedule.last_task_id}
                                </Link>
                            ) : null}
                        </>
                    ) : 'never'}
                </div>
                <div className={'grow'} />
                {canEdit ? (
                    <div className={'flex gap-2'}>
                        <button className={buttonBlueClass} onClick={() => onFire(schedule.schedule_id)}>Run now</button>
                        <button className={buttonGrayClass} onClick={() => onEdit(schedule)}>Edit</button>
                        <button className={buttonRedClass} onClick={() => setShowDelete(true)}>Delete</button>
                    </div>
                ) : null}
            </div>
            {fireResult ? (
                <div className={'text-sm text-amber-700 bg-amber-50 rounded px-2 py-1 w-fit'}>
                    <span className={'font-semibold'}>{fireResult.type}</span> — {fireResult.reason}
                </div>
            ) : null}
            <DeleteModal
                title={`Delete schedule #${schedule.schedule_id}`}
                prompt={`Are you sure you want to delete this schedule (${cronToHuman(schedule.cron)})? Past runs are kept; only the cadence is removed.`}
                open={showDelete}
                setOpen={setShowDelete}
                onDelete={async () => {
                    await onDelete(schedule.schedule_id);
                    setShowDelete(false);
                }}
            />
        </div>
    );
};

export default function SchedulePage({ source, params }) {
    const navigate = useNavigate();
    const { user, datasources, API_HOST, falcor, pageBaseUrl } = useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const rtPfx = `${API_HOST || ''}/dama-admin/${pgEnv}`;
    const sourceId = source?.source_id;
    const canEdit = !!user?.token;
    const runsBaseUrl = `${pageBaseUrl}/${params.id}/runs`;

    const [schedules, setSchedules] = useState([]);
    const [schedulables, setSchedulables] = useState([]);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [fireResults, setFireResults] = useState({});
    const [loadError, setLoadError] = useState(null);

    const refresh = useCallback(async () => {
        if (!pgEnv || !sourceId) return;
        try {
            const res = await fetch(`${rtPfx}/schedules?source_id=${sourceId}`);
            const json = await res.json();
            if (Array.isArray(json)) setSchedules(json);
            else setLoadError(json?.error || 'Could not load schedules');
        } catch (e) {
            setLoadError(e.message);
        }
        setLoading(false);
    }, [rtPfx, pgEnv, sourceId]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!pgEnv) return;
        fetch(`${rtPfx}/schedulables`)
            .then(r => r.json())
            .then(json => { if (Array.isArray(json)) setSchedulables(json); })
            .catch(() => {});
    }, [rtPfx, pgEnv]);

    // Sources list for `source_id`-typed loader params (e.g. npmrds_prod_id).
    useEffect(() => {
        if (!pgEnv || !falcor) return;
        const load = async () => {
            const lenPath = ['uda', pgEnv, 'sources', 'length'];
            const lenRes = await falcor.get(lenPath);
            const length = +get(lenRes, ['json', ...lenPath], 0);
            if (!length) return;
            const res = await falcor.get(
                ['uda', pgEnv, 'sources', 'byIndex', { from: 0, to: length - 1 }, ['source_id', 'name', 'type']]);
            const indexed = get(res, ['json', 'uda', pgEnv, 'sources', 'byIndex'], {});
            const byId = get(res, ['json', 'uda', pgEnv, 'sources', 'byId'], {});
            const out = [];
            for (let i = 0; i < length; i++) {
                let row = indexed[i];
                if (row && row.$type === 'ref' && Array.isArray(row.value)) {
                    row = byId[row.value[row.value.length - 1]];
                }
                if (row && row.source_id != null) {
                    out.push({ source_id: row.source_id, name: row.name, type: row.type });
                }
            }
            setSources(out);
        };
        load();
    }, [falcor, pgEnv]);

    const patchSchedule = async (scheduleId, body) => {
        const res = await fetch(`${rtPfx}/schedules/${scheduleId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: user?.token },
            body: JSON.stringify(body),
        });
        if (res.ok) refresh();
    };

    const deleteSchedule = async (scheduleId) => {
        await fetch(`${rtPfx}/schedules/${scheduleId}`, {
            method: 'DELETE',
            headers: { Authorization: user?.token },
        });
        refresh();
    };

    const fireSchedule = async (scheduleId) => {
        setFireResults(prev => ({ ...prev, [scheduleId]: null }));
        try {
            const res = await fetch(`${rtPfx}/schedules/${scheduleId}/fire`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: user?.token },
                body: '{}',
            });
            const json = await res.json();
            if (json?.queued === true) {
                navigate(`${runsBaseUrl}/${json.task_id}`);
            } else {
                // SKIPPED_BUSY / BLOCKED (incl. the RITIS daily budget) surface here
                setFireResults(prev => ({
                    ...prev,
                    [scheduleId]: { type: json?.type || 'ERROR', reason: json?.reason || json?.error || 'fire failed' },
                }));
            }
        } catch (e) {
            setFireResults(prev => ({ ...prev, [scheduleId]: { type: 'ERROR', reason: e.message } }));
        }
    };

    if (!sourceId) return <div className={'p-4 text-gray-400'}>Schedules are available for external (DAMA) sources only.</div>;

    return (
        <div className={'w-full p-2 flex flex-col gap-3'}>
            <div className={'flex items-center'}>
                <div className={'text-sm font-medium text-gray-500'}>
                    Scheduled runs for <span className={'text-gray-900'}>{source?.name}</span>
                </div>
                <div className={'grow'} />
                {canEdit && !formOpen ? (
                    <button className={buttonBlueClass} onClick={() => { setEditing(null); setFormOpen(true); }}>
                        New schedule
                    </button>
                ) : null}
            </div>

            {formOpen ? (
                <ScheduleForm
                    schedulables={schedulables}
                    sources={sources}
                    source={source}
                    editing={editing}
                    rtPfx={rtPfx}
                    user={user}
                    onSaved={() => { setFormOpen(false); setEditing(null); refresh(); }}
                    onCancel={() => { setFormOpen(false); setEditing(null); }}
                />
            ) : null}

            {loadError ? <div className={'text-sm text-red-600'}>{loadError}</div> : null}

            <div className={'shadow-md rounded-md p-4'}>
                {loading ? (
                    <div className={'text-gray-400 text-sm'}>Loading schedules…</div>
                ) : !schedules.length ? (
                    <div className={'text-gray-400 text-sm'}>
                        No schedules for this source yet.{canEdit ? ' Use "New schedule" to create one.' : ''}
                    </div>
                ) : (
                    schedules.map(s => (
                        <ScheduleRow key={s.schedule_id}
                                     schedule={s}
                                     schedulables={schedulables}
                                     canEdit={canEdit}
                                     runsBaseUrl={runsBaseUrl}
                                     fireResult={fireResults[s.schedule_id]}
                                     onPatch={patchSchedule}
                                     onDelete={deleteSchedule}
                                     onEdit={(sched) => { setEditing(sched); setFormOpen(true); }}
                                     onFire={fireSchedule} />
                    ))
                )}
            </div>
        </div>
    );
}
