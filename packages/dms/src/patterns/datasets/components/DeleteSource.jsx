import React, {useContext, useState} from "react";
import {Link, useNavigate} from "react-router";
import { DatasetsContext } from "../context";
import { clearDatasetsListCache } from "../utils/datasetsListCache";
import { ThemeContext } from "../../../ui/useTheme";
import { adminTheme } from "../pages/dataTypes/default/admin.theme";

// Source deletion for the Admin tab — one modal for every source kind (owner, 2026-10-07): a single
// "Delete" that removes the source and everything under it, confirmed by typing the source name.
// There is no soft delete; retiring a source is done with the Archive category instead.
// Styled through `datasets.admin` (deleteModal* keys).

// `refusal` ({error, reason, details}) is the DAMA server's answer when it won't delete: shown as-is,
// and when reason is 'has_outputs' the Delete button offers to take the runs' output versions too.
export function DeleteSourceModal ({open, onClose, sourceName = '', overviewHref, busy, error, refusal, onDelete}) {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI} = useContext(DatasetsContext);
    const {Modal, Button, Input} = UI;
    const [typedName, setTypedName] = useState('');
    const nameMatches = sourceName.trim().length > 0 && typedName.trim() === sourceName.trim();

    const close = () => {
        if (busy) return;
        setTypedName('');
        onClose();
    };

    return (
        <Modal open={open} setOpen={(v) => { if (!v) close(); }}>
            {/* Stop click propagation so the shared Modal's outer onClick doesn't close on interior clicks (which would steal focus from the input) */}
            <div className={t.deleteModalBody} onClick={e => e.stopPropagation()}>
                <div className={t.deleteModalTitle}>Delete source</div>
                <div className={t.deleteModalDesc}>
                    <p>
                        <span className={t.emphasisBoldDanger}>Delete</span> removes the source and every version, drops each
                        version’s data table, removes download files and deletes task history. This cannot be undone.
                    </p>
                    <p className={t.deleteModalDescHard}>
                        To retire it without deleting anything, put it in the Archive category on
                        the {overviewHref ? <Link to={overviewHref} className={t.deleteModalLink}>Overview</Link> : 'Overview'} instead.
                    </p>
                </div>
                <div className={t.deleteModalConfirmLabel}>
                    To confirm, type the source name
                    <code className={t.codeInline}>{sourceName || '(unnamed)'}</code>
                </div>
                <div className={t.deleteModalInputWrap}>
                    <Input
                        type="text"
                        value={typedName}
                        onChange={e => setTypedName(e.target.value)}
                        placeholder={sourceName}
                        autoFocus
                    />
                </div>
                {error ? <div className={t.errorText}>Error: {error}</div> : null}
                {refusal ? <div className={t.errorText}>{refusal.error}</div> : null}
                <div className={t.deleteModalFooter}>
                    {refusal?.reason === 'has_outputs' ? (
                        <Button
                            activeStyle='dangerSolid'
                            disabled={busy || !nameMatches}
                            onClick={() => onDelete(true)}
                        >
                            {busy ? 'Deleting…' : `Delete it and the ${refusal.details?.outputs?.length || ''} versions its runs produced`}
                        </Button>
                    ) : (
                        <Button
                            activeStyle='dangerSolid'
                            disabled={busy || !nameMatches}
                            onClick={() => onDelete(false)}
                        >
                            {busy ? 'Deleting…' : 'Delete'}
                        </Button>
                    )}
                    <Button
                        activeStyle='action'
                        disabled={busy}
                        onClick={close}
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// DMS sources (internal_table and any other DMS-stored source). The server route does the whole
// cleanup: drops the split data tables, deletes the view rows, strips the source from its
// dmsEnv(s), deletes the source row and its dms task rows.
export function DeleteDmsSourceBtn ({source, baseUrl}) {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...adminTheme, ...(theme?.datasets?.admin || {}) };
    const {UI, app, type, falcor, dmsEnv, pageBaseUrl} = useContext(DatasetsContext);
    const {Icon, Button} = UI;
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // For DMS sources the data_items row id is the canonical id. `source.source_id` is a legacy
    // DAMA reference some rows still carry under `data.source_id` — pointing the delete at it
    // would silently miss every modern source.
    const sourceId = +(source?.id || source?.source_id);

    const deleteSource = async () => {
        setBusy(true);
        setError(null);
        try {
            const udaEnv = `${app}+${type}`;
            const res = await falcor.call(['uda', 'sources', 'delete'], [udaEnv, sourceId]);
            // The route used to return server-side errors to a path that
            // dropped the env segment. Read both the env-scoped and bare
            // paths so older deployments still surface their errors here.
            const result =
                res?.json?.uda?.[udaEnv]?.sources?.delete
                ?? res?.json?.uda?.sources?.delete;
            if (!result) {
                throw new Error('No response from server');
            }
            if (result.error) {
                throw new Error(result.error);
            }
            if (result.deleted_source === false) {
                throw new Error(
                    `Source row id=${sourceId} not deleted on server` +
                    (result.warnings?.length ? ` — ${result.warnings.join('; ')}` : '')
                );
            }

            // Invalidate UDA caches that may have shown this source.
            await falcor.invalidate(['uda', udaEnv, 'sources', 'length']);
            await falcor.invalidate(['uda', udaEnv, 'sources', 'byIndex']);
            await falcor.invalidate(['uda', udaEnv, 'sources', 'byId', sourceId]);

            // Invalidate the dmsEnv row so its data.sources array is re-fetched
            // (the server stripped the source ref). Cover any dmsEnvs the
            // server reported updating, plus the in-context one as a fallback.
            const dmsEnvIdsToInvalidate = new Set();
            if (dmsEnv?.id) dmsEnvIdsToInvalidate.add(+dmsEnv.id);
            for (const e of result?.dmsEnvs_updated || []) {
                if (e?.id) dmsEnvIdsToInvalidate.add(+e.id);
            }
            for (const id of dmsEnvIdsToInvalidate) {
                await falcor.invalidate(['dms', 'data', app, 'byId', id]);
            }

            clearDatasetsListCache();
            setOpen(false);
            navigate(baseUrl);
        } catch (e) {
            console.error('Failed to delete source:', e);
            setError(e?.message || String(e));
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <div className={t.deleteBtnWrap}>
                <Button activeStyle='dangerFull' onClick={() => setOpen(true)}>{t.actionIconDelete && <Icon icon={t.actionIconDelete} className={t.actionIcon}/>}Delete Source</Button>
            </div>
            <DeleteSourceModal open={open} onClose={() => { setOpen(false); setError(null); }}
                               sourceName={source?.name} overviewHref={pageBaseUrl && sourceId ? `${pageBaseUrl}/${sourceId}` : undefined}
                               busy={busy} error={error} onDelete={deleteSource}/>
        </>
    )
}
