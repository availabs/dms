import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { get } from "lodash-es";

import { DatasetsContext } from "../../../context";
import { ThemeContext, getComponentTheme } from "../../../../../ui/useTheme";
import { schedulePageTheme } from "./schedulePage.theme";
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
// UI.Select can't take '' as an option value (it reads as "no value"): the "None" choice of an optional source param
const NO_SOURCE = '__none__';

function presetForCron(cron) {
    return (CADENCE_PRESETS.find(p => p.cron === cron) || CADENCE_PRESETS[3]).key;
}

/** Live "next 3 fires" preview — client-side estimate; the server validates on save. */
const CronPreview = ({ cron, timezone }) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...schedulePageTheme, ...getComponentTheme(theme, 'datasets.schedulePage') };
    let fires = null;
    try { fires = nextCronFires(cron, timezone, 3); } catch { fires = null; }
    if (!fires || !fires.length) {
        return <div className={t.previewCustom}>custom — validated on save</div>;
    }
    return (
        <div className={t.preview}>
            <span className={t.previewHuman}>{cronToHuman(cron)}</span>
            <span className={t.previewNext}>next: {fires.map(d => d.toLocaleString()).join('  •  ')}</span>
        </div>
    );
};

/**
 * One input per param descriptor from GET /schedulables:
 * string[] (comma list), source_id (select over the env's sources),
 * number, boolean, string.
 */
const ParamInput = ({ param, value, onChange, sources }) => {
    const { theme, UI } = useContext(ThemeContext) || {};
    const t = { ...schedulePageTheme, ...getComponentTheme(theme, 'datasets.schedulePage') };
    const { FieldLabel, Input, Select, ColumnTypes } = UI;
    const CheckboxEdit = ColumnTypes.checkbox.EditComp;
    const { name, type, desc, optional } = param;
    const id = `schedule-param-${name}`;
    if (type === 'boolean') {
        return (
            <div className={t.boolRow}>
                <CheckboxEdit value={!!value} onChange={v => onChange(!!v)} rowLabel={name} />
                {desc ? <span className={t.boolDesc}>{desc}</span> : null}
            </div>
        );
    }
    const caption = <>{name}{optional ? ' (optional)' : ''}{desc ? <span className={t.paramDesc}> — {desc}</span> : null}</>;
    return (
        <div className={t.field}>
            <FieldLabel htmlFor={id} text={caption} />
            {type === 'source_id' ? (
                <Select
                    options={[
                        ...(optional ? [{ label: 'None', value: NO_SOURCE }] : []),
                        ...(sources || []).map(s => ({ label: `${s.name} (#${s.source_id}, ${s.type})`, value: s.source_id })),
                    ]}
                    placeholder={optional ? 'None' : 'Select a source…'}
                    searchable
                    value={value === '' || value === undefined || value === null ? (optional ? NO_SOURCE : '') : value}
                    onChange={v => onChange(v === undefined || v === NO_SOURCE ? '' : +v)}
                />
            ) : type === 'number' ? (
                <Input id={id} type={'number'} value={value ?? ''}
                       onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />
            ) : type === 'string[]' ? (
                <Input id={id} type={'text'} placeholder={'comma-separated, e.g. NY,NJ'}
                       value={Array.isArray(value) ? value.join(',') : (value ?? '')}
                       onChange={e => onChange(e.target.value)} />
            ) : (
                <Input id={id} type={'text'} value={value ?? ''}
                       onChange={e => onChange(e.target.value)} />
            )}
        </div>
    );
};

const ScheduleForm = ({ schedulables, sources, source, editing, onSaved, onCancel, rtPfx, user }) => {
    const { theme, UI } = useContext(ThemeContext) || {};
    const t = { ...schedulePageTheme, ...getComponentTheme(theme, 'datasets.schedulePage') };
    const { Button, FieldLabel, Input, Select } = UI;
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
    // the two runs as UI.Select option groups (contiguous `group` per option)
    const loaderOptions = useMemo(() => [
        ...sortedSchedulables.filter(s => s.rank < 2)
            .map(s => ({ label: s.label, value: s.worker_path, group: `Matches this source (${source?.type})` })),
        ...sortedSchedulables.filter(s => s.rank === 2)
            .map(s => ({ label: s.label, value: s.worker_path, group: 'Other schedulable loaders' })),
    ], [sortedSchedulables, source?.type]);

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
        <div className={t.formCard}>
            <div className={t.formTitle}>
                {editing ? `Edit schedule #${editing.schedule_id}` : 'New schedule'}
            </div>

            <div className={t.field}>
                <FieldLabel text={'Loader'} />
                <Select options={loaderOptions} value={workerPath} disabled={!!editing} searchable
                        placeholder={'Select a loader…'}
                        onChange={v => pickLoader(v || '')} />
                {selected ? <div className={t.loaderPath}>{selected.worker_path}</div> : null}
            </div>

            <div className={t.field}>
                <FieldLabel text={'Cadence'} />
                <div className={t.cadenceRow}>
                    <div className={t.cadenceSeg}>
                        {CADENCE_PRESETS.map(p => (
                            <Button key={p.key}
                                    activeStyle={preset === p.key ? t.cadenceButtonStyleOn : t.cadenceButtonStyle}
                                    aria-pressed={preset === p.key}
                                    onClick={() => {
                                        setPreset(p.key);
                                        if (p.cron) setCron(p.cron);
                                    }}>
                                {p.label}
                            </Button>
                        ))}
                    </div>
                    {preset === 'custom' ? (
                        <span className={t.cronField}>
                            <Input activeStyle={'mono'} value={cron} aria-label={'cron expression'}
                                   onChange={e => setCron(e.target.value)}
                                   placeholder={'m h dom mon dow'} />
                        </span>
                    ) : (
                        <span className={t.cronText}>{cron}</span>
                    )}
                </div>
                <div className={t.previewWrap}><CronPreview cron={cron} timezone={timezone} /></div>
            </div>

            <div className={t.twoCol}>
                <div className={t.twoColItem}>
                    <FieldLabel htmlFor={'schedule-timezone'} text={'Timezone'} />
                    <Input id={'schedule-timezone'} value={timezone} onChange={e => setTimezone(e.target.value)} />
                </div>
                <div className={t.twoColItem}>
                    <FieldLabel htmlFor={'schedule-max-in-flight'} text={'Max in flight (duplicate guard)'} />
                    <Input id={'schedule-max-in-flight'} type={'number'} min={1} value={maxInFlight}
                           onChange={e => setMaxInFlight(e.target.value)} />
                </div>
            </div>

            {(selected?.params || []).length ? (
                <div className={t.paramsSection}>
                    <div className={t.paramsTitle}>Loader params</div>
                    <div className={t.paramsGrid}>
                        {selected.params.map(p => (
                            <ParamInput key={p.name} param={p} sources={sources}
                                        value={paramValues[p.name]}
                                        onChange={v => setParamValues(prev => ({ ...prev, [p.name]: v }))} />
                        ))}
                    </div>
                </div>
            ) : null}

            {error ? <div className={t.error}>{error}</div> : null}

            <div className={t.formActions}>
                <Button activeStyle={t.saveButtonStyle} disabled={!workerPath || saving} onClick={save}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Create schedule'}
                </Button>
                <Button activeStyle={t.cancelButtonStyle} onClick={onCancel}>Cancel</Button>
            </div>
        </div>
    );
};

