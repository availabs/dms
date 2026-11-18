import React, { useCallback, useContext, useEffect, useState } from "react";
import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";
import { ThemeContext, getComponentTheme } from "../../../../../ui/useTheme";
import { indexesPageTheme } from "./indexes.theme";

// Source Indexes page (setindex-composite-covering-indexes.md). An author adds an index on columns
// (composite, optionally covering and partial) or on an expression — a section's calculated column
// pasted as is — and the server validates it, records it on the source and builds it on every
// table behind the source in the background (dms-server routes/uda/source_indexes.js). State is
// read from the database each time, so a build that failed, or an index dropped by hand, shows.
// Indexes made outside DMS are listed read-only.

// The index calls report their outcome as a value (sources.byId[id].indexesCall = { ok, error }):
// a thrown server error reaches the page as "[object Object]" through the falcor HTTP client.
const errorText = (e, fallback) => {
    const msg = (typeof e === 'string' && e) || e?.message;
    return msg && msg !== '[object Object]' ? msg : fallback;
};

const POLL_MS = 3000;
const BUSY = ['building', 'dropping'];

function stateBadge(entry, t) {
    const n = entry.tables?.length || 0;
    if (entry.state === 'dropping') return { cls: t.statusBusy, text: 'Removing' };
    if (entry.state === 'building') {
        const p = (entry.tables || []).find(x => x.state === 'building');
        if (p?.phase === 'queued') return { cls: t.statusBusy, text: 'Queued' };
        return { cls: t.statusBusy, text: p?.progress != null ? `Building · ${Math.round(p.progress * 100)}%` : 'Building' };
    }
    if (entry.state === 'failed') return { cls: t.statusBad, text: 'Failed' };
    if (entry.state === 'missing') {
        return entry.readyCount ? { cls: t.statusPartial, text: `Ready on ${entry.readyCount}/${n} tables` } : { cls: t.statusPartial, text: 'Not built' };
    }
    return { cls: t.statusOk, text: n > 1 ? `Ready on ${n} tables` : 'Ready' };
}

const PickedColumns = ({ t, value, onChange }) => (
    <div className={t.pickedList}>
        {value.map((c, i) => (
            <div key={c} className={t.pickedItem}>
                <span className={t.pickedName}>{c}</span>
                <button type={'button'} className={t.buttonIcon} disabled={i === 0} title={'Move up'}
                        onClick={() => { const next = [...value]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; onChange(next); }}>↑</button>
                <button type={'button'} className={t.buttonIcon} title={'Remove'}
                        onClick={() => onChange(value.filter(x => x !== c))}>✕</button>
            </div>
        ))}
    </div>
);

const ColumnPicker = ({ t, id, columns, exclude, placeholder, onPick }) => (
    <select id={id} className={t.select} value={''} onChange={e => e.target.value && onPick(e.target.value)}>
        <option value={''}>{placeholder}</option>
        {columns.filter(c => !exclude.includes(c)).map(c => <option key={c} value={c}>{c}</option>)}
    </select>
);

const IndexForm = ({ t, info, onAdd, onCancel, busy, error }) => {
    const [kind, setKind] = useState('columns');
    const [columns, setColumns] = useState([]);
    const [include, setInclude] = useState([]);
    const [where, setWhere] = useState('');
    const [expression, setExpression] = useState('');
    const [label, setLabel] = useState('');
    const all = info?.columns || [];
    const ready = kind === 'columns' ? columns.length > 0 : expression.trim() !== '';

    const submit = () => onAdd(kind === 'columns'
        ? { columns, include, where, label }
        : { expression, where, label });

    return (
        <div className={t.form}>
            <div className={t.formTitle}>Add an index</div>
            {info?.expressions && (
                <div className={t.kindRow}>
                    <label className={t.kindOption}>
                        <input type={'radio'} name={'index-kind'} checked={kind === 'columns'} onChange={() => setKind('columns')} /> Columns
                    </label>
                    <label className={t.kindOption}>
                        <input type={'radio'} name={'index-kind'} checked={kind === 'expression'} onChange={() => setKind('expression')} /> Expression
                    </label>
                </div>
            )}
            {kind === 'columns' ? (
                <>
                    <div className={t.formField}>
                        <label className={t.label} htmlFor={'index-columns'}>Columns<span className={t.labelHint}>in order</span></label>
                        <PickedColumns t={t} value={columns} onChange={setColumns} />
                        <ColumnPicker t={t} id={'index-columns'} columns={all} exclude={[...columns, ...include]}
                                      placeholder={'Add a column…'} onPick={c => setColumns([...columns, c])} />
                    </div>
                    {info?.expressions && (
                        <div className={t.formField}>
                            <label className={t.label} htmlFor={'index-include'}>Include<span className={t.labelHint}>optional</span></label>
                            <PickedColumns t={t} value={include} onChange={setInclude} />
                            <ColumnPicker t={t} id={'index-include'} columns={all} exclude={[...columns, ...include]}
                                          placeholder={'Add a column…'} onPick={c => setInclude([...include, c])} />
                        </div>
                    )}
                </>
            ) : (
                <div className={t.formField}>
                    <label className={t.label} htmlFor={'index-expression'}>Expression<span className={t.labelHint}>a calculated column; its AS name is dropped</span></label>
                    <textarea id={'index-expression'} className={t.textarea} value={expression} onChange={e => setExpression(e.target.value)}
                              placeholder={"CASE WHEN owner_type IN ('2') THEN 1 ELSE 0 END AS is_state"} />
                </div>
            )}
            {info?.expressions && (
                <div className={t.formField}>
                    <label className={t.label} htmlFor={'index-where'}>Only rows where<span className={t.labelHint}>optional</span></label>
                    <input id={'index-where'} className={t.input} value={where} onChange={e => setWhere(e.target.value)} placeholder={"owner_type = '2'"} />
                </div>
            )}
            <div className={t.formField}>
                <label className={t.label} htmlFor={'index-label'}>Name<span className={t.labelHint}>optional</span></label>
                <input id={'index-label'} className={t.input} value={label} onChange={e => setLabel(e.target.value)} />
            </div>
            {error ? <div className={t.errorText}>{error}</div> : null}
            <div className={t.formActions}>
                <button type={'button'} className={t.buttonPrimary} disabled={!ready || busy} onClick={submit}>{busy ? 'Checking…' : 'Add'}</button>
                <button type={'button'} className={t.buttonSecondary} disabled={busy} onClick={onCancel}>Cancel</button>
            </div>
        </div>
    );
};

