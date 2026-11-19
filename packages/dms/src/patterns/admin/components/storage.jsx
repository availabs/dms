import React from "react";
import { ThemeContext, getComponentTheme } from "../../../ui/useTheme";
import { AdminContext } from "../context";
import { dmsStorageClean } from "../../../api";
import { storageTheme } from "./storage.theme";
import { fmtBytes, fmtNum } from "./storageUtils";
import { timeAgo } from "../utils";

// The Storage pages' parts (design_system_v6/pages/admin-site-storage.html, admin-pattern-storage.html).

/** Title, what it is about, when it was checked, Check again, and the totals. */
export function StorageHeader({ tag, checkedAt, loading, onReload, stats = [] }) {
    const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...storageTheme, ...getComponentTheme(themeFromContext, 'admin.storage') };
    return (
        <div className={t.header}>
            <div className="min-w-0">
                <div className={t.titleRow}>
                    <h1 className={t.title}>Storage</h1>
                    {tag ? <span className={t.titleTag}>{tag}</span> : null}
                </div>
                <p className={t.checked}>{loading ? 'checking…' : checkedAt ? `checked ${timeAgo(checkedAt) || 'just now'}` : ''}</p>
            </div>
            <span className={t.spacer} />
            <UI.Button activeStyle="action" onClick={onReload} disabled={loading}>Check again</UI.Button>
            {stats.length ? (
                <div className={t.stats}>
                    {stats.map((s, i) => (
                        <div key={s.label} className={i === 2 ? t.statHideSm : t.stat}>
                            <p className={s.warn ? t.statValueWarn : t.statValue}>{s.value}</p>
                            <p className={t.statLabel}>{s.label}</p>
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** The usage bar and its legend: `rows` = [{ label, note, count, bytes, tone }]. */
export function StorageUsage({ rows = [], countLabel = 'count' }) {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...storageTheme, ...getComponentTheme(themeFromContext, 'admin.storage') };
    const total = rows.reduce((s, r) => s + r.bytes, 0) || 1;
    return (
        <div className={t.card}>
            <div className={t.barWrap}>
                <div className={t.bar}>
                    {rows.filter(r => r.bytes > 0).map(r => (
                        <span key={r.label} className={t.segment[r.tone] || t.segment.pencil} style={{ width: `${(100 * r.bytes / total).toFixed(1)}%` }} title={r.label} />
                    ))}
                </div>
            </div>
            <div className={t.legendHead}>
                <span className={t.legendHeadLabel}>kind</span><span className={t.spacer} />
                <span className={t.legendHeadCell}>{countLabel}</span><span className={t.legendHeadCell}>size</span>
            </div>
            {rows.map(r => (
                <div key={r.label} className={t.legendRow}>
                    <span className={t.swatch[r.tone] || t.swatch.pencil} />
                    <span className={t.legendLabel}>{r.label}</span>
                    {r.note ? <span className={t.legendNote}>{r.note}</span> : null}
                    <span className={t.spacer} />
                    <span className={t.legendCount}>{fmtNum(r.count)}</span>
                    <span className={t.legendSize}>{fmtBytes(r.bytes)}</span>
                </div>
            ))}
        </div>
    );
}

/** One row of a Clean up card. No `onClean` (nothing to clean) shows "nothing to clean up". */
export function CleanupRow({ title, facts, note, onClean, buttonLabel = 'Clean up', quiet = false, children }) {
    const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...storageTheme, ...getComponentTheme(themeFromContext, 'admin.storage') };
    return (
        <div className={t.cleanRow}>
            <div className={t.cleanHead}>
                <span className={t.cleanTitle}>{title}</span>
                <span className={t.cleanFacts}>{facts}</span>
                <span className={t.spacer} />
                {onClean
                    ? <UI.Button activeStyle={quiet ? 'action' : 'danger'} onClick={onClean}>{buttonLabel}</UI.Button>
                    : <span className={t.cleanNothing}>nothing to clean up</span>}
            </div>
            {note ? <p className={t.cleanNote}>{note}</p> : null}
            {children}
        </div>
    );
}

/**
 * The two-step dialog: `verb` turns into `confirmVerb`, which sends the clean up with the plan's
 * `expect`. A plan that changed is refused by the server (409) and shown, nothing deleted.
 * `job` = { title, facts, verb, confirmVerb, parents, kinds, only, expect }. `onDone()` reloads the page.
 */
export function CleanupDialog({ job, onClose, onDone }) {
    const { API_HOST, user, app } = React.useContext(AdminContext) || {};
    const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...storageTheme, ...getComponentTheme(themeFromContext, 'admin.storage') };
    const [step, setStep] = React.useState(0);
    const [running, setRunning] = React.useState(false);
    const [error, setError] = React.useState('');
    const [done, setDone] = React.useState(null);
    React.useEffect(() => { setStep(0); setRunning(false); setError(''); setDone(null); }, [job]);
    if (!job) return null;
    const verb = job.verb || 'Clean up';
    const confirmVerb = job.confirmVerb || 'Confirm clean up';

    const go = async () => {
        if (step === 0) { setStep(1); return; }
        setRunning(true); setError('');
        try {
            const out = await dmsStorageClean({ API_HOST, user, app, parents: job.parents, kinds: job.kinds, only: job.only, expect: job.expect });
            setDone(out);
            onDone?.();
        } catch (e) {
            setError(e.status === 409 ? 'Counts changed since you opened this. Check again.' : e.message);
        } finally {
            setRunning(false);
        }
    };

    return (
        <UI.Dialog open={true} onClose={() => { if (!running) onClose(); }} size="md">
            <h2 className={t.dialogTitle}>{job.title}</h2>
            <div className={t.dialogBody}>
                <p className={t.dialogFacts}>{job.facts}</p>
                <p className={t.dialogNote}>A backup is written first. Rows changed in the last 24 h are kept.</p>
                {error ? <p className={t.error}>{error}</p> : null}
                {done ? <p className={t.dialogDone}>Deleted {fmtNum(done.deleted)} {done.deleted === 1 ? 'row' : 'rows'}{done.keptSincePlan ? `, kept ${fmtNum(done.keptSincePlan)} that changed` : ''}. Backup: {done.backup}</p> : null}
            </div>
            <div className={t.dialogActions}>
                {done ? (
                    <UI.Button activeStyle="action" onClick={onClose}>Close</UI.Button>
                ) : (
                    <>
                        <UI.Button activeStyle="action" onClick={onClose} disabled={running}>Cancel</UI.Button>
                        <UI.Button activeStyle="dangerSolid" onClick={go} disabled={running || Boolean(error)}>
                            {running ? 'Cleaning up…' : step === 0 ? verb : confirmVerb}
                        </UI.Button>
                    </>
                )}
            </div>
        </UI.Dialog>
    );
}