const ScheduleRow = ({ schedule, schedulables, canEdit, onPatch, onDelete, onEdit, onFire, fireResult, runsBaseUrl }) => {
    const { theme, UI } = useContext(ThemeContext) || {};
    const t = { ...schedulePageTheme, ...getComponentTheme(theme, 'datasets.schedulePage') };
    const { Switch, DeleteModal, Button, Icon } = UI;
    const [showDelete, setShowDelete] = useState(false);
    const spec = (schedulables || []).find(s => s.worker_path === schedule.worker_path);

    return (
        <div className={t.row}>
            <div className={t.rowHead}>
                <div className={t.rowLabel}>{spec?.label || schedule.worker_path}</div>
                <div className={t.rowHuman} title={schedule.cron}>
                    {cronToHuman(schedule.cron)} <span className={t.rowCron}>({schedule.cron})</span>
                </div>
                <div className={t.rowTz}>{schedule.timezone}</div>
                <div className={t.spacer} />
                <Switch enabled={!!schedule.enabled} size={'small'} label={'enabled'}
                        disabled={!canEdit}
                        setEnabled={(v) => onPatch(schedule.schedule_id, { enabled: v })} />
            </div>
            <div className={t.rowMeta}>
                <div>
                    <span className={t.metaLabel}>next fire:</span>{' '}
                    {schedule.enabled && schedule.next_fire_at
                        ? <>{formatTimestamp(schedule.next_fire_at)} <span className={t.metaLabel}>({timeAgo(schedule.next_fire_at)})</span></>
                        : '—'}
                </div>
                <div>
                    <span className={t.metaLabel}>last fired:</span>{' '}
                    {schedule.last_fired_at ? (
                        <>
                            {timeAgo(schedule.last_fired_at)}
                            {schedule.last_task_id ? (
                                <Link className={t.runLink}
                                      to={`${runsBaseUrl}/${schedule.last_task_id}`}>
                                    view run #{schedule.last_task_id}
                                </Link>
                            ) : null}
                        </>
                    ) : 'never'}
                </div>
                <div className={t.spacer} />
                {canEdit ? (
                    <div className={t.rowActions}>
                        <Button activeStyle={t.runButtonStyle} onClick={() => onFire(schedule.schedule_id)}>
                            {t.runIcon ? <Icon icon={t.runIcon} className={t.buttonIcon} /> : null}Run now
                        </Button>
                        <Button activeStyle={t.editButtonStyle} onClick={() => onEdit(schedule)}>Edit</Button>
                        <Button activeStyle={t.deleteButtonStyle} onClick={() => setShowDelete(true)}>Delete</Button>
                    </div>
                ) : null}
            </div>
            {fireResult ? (
                <div className={t.fireResult}>
                    <span className={t.fireType}>{fireResult.type}</span> — {fireResult.reason}
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
    const { theme, UI } = useContext(ThemeContext) || {};
    const t = { ...schedulePageTheme, ...getComponentTheme(theme, 'datasets.schedulePage') };
    const { Button, Icon } = UI;

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

    if (!sourceId) return <div className={t.notExternal}>Schedules are available for external (DAMA) sources only.</div>;

    return (
        <div className={t.page}>
            <div className={t.header}>
                <div className={t.headerTitle}>
                    Scheduled runs for <span className={t.headerName}>{source?.name}</span>
                </div>
                <div className={t.spacer} />
                {canEdit && !formOpen ? (
                    <Button activeStyle={t.newButtonStyle} onClick={() => { setEditing(null); setFormOpen(true); }}>
                        {t.newIcon ? <Icon icon={t.newIcon} className={t.buttonIcon} /> : null}New schedule
                    </Button>
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

            {loadError ? <div className={t.loadError}>{loadError}</div> : null}

            <div className={t.listCard}>
                {loading ? (
                    <div className={t.listNote}>Loading schedules…</div>
                ) : !schedules.length ? (
                    <div className={t.listEmpty}>
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
