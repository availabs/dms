import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";
import { ThemeContext, getComponentTheme } from "../../../../../ui/useTheme";
import { rulesPageTheme } from "./rules.theme";

// Source Rules page (datasets-source-rules.md). An author attaches a rule the server knows about
// (dms-server dama/rules — core ones, or ones an app registered), maps it to columns, and the
// server installs it on every table behind the source. Status comes from the database itself
// (rulesInfo), so a trigger dropped by hand or a new version without the rules shows up here.

// The rule calls report their outcome as a value (sources.byId[id].rulesCall = { ok, error }):
// a thrown server error reaches the page as "[object Object]" through the falcor HTTP client.
// Anything that still throws (network, an older server) falls back to a generic message.
const errorText = (e, fallback) => {
    const msg = (typeof e === 'string' && e) || e?.message;
    return msg && msg !== '[object Object]' ? msg : fallback;
};

// A param's `columnKinds: ['number']` also accepts integer columns (mirrors the server's kindMatches).
const kindMatches = (kind, wanted = []) =>
    !wanted.length || wanted.includes(kind) || (kind === 'integer' && wanted.includes('number'));

const BBOX_LABELS = ['West', 'South', 'East', 'North'];

function statusSummary(rule, t) {
    const tables = rule.tables || [];
    const installed = tables.filter(x => x.status === 'installed').length;
    if (!rule.registered) return { cls: t.statusBad, text: 'not available on this server' };
    if (!tables.length) return { cls: t.statusPartial, text: 'no tables yet' };
    if (tables.some(x => x.status === 'error')) return { cls: t.statusBad, text: 'status unknown' };
    const text = `installed on ${installed}/${tables.length} ${tables.length === 1 ? 'table' : 'tables'}`;
    return { cls: installed === tables.length ? t.statusOk : t.statusPartial, text };
}

