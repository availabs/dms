import React, { useContext, useEffect, useState } from "react";
import { Link } from "react-router";
import { DatasetsContext } from "../context";
import { ThemeContext, getComponentTheme } from "../../../ui/useTheme";
import { loadItemFresh } from "../../../api";
import { clearDatasetsListCache } from "../utils/datasetsListCache";
import { changeHistoryEditorTheme } from "./ChangeHistoryEditor.theme";
import {
  changeHistoryDraft, changeHistoryProblem, changeHistorySetting, ensureHistoryDataset, historyDatasetName,
  parseJson, sourceColumns,
} from "../utils/changeHistory";

// Change history for an internal dataset: whether every change to its rows is recorded, and for
// which columns. The rows go to the dataset's own history dataset ("<dataset> history", made on the
// first save), or to whichever one its stored setting names (a shared history set up in code, as
// the QA pattern does). Stored on the source row as `change_history` (utils/changeHistory.js) and
// written with dms.data.edit, the row-edit path, so the server applies it from the next edit.
// Needs `update-source`.
export default function ChangeHistoryEditor({ source, id }) {
  const { UI, app, falcor, dmsEnv, baseUrl, isUserAuthed } = useContext(DatasetsContext) || {};
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...changeHistoryEditorTheme, ...getComponentTheme(theme, 'datasets.changeHistoryEditor') };
  const { Switch, MultiSelect, Button } = UI;
  const canEdit = isUserAuthed ? isUserAuthed(['update-source']) : false;
  const sourceId = +(source?.id || id);

  const [stored, setStored] = useState(undefined); // the saved setting (null = never set); undefined while loading
  const [draft, setDraft] = useState(changeHistoryDraft(null));
  const [target, setTarget] = useState(null); // { source_id, view_id, name } the rows go to, once known
  const [sourceName, setSourceName] = useState('');
  const [columns, setColumns] = useState([]); // this dataset's column names
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!canEdit || !sourceId || !falcor) return;
    let current = true;
    (async () => {
      const row = await loadItemFresh(falcor, app, sourceId);
      const setting = parseJson(row?.data?.change_history) || null;
      const to = setting?.target?.source_id ? await loadItemFresh(falcor, app, setting.target.source_id) : null;
      if (!current) return;
      setStored(setting);
      setDraft(changeHistoryDraft(setting));
      setTarget(setting?.target ? { ...setting.target, name: to?.data?.name || null } : null);
      setSourceName(row?.data?.name || '');
      setColumns(sourceColumns(row?.data).map((a) => a?.name).filter(Boolean));
    })().catch((e) => current && setError(e.message));
    return () => { current = false; };
  }, [canEdit, sourceId]);

  if (!canEdit || stored === undefined) return null;

  const update = (patch) => { setSaved(false); setError(''); setDraft((d) => ({ ...d, ...patch })); };
  const problem = changeHistoryProblem(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(changeHistoryDraft(stored));

  const save = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    try {
      // the first switch-on makes the dataset's own history (or finds it, switched on before)
      let to = target;
      if (draft.enabled && !to) {
        to = await ensureHistoryDataset({ falcor, app, dmsEnv, sourceName, authPermissions: source?.auth_permissions });
        clearDatasetsListCache();
        setTarget(to);
      }
      const next = changeHistorySetting(draft, to);
      await falcor.call(['dms', 'data', 'edit'], [app, sourceId, { change_history: next }]);
      await falcor.invalidate(['dms', 'data', app, 'byId', sourceId]);
      setStored(next);
      setDraft(changeHistoryDraft(next));
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const columnOptions = columns.map((c) => ({ label: c, value: c }));

  return (
    <div className={t.panel}>
      <div className={t.header}>
        <span className={t.title}>Change history</span>
        <span className={t.spacer} />
        <Switch enabled={draft.enabled} setEnabled={(enabled) => update({ enabled })} label={'Record changes'} />
      </div>
      <p className={t.description}>
        When on, every change to a row of this dataset is recorded in a history dataset: who changed which
        column, from what, to what, and when. Typing in one field is recorded as one change per 30 seconds.
      </p>
      {draft.enabled && (
        <>
          <div className={t.row}>
            <span className={t.label}>Writes to</span>
            <div className={t.control}>
              {target
                ? <Link className={t.targetLink} to={`${baseUrl}/internal_source/${target.source_id}`}>{target.name || `Dataset #${target.source_id}`}</Link>
                : <span className={t.hint}>Saving makes a history dataset for it, “{historyDatasetName(sourceName)}”.</span>}
            </div>
          </div>
          <div className={t.row}>
            <span className={t.label}>Track</span>
            <div className={t.control}>
              <div className={t.inline}>
                <label className={t.choice}>
                  <input type={'radio'} checked={!draft.allColumns} onChange={() => update({ allColumns: false })} />
                  Chosen columns
                </label>
                <label className={t.choice}>
                  <input type={'radio'} checked={draft.allColumns} onChange={() => update({ allColumns: true })} />
                  All columns
                </label>
              </div>
              {draft.allColumns ? (
                <>
                  <span className={t.hint}>Except (columns that only record a time, for example)</span>
                  <MultiSelect value={draft.exclude} options={columnOptions} onChange={(v) => update({ exclude: v || [] })} />
                </>
              ) : (
                <MultiSelect value={draft.columns} options={columnOptions} onChange={(v) => update({ columns: v || [] })} />
              )}
            </div>
          </div>
        </>
      )}
      <div className={t.footer}>
        {error
          ? <span className={t.error}>{error}</span>
          : saved && !dirty ? <span className={t.status}>Saved. It applies from the next edit.</span> : null}
        <Button onClick={save} disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  );
}