const IndexCard = ({ t, entry, canEdit, busy, error, confirming, onRebuild, onRemove, onConfirm, onKeep }) => {
    const badge = stateBadge(entry, t);
    const failed = (entry.tables || []).filter(x => x.state === 'failed');
    const canRebuild = entry.state === 'failed' || entry.state === 'missing';
    return (
        <div className={t.card}>
            <div className={t.cardHeader}>
                <div className={t.cardTitle}>
                    {entry.label || (entry.kind === 'expression' ? 'Expression' : entry.columns.join(', '))}
                </div>
                <span className={badge.cls}>{badge.text}</span>
            </div>
            {entry.kind === 'expression' && <div className={t.cardKey}>{entry.expression}</div>}
            {entry.kind === 'columns' && entry.label && <div className={t.cardKey}>{entry.columns.join(', ')}</div>}
            {entry.include?.length > 0 && (
                <div className={t.cardDetail}>Include <span className={t.cardDetailCode}>{entry.include.join(', ')}</span></div>
            )}
            {entry.where && <div className={t.cardDetail}>Only rows where <span className={t.cardDetailCode}>{entry.where}</span></div>}
            {(entry.tables || []).length > 1 && (
                <div className={t.tableStatusList}>{entry.tables.map(x => `${x.table}: ${x.state}`).join(' · ')}</div>
            )}
            {failed.map(x => <div key={x.table} className={t.errorText}>{failed.length > 1 ? `${x.table}: ` : ''}{x.error}</div>)}
            <div className={t.cardMeta}>
                {entry.legacy ? 'Column index' : `Added${entry.addedBy ? ` by ${entry.addedBy}` : ''}${entry.addedAt ? ` on ${new Date(entry.addedAt).toLocaleDateString()}` : ''}`}
            </div>
            {error ? <div className={t.errorText}>{error}</div> : null}
            {canEdit && entry.state !== 'dropping' && (
                <div className={t.cardActions}>
                    {canRebuild && <button type={'button'} className={t.buttonPrimary} disabled={busy} onClick={onRebuild}>{entry.state === 'failed' ? 'Retry' : 'Build'}</button>}
                    {confirming ? (
                        <>
                            <button type={'button'} className={t.buttonDangerConfirm} disabled={busy} onClick={onConfirm}>Confirm remove</button>
                            <button type={'button'} className={t.buttonSecondary} disabled={busy} onClick={onKeep}>Keep</button>
                        </>
                    ) : (
                        <button type={'button'} className={t.buttonDanger} disabled={busy} onClick={onRemove}>Remove</button>
                    )}
                </div>
            )}
        </div>
    );
};