function paramSummary(spec, params = {}) {
    if (!spec) return Object.entries(params).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(' · ');
    return spec.params
        .filter(p => params[p.name] !== undefined && params[p.name] !== null && params[p.name] !== '')
        .map(p => {
            const v = params[p.name];
            const shown = p.type === 'bbox' && Array.isArray(v) ? v.join(', ') : (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
            return `${p.label || p.name}: ${shown}`;
        })
        .join(' · ');
}

function backfillSummary(result) {
    return (result?.tables || []).map(r => {
        const parts = [`${r.updated ?? 0} ${r.updated === 1 ? 'row' : 'rows'} updated`];
        if (r.skippedOutOfBounds) parts.push(`${r.skippedOutOfBounds} skipped (coordinates outside the allowed area)`);
        if (r.skippedMissing) parts.push(`${r.skippedMissing} without coordinates`);
        return `${r.table}: ${parts.join(' · ')}`;
    });
}

const ParamInput = ({ t, param, value, onChange, latest }) => {
    const { name, type, label, optional, desc } = param;
    const labelEl = (
        <label className={t.label} htmlFor={`rule-param-${name}`}>
            {label || name}{optional ? ' (optional)' : ''}
            {desc ? <span className={t.labelHint}>{desc}</span> : null}
        </label>
    );

    if (type === 'boolean') {
        return (
            <label className={t.checkboxRow}>
                <input type={'checkbox'} checked={!!value} onChange={e => onChange(e.target.checked)} />
                {label || name}
            </label>
        );
    }
    if (type === 'column') {
        const options = (latest?.columns || []).filter(c => kindMatches(c.kind, param.columnKinds));
        return (
            <div className={t.formField}>
                {labelEl}
                <select id={`rule-param-${name}`} className={t.select} value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
                    <option value={''}>{optional ? 'None' : 'Select a column…'}</option>
                    {options.map(c => <option key={c.name} value={c.name}>{c.name} ({c.udt})</option>)}
                </select>
            </div>
        );
    }
    if (type === 'geometry_column') {
        const options = (latest?.geometryColumns || []).filter(g => !param.geometryTypes || param.geometryTypes.includes(g.type));
        return (
            <div className={t.formField}>
                {labelEl}
                <select id={`rule-param-${name}`} className={t.select} value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}>
                    <option value={''}>Select a geometry column…</option>
                    {options.map(g => <option key={g.name} value={g.name}>{g.name} ({g.type}, SRID {g.srid || 'unset'})</option>)}
                </select>
            </div>
        );
    }
    if (type === 'bbox') {
        const box = Array.isArray(value) ? value : ['', '', '', ''];
        return (
            <div className={t.formFieldWide}>
                {labelEl}
                <div className={t.bboxGrid}>
                    {BBOX_LABELS.map((l, i) => (
                        <div key={l} className={t.bboxCell}>
                            <span className={t.bboxLabel}>{l}</span>
                            <input className={t.input} type={'number'} step={'any'} value={box[i] ?? ''}
                                   onChange={e => {
                                       const next = [...box];
                                       next[i] = e.target.value === '' ? '' : Number(e.target.value);
                                       onChange(next);
                                   }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return (
        <div className={t.formField}>
            {labelEl}
            <input id={`rule-param-${name}`} className={t.input} type={type === 'number' ? 'number' : 'text'} value={value ?? ''}
                   onChange={e => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />
        </div>
    );
};

const RuleForm = ({ t, info, editing, onApply, onCancel, busy, error }) => {
    const available = info?.available || [];
    const [ruleId, setRuleId] = useState(editing?.id || '');
    const spec = available.find(r => r.id === ruleId);
    const [params, setParams] = useState(editing?.params || {});

    const pickRule = (id) => {
        setRuleId(id);
        const s = available.find(r => r.id === id);
        if (!s) return setParams({});
        const defaults = {};
        for (const p of s.params || []) if (p.default !== undefined) defaults[p.name] = p.default;
        setParams({ ...defaults, ...(s.defaults || {}) });
    };

    return (
        <div className={t.form}>
            <div className={t.formTitle}>{editing ? `Edit: ${editing.label}` : 'Add a rule'}</div>
            {!editing && (
                <div className={t.formField}>
                    <label className={t.label} htmlFor={'rule-pick'}>Rule</label>
                    <select id={'rule-pick'} className={t.select} value={ruleId} onChange={e => pickRule(e.target.value)}>
                        <option value={''}>Select a rule…</option>
                        {available.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                </div>
            )}
            {spec?.description ? <div className={t.formDescription}>{spec.description}</div> : null}
            {spec && (
                <div className={t.formGrid}>
                    {(spec.params || []).map(p => (
                        <ParamInput key={p.name} t={t} param={p} value={params[p.name]} latest={info?.latest}
                                    onChange={v => setParams(prev => ({ ...prev, [p.name]: v }))} />
                    ))}
                </div>
            )}
            {error ? <div className={t.errorText}>{error}</div> : null}
            <div className={t.formActions}>
                <button type={'button'} className={t.buttonPrimary} disabled={!spec || busy}
                        onClick={() => onApply({ id: ruleId, params, ...(editing ? { replaceKey: editing.key } : {}) })}>
                    {busy ? 'Applying…' : (editing ? 'Save changes' : 'Apply rule')}
                </button>
                <button type={'button'} className={t.buttonSecondary} disabled={busy} onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
};

export default function RulesPage({ params, isDms }) {
    const { id } = params;
    const { falcor, datasources, isUserAuthed, datasetsPattern } = useContext(DatasetsContext) || {};
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...rulesPageTheme, ...getComponentTheme(themeFromContext, 'datasets.rulesPage') };
    const pgEnv = getExternalEnv(datasources);
    const canEdit = isUserAuthed ? isUserAuthed(['update-source']) : false;

    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [form, setForm] = useState(null);          // null | { editing?: rule }
    const [formError, setFormError] = useState(null);
    const [busy, setBusy] = useState(null);          // a rule key, 'form', or null
    const [ruleErrors, setRuleErrors] = useState({}); // key → message
    const [backfills, setBackfills] = useState({});   // key → result
    const [confirmRemove, setConfirmRemove] = useState(null);

    // Always read fresh: status lives in the database, and a cached copy from an earlier visit
    // would hide a change made elsewhere (another tab, a publish, a hand-dropped trigger).
    const load = useCallback(async () => {
        if (!falcor || !pgEnv || !id || isDms) return;
        setLoadError(null);
        try {
            await falcor.invalidate(['uda', pgEnv, 'sources', 'byId', +id, 'rulesInfo']);
            const res = await falcor.get(['uda', pgEnv, 'sources', 'byId', +id, 'rulesInfo']);
            setInfo(res?.json?.uda?.[pgEnv]?.sources?.byId?.[id]?.rulesInfo || null);
        } catch (e) {
            // A falcor GET that hits an error node rejects with [{ path, value: { message } }].
            const msg = (Array.isArray(e) ? e[0]?.value?.message : null) || errorText(e, '');
            // A server without source rules routes reads `rulesInfo` as a source column.
            setLoadError(/rulesInfo/.test(msg || '')
                ? "The API server this site uses doesn't have source rules yet. It needs the dms-server update that adds them."
                : (msg || 'Could not load the rules for this source.'));
        }
    }, [falcor, pgEnv, id, isDms]);

    useEffect(() => { load(); }, [load]);

    const specsById = useMemo(() => Object.fromEntries((info?.available || []).map(r => [r.id, r])), [info]);

    // Writes are not optimistic: the call returns the fresh rulesInfo, which replaces local state.
    const setRule = async (args, enable) => {
        const res = await falcor.call(['uda', 'sources', 'setRule'], [pgEnv, +id, args, enable, datasetsPattern]);
        const outcome = res?.json?.uda?.[pgEnv]?.sources?.byId?.[id]?.rulesCall;
        if (outcome && !outcome.ok) throw new Error(outcome.error);
        const next = res?.json?.uda?.[pgEnv]?.sources?.byId?.[id]?.rulesInfo;
        if (next) setInfo(next);
        else await load();
    };

    const applyForm = async (args) => {
        setBusy('form');
        setFormError(null);
        try {
            await setRule(args, true);
            setForm(null);
        } catch (e) {
            setFormError(errorText(e, 'The rule could not be applied.'));
        } finally {
            setBusy(null);
        }
    };

    const runForRule = async (rule, fn, fallback) => {
        setBusy(rule.key);
        setRuleErrors(prev => ({ ...prev, [rule.key]: null }));
        try {
            await fn();
        } catch (e) {
            setRuleErrors(prev => ({ ...prev, [rule.key]: errorText(e, fallback) }));
        } finally {
            setBusy(null);
        }
    };

    const reinstall = (rule) => runForRule(rule, () => setRule({ id: rule.id, params: rule.params }, true), 'The rule could not be reinstalled.');
    const remove = (rule) => runForRule(rule, async () => {
        await setRule({ id: rule.id, key: rule.key }, false);
        setConfirmRemove(null);
    }, 'The rule could not be removed.');
    const backfill = (rule) => runForRule(rule, async () => {
        const res = await falcor.call(['uda', 'sources', 'backfillRule'], [pgEnv, +id, rule.key, datasetsPattern]);
        const outcome = res?.json?.uda?.[pgEnv]?.sources?.byId?.[id]?.rulesCall;
        if (outcome && !outcome.ok) throw new Error(outcome.error);
        const result = res?.json?.uda?.[pgEnv]?.sources?.byId?.[id]?.rulesBackfill?.[rule.key];
        setBackfills(prev => ({ ...prev, [rule.key]: result || { tables: [] } }));
    }, 'Existing rows could not be updated.');

    if (isDms) return <div className={t.page}><div className={t.notice}>Rules are only available for DataManager sources.</div></div>;
    if (loadError) return <div className={t.page}><div className={t.errorText}>{loadError}</div></div>;
    if (!info) return <div className={t.loading}>Loading rules…</div>;
    if (!info.supported) return <div className={t.page}><div className={t.notice}>{info.reason}</div></div>;

    const attached = info.attached || [];

    return (
        <div className={t.page}>
            <div className={t.header}>
                <div>
                    <div className={t.title}>Rules</div>
                    <div className={t.intro}>
                        Rules keep this source's table correct whenever rows are added or changed, from
                        any page or tool. They apply to every version of the source, including ones
                        published later.
                    </div>
                </div>
                {canEdit && !form && (info.available || []).length > 0 && info.tables?.length > 0 && (
                    <button type={'button'} className={t.buttonPrimary} onClick={() => { setFormError(null); setForm({}); }}>
                        + Add rule
                    </button>
                )}
            </div>

            {!canEdit && <div className={t.readOnlyBanner}>You can view this source's rules but not change them.</div>}
            {!info.tables?.length && <div className={t.notice}>This source has no published version yet. Publish one, then add rules.</div>}

            {form && !form.editing && (
                <RuleForm t={t} info={info} busy={busy === 'form'} error={formError}
                          onApply={applyForm} onCancel={() => setForm(null)} />
            )}

            {!attached.length && !form && info.tables?.length > 0 && <div className={t.empty}>No rules yet.</div>}

            <div className={t.list}>
                {attached.map(rule => {
                    const spec = specsById[rule.id];
                    const status = statusSummary(rule, t);
                    const missing = (rule.tables || []).some(x => x.status === 'missing');
                    const isBusy = busy === rule.key;
                    if (form?.editing?.key === rule.key) {
                        return (
                            <RuleForm key={rule.key} t={t} info={info} editing={rule} busy={busy === 'form'} error={formError}
                                      onApply={applyForm} onCancel={() => setForm(null)} />
                        );
                    }
                    return (
                        <div key={rule.key} className={t.card}>
                            <div className={t.cardHeader}>
                                <div className={t.cardTitle}>{rule.label}</div>
                                <span className={status.cls}>{status.text}</span>
                            </div>
                            <div className={t.cardSummary}>{paramSummary(spec, rule.params)}</div>
                            {(rule.tables || []).length > 1 && (
                                <div className={t.tableStatusList}>
                                    {rule.tables.map(x => `${x.table}: ${x.status}`).join(' · ')}
                                </div>
                            )}
                            <div className={t.cardMeta}>
                                Added{rule.addedBy ? ` by ${rule.addedBy}` : ''}{rule.addedAt ? ` on ${new Date(rule.addedAt).toLocaleDateString()}` : ''}
                                {rule.updatedAt ? ` · edited ${new Date(rule.updatedAt).toLocaleDateString()}` : ''}
                            </div>
                            {backfills[rule.key] && (
                                <div className={t.backfillResult}>
                                    {backfillSummary(backfills[rule.key]).map(line => <div key={line}>{line}</div>)}
                                </div>
                            )}
                            {ruleErrors[rule.key] ? <div className={t.errorText}>{ruleErrors[rule.key]}</div> : null}
                            {canEdit && (
                                <div className={t.cardActions}>
                                    {missing && rule.registered && (
                                        <button type={'button'} className={t.buttonPrimary} disabled={isBusy} onClick={() => reinstall(rule)}>Reinstall</button>
                                    )}
                                    {rule.canBackfill && (
                                        <button type={'button'} className={t.buttonSecondary} disabled={isBusy} onClick={() => backfill(rule)}>
                                            {isBusy ? 'Working…' : 'Apply to existing rows'}
                                        </button>
                                    )}
                                    {spec && (
                                        <button type={'button'} className={t.buttonSecondary} disabled={isBusy}
                                                onClick={() => { setFormError(null); setForm({ editing: rule }); }}>Edit</button>
                                    )}
                                    {confirmRemove === rule.key ? (
                                        <>
                                            {spec?.removeNote ? <span className={t.removeNote}>{spec.removeNote}</span> : null}
                                            <button type={'button'} className={t.buttonDangerConfirm} disabled={isBusy} onClick={() => remove(rule)}>Confirm remove</button>
                                            <button type={'button'} className={t.buttonSecondary} disabled={isBusy} onClick={() => setConfirmRemove(null)}>Keep</button>
                                        </>
                                    ) : (
                                        <button type={'button'} className={t.buttonDanger} disabled={isBusy} onClick={() => setConfirmRemove(rule.key)}>Remove</button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
