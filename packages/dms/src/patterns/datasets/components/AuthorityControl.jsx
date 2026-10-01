import React, {useState} from 'react'
import {
    isAuthoritative, authorityState, authorityKeyNames, keyLabel,
} from '../utils/authority'
import {udaSetAuthoritativeView, udaClearAuthoritativeView} from '../../../api'

// Key names authors reach for most. Free-form (any snake_case name works); these are suggestions.
const KEY_SUGGESTIONS = ['year', 'region', 'level', 'vintage', 'variant', 'return_period'];

const fmtDay = (v) => {
    const d = v ? new Date(v) : null;
    return d && !isNaN(d) ? d.toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'}) : '';
};

// The badge for an authoritative view: "authoritative" or "authoritative · year 2024".
export const AuthorityBadge = ({t, entry}) => {
    if (!entry) return null;
    const k = keyLabel(entry.key);
    return <span className={t.verAuthBadge} title={entry.note || ''}>authoritative{k ? ` · ${k}` : ''}</span>;
};

/**
 * Per-view authority status + (for editors) Mark / Clear. Used on the Overview's Versions rows and
 * on the version page. Writes go through the api/ helpers; the server validates and stamps
 * who/when. `setSource` receives the returned authority record so the page updates in place.
 */
export default function AuthorityControl({t, source, setSource, viewId, viewLabel, envKey, canEdit, falcor}) {
    const entry = isAuthoritative(source, viewId);
    const state = authorityState(source);
    const existingKeyNames = authorityKeyNames(source);

    const [open, setOpen] = useState(false);
    const [note, setNote] = useState('');
    const [keyed, setKeyed] = useState(false);
    const [keyRows, setKeyRows] = useState([{name: '', value: ''}]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    const reset = () => {
        setOpen(false); setNote(''); setKeyed(false); setError(null);
        setKeyRows([{name: '', value: ''}]);
    };
    const startMark = () => {
        // A keyed source fixes the key names; the author only fills in the values.
        setKeyRows(state === 'keyed' ? existingKeyNames.map(name => ({name, value: ''})) : [{name: '', value: ''}]);
        setKeyed(state === 'keyed');
        setOpen(true);
    };

    const key = keyed
        ? Object.fromEntries(keyRows.filter(r => r.name.trim()).map(r => [r.name.trim(), r.value.trim()]))
        : null;
    const keyIncomplete = keyed && (!keyRows.length || keyRows.some(r => !r.name.trim() || !r.value.trim()));
    const canSave = !busy && note.trim() && !keyIncomplete;

    const run = async (fn) => {
        setBusy(true); setError(null);
        try {
            const authority = await fn();
            setSource(s => ({...s, authority}));
            reset();
        } catch (e) {
            setError(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    };
    const save = () => run(() => udaSetAuthoritativeView(falcor, {
        env: envKey, source_id: source.id || source.source_id, view_id: viewId, key, note: note.trim(),
    }));
    const clear = () => run(() => udaClearAuthoritativeView(falcor, {
        env: envKey, source_id: source.id || source.source_id, key: entry?.key,
    }));

    const markLabel = state === 'undecided' ? 'Mark authoritative…'
        : state === 'single' ? 'Make this the authoritative view…'
        : 'Mark authoritative for a key…';

    return (
        <div className={t.verAuthWrap}>
            {entry && (
                <div className={t.verAuthNote}>
                    <span className={t.verAuthNoteText}>{entry.note}</span>
                    {(entry.set_by || entry.set_at) && (
                        <span className={t.verAuthNoteBy}> — {entry.set_by || 'unknown'}{entry.set_at ? `, ${fmtDay(entry.set_at)}` : ''}</span>
                    )}
                </div>
            )}

            {canEdit && !open && (
                <div className={t.verAuthActions}>
                    {entry
                        ? <button type="button" className={t.verAuthLink} disabled={busy} onClick={clear}
                                  title="This view will no longer be the one pages should bind">
                            Clear authoritative
                          </button>
                        : <button type="button" className={t.verAuthLink} onClick={startMark}
                                  title="Record that pages should bind this view, and why">
                            {markLabel}
                          </button>}
                </div>
            )}

            {open && (
                <div className={t.verAuthForm}>
                    <div className={t.verAuthHint}>
                        {state === 'single'
                            ? <>This replaces the current authoritative view. To mark one view per key (year, region, …), clear the current one first.</>
                            : <>Pages should bind <strong>{viewLabel || `view ${viewId}`}</strong>. Record why: the context the data can't show.</>}
                    </div>

                    {state === 'undecided' && (
                        <label className={t.verAuthCheck}>
                            <input type="checkbox" checked={keyed} onChange={e => setKeyed(e.target.checked)}/>
                            <span>This source has one authoritative view per key (a year, a region, a level…)</span>
                        </label>
                    )}

                    {keyed && (
                        <div className={t.verAuthKeys}>
                            <datalist id="authority-key-names">
                                {KEY_SUGGESTIONS.map(k => <option key={k} value={k}/>)}
                            </datalist>
                            {keyRows.map((row, i) => (
                                <div key={i} className={t.verAuthKeyRow}>
                                    <input className={t.verAuthInput} placeholder="key (e.g. year)" list="authority-key-names"
                                           value={row.name} disabled={state === 'keyed'}
                                           onChange={e => setKeyRows(rs => rs.map((r, j) => j === i ? {...r, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')} : r))}/>
                                    <input className={t.verAuthInput} placeholder="value (e.g. 2024)"
                                           value={row.value}
                                           onChange={e => setKeyRows(rs => rs.map((r, j) => j === i ? {...r, value: e.target.value} : r))}/>
                                    {state !== 'keyed' && keyRows.length > 1 && (
                                        <button type="button" className={t.verAuthLink}
                                                onClick={() => setKeyRows(rs => rs.filter((_, j) => j !== i))}>remove</button>
                                    )}
                                </div>
                            ))}
                            {state !== 'keyed' && (
                                <button type="button" className={t.verAuthLink}
                                        onClick={() => setKeyRows(rs => [...rs, {name: '', value: ''}])}>+ another key</button>
                            )}
                        </div>
                    )}

                    <textarea className={t.verAuthTextarea} rows={3} value={note}
                              placeholder="Why this view? e.g. “v2 drops most 2011 and 2013 loans; keep this one”"
                              onChange={e => setNote(e.target.value)}/>

                    {error && <div className={t.verAuthError}>{error}</div>}

                    <div className={t.verAuthButtons}>
                        <button type="button" className={canSave ? t.verAuthSave : t.verAuthSaveDisabled}
                                disabled={!canSave} onClick={save}>
                            {busy ? 'Saving…' : 'Mark authoritative'}
                        </button>
                        <button type="button" className={t.verAuthCancel} onClick={reset}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}