export default function IndexesPage({ params, isDms, source, format }) {
    const { id } = params;
    const { falcor, datasources, isUserAuthed, datasetsPattern } = useContext(DatasetsContext) || {};
    const { theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    const t = { ...indexesPageTheme, ...getComponentTheme(themeFromContext, 'datasets.indexesPage') };
    const pgEnv = getExternalEnv(datasources);
    const env = isDms ? `${format?.app}+${source?.type}` : pgEnv;
    const canEdit = isUserAuthed ? isUserAuthed(['update-source']) : false;

    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [adding, setAdding] = useState(false);
    const [formError, setFormError] = useState(null);
    const [busy, setBusy] = useState(null);           // an index key, 'form', or null
    const [cardErrors, setCardErrors] = useState({});  // key → message
    const [confirmRemove, setConfirmRemove] = useState(null);

    // Always read fresh: state lives in the database and changes while a build runs.
    const load = useCallback(async () => {
        if (!falcor || !env || !id) return;
        try {
            await falcor.invalidate(['uda', env, 'sources', 'byId', +id, 'indexesInfo']);
            const res = await falcor.get(['uda', env, 'sources', 'byId', +id, 'indexesInfo']);
            setInfo(res?.json?.uda?.[env]?.sources?.byId?.[id]?.indexesInfo || null);
            setLoadError(null);
        } catch (e) {
            const msg = (Array.isArray(e) ? e[0]?.value?.message : null) || errorText(e, '');
            setLoadError(/indexesInfo/.test(msg || '')
                ? "This site's API server doesn't support indexes yet. It needs a dms-server update."
                : (msg || "Couldn't load this source's indexes."));
        }
    }, [falcor, env, id]);

    useEffect(() => { load(); }, [load]);

    const anyBusy = (info?.managed || []).some(m => BUSY.includes(m.state));
    useEffect(() => {
        if (!anyBusy) return;
        const timer = setTimeout(load, POLL_MS);
        return () => clearTimeout(timer);
    }, [anyBusy, info, load]);

    // Writes are not optimistic: the call returns the fresh indexesInfo, which replaces local state.
    const callIndexes = async (route, arg) => {
        const res = await falcor.call(['uda', 'sources', route], [env, +id, arg, datasetsPattern]);
        const byId = res?.json?.uda?.[env]?.sources?.byId?.[id];
        if (byId?.indexesCall && !byId.indexesCall.ok) throw new Error(byId.indexesCall.error);
        if (byId?.indexesInfo) setInfo(byId.indexesInfo);
        else await load();
    };

    const add = async (spec) => {
        setBusy('form');
        setFormError(null);
        try {
            await callIndexes('createIndex', spec);
            setAdding(false);
        } catch (e) {
            setFormError(errorText(e, "The index couldn't be added."));
        } finally {
            setBusy(null);
        }
    };

    const runForCard = async (entry, fn, fallback) => {
        setBusy(entry.key);
        setCardErrors(prev => ({ ...prev, [entry.key]: null }));
        try {
            await fn();
        } catch (e) {
            setCardErrors(prev => ({ ...prev, [entry.key]: errorText(e, fallback) }));
        } finally {
            setBusy(null);
        }
    };
    const rebuild = (entry) => runForCard(entry, () => callIndexes('createIndex', {
        columns: entry.columns, include: entry.include, where: entry.where, expression: entry.expression, label: entry.label,
    }), "The build couldn't start.");
    const remove = (entry) => runForCard(entry, async () => {
        await callIndexes('dropIndex', entry.key);
        setConfirmRemove(null);
    }, "The index couldn't be removed.");

    if (loadError) return <div className={t.page}><div className={t.errorText}>{loadError}</div></div>;
    if (!info) return <div className={t.loading}>Loading…</div>;

    const managed = info.managed || [];
    const other = info.other || [];
    const hasTables = (info.tables || []).some(x => x.exists);

    return (
        <div className={t.page}>
            <div className={t.header}>
                <div>
                    <div className={t.title}>Indexes</div>
                    <div className={t.intro}>Speed up filters and groups on this source. Builds run in the background.</div>
                </div>
                {canEdit && !adding && hasTables && (
                    <button type={'button'} className={t.buttonPrimary} onClick={() => { setFormError(null); setAdding(true); }}>+ Add index</button>
                )}
            </div>

            {!canEdit && <div className={t.readOnlyBanner}>You can view this source's indexes but not change them.</div>}
            {!hasTables && <div className={t.notice}>No published version yet.</div>}

            {adding && <IndexForm t={t} info={info} busy={busy === 'form'} error={formError} onAdd={add} onCancel={() => setAdding(false)} />}

            {!managed.length && !adding && hasTables && <div className={t.empty}>No indexes yet</div>}

            <div className={t.list}>
                {managed.map(entry => (
                    <IndexCard key={entry.key} t={t} entry={entry} canEdit={canEdit}
                               busy={busy === entry.key} error={cardErrors[entry.key]}
                               confirming={confirmRemove === entry.key}
                               onRebuild={() => rebuild(entry)}
                               onRemove={() => setConfirmRemove(entry.key)}
                               onConfirm={() => remove(entry)}
                               onKeep={() => setConfirmRemove(null)} />
                ))}
            </div>

            {other.length > 0 && (
                <>
                    <div className={t.sectionTitle}>Other indexes</div>
                    <div className={t.otherList}>
                        {other.map(o => (
                            <div key={`${o.table}.${o.name}`} className={t.otherRow}>
                                <div className={t.otherName}>
                                    {o.name}
                                    {o.isPrimary && <span className={t.tag}>Primary key</span>}
                                    {!o.isPrimary && o.isUnique && <span className={t.tag}>Unique</span>}
                                    {!o.valid && <span className={t.tag}>Invalid</span>}
                                </div>
                                <div className={t.otherDefinition}>{o.definition}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
