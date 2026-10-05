import React, { useContext, useEffect, useState } from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { useFalcor } from "@availabs/avl-falcor";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { getInstance } from "../../../../../utils/type-utils";
import { dmsDataEditor } from "../../../../../api";
import { loadDatasetRows } from "../../../../../api/datasetRows";
import { COVERED_SITE_COLUMNS } from "../../../../qa/tracking";
import { configureEntries, configureErrors, coveredElsewhere, keyLocked, saveConfigure, usedKeys } from "../../../../qa/configure";
import { DEFAULT_STATUSES, OUTCOMES, PAGE_STAGES } from "../../../../qa/ticketRecord";
import { QaPatternSettings } from "../default/settings";
import { settingsEditorTheme } from "../default/settings.theme";
import { qaConfigureTheme } from "./configureTab.theme";

// The covered-sites columns this tab reads back, with the row id for updates.
const ROW_COLUMNS = ['id', ...COVERED_SITE_COLUMNS, 'app', 'subdomain', 'base_url'];

const trimSlashes = (s) => `${s || ''}`.replace(/^\/+|\/+$/g, '');

// A QA install's Configure tab (QA installs only): its datasets, which of the site's patterns
// it covers (short key, label, order, page limit), and its ticket record, read-only. The
// covered sites are the install's covered-sites dataset (patterns/qa/configure.js); switching a
// site on also adds its published pages. One Save writes it all: the dataset rows through
// dmsDataEditor (one reload at the end, not one per row as apiUpdate would), then the pattern
// row through apiUpdate when "finish set-up" changed it.
// Keyed by the install, so moving to another install's tab (back/forward, no reload) starts from
// that install's row: the body's draft and the datasets it loads from are set once, on mount.
export function QaConfigureTab(props) {
  return <QaConfigureBody key={props.value?.id} {...props} />;
}

function QaConfigureBody({ value = {}, apiLoad, apiUpdate }) {
  const { app, siteType } = useContext(AdminContext);
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...qaConfigureTheme, ...(theme?.admin?.settingsEditor || {}), ...(theme?.admin?.qaConfigure || {}) };
  const { Input, Switch, MultiSelect } = UI;
  const { falcor } = useFalcor();
  const [draft, setDraft] = useImmer(value);
  const [loaded, setLoaded] = useState(null); // { entries, others, used, elsewhere }
  const [entries, setEntries] = useImmer([]);
  const [pagesFor, setPagesFor] = useState({}); // pattern id → its pages, for the page-limit picker
  const [openLimit, setOpenLimit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const datasets = draft?.qa?.datasets || {};

  const read = (ref, columns) => loadDatasetRows(falcor, { env: `${app}+${ref.slug}`, viewId: ref.view_id, columns, fresh: true });
  const write = (ref, data) => dmsDataEditor(falcor, {
    format: { app, type: `${ref.slug}|${ref.view_id}:data`, isDms: true, source_id: ref.source_id, view_id: ref.view_id, env: `${app}+${ref.slug}` },
  }, data);
  const loadPages = async (pattern) => {
    if (pattern.pattern_type !== 'page') return [];
    const pages = await apiLoad({
      format: { app, type: `${getInstance(pattern.type)}|page`, attributes: [] },
      children: [{ action: 'list', path: '/*' }],
    }, '/');
    return pages || [];
  };

  const load = async () => {
    if (!datasets.patterns) return setLoaded(null);
    const items = await apiLoad({
      format: { app, type: siteType, attributes: [{ key: 'patterns', type: 'dms-format', isArray: true, format: `${app}+pattern` }] },
      children: [{ action: 'list', path: '/*' }],
    }, '/');
    const patterns = items?.[0]?.patterns || [];
    const rows = await read(datasets.patterns, ROW_COLUMNS);
    const used = usedKeys(
      datasets.pages ? await read(datasets.pages, ['surface', 'page_key']) : [],
      datasets.tickets ? await read(datasets.tickets, ['surface', 'page_key']) : [],
    );
    // The site's other installs whose covered sites this user can read: a pattern one of them
    // covers can't be switched on here.
    const installs = patterns.filter((p) => p?.pattern_type === 'qa' && `${p.id}` !== `${value.id}` && p.qa?.datasets?.patterns);
    const elsewhere = coveredElsewhere(patterns, await Promise.all(installs.map(async (p) => ({ name: p.name, rows: await read(p.qa.datasets.patterns, COVERED_SITE_COLUMNS) }))));
    const result = configureEntries(patterns, rows);
    setLoaded({ ...result, used, elsewhere });
    setEntries(result.entries);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [value.id, datasets.patterns?.view_id]);

  const errors = loaded ? configureErrors(entries, { elsewhere: loaded.elsewhere, others: loaded.others }) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const isDirty = !isEqual(draft, value) || (loaded && !isEqual(entries, loaded.entries));
  const setEntry = (i, key, v) => setEntries((d) => { d[i][key] = v; });

  const toggleLimit = async (pattern) => {
    if (openLimit === pattern.id) return setOpenLimit(null);
    setOpenLimit(pattern.id);
    if (!pagesFor[pattern.id]) {
      const pages = await loadPages(pattern).catch(() => []);
      setPagesFor((p) => ({ ...p, [pattern.id]: pages }));
    }
  };

  const save = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = loaded ? await saveConfigure({
        entries, datasets, app,
        loadRows: read, createRow: write, updateRow: write, loadPages,
        // A pattern on its own subdomain is served from another host, which this page can't tell.
        urlFor: (pattern, page) => (pattern.subdomain ? undefined
          : `${window.location.origin}${trimSlashes(pattern.base_url) ? `/${trimSlashes(pattern.base_url)}` : ''}/${page.url_slug}`),
      }) : { saved: 0, added: [] };
      if (!isEqual(draft, value)) await apiUpdate({ data: draft });
      const added = result.added.map((a) => `added ${a.pages} page${a.pages === 1 ? '' : 's'} from ${a.pattern}`);
      setMessage(['saved', ...added].join(' · '));
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDraft(value);
    setEntries(loaded?.entries || []);
    setMessage('');
  };

  return (
    <div className={t.wrapper}>
      <div className={t.header}>
        <span className={t.headerTitle}>{value.name || 'QA'}</span>
        <span className={t.headerTypePill}>configure</span>
        <span className={t.headerSubtitle}>which of the site's patterns this install covers, and how it labels them</span>
      </div>

      <div className={isDirty ? t.saveBarDirty : t.saveBar}>
        <span className={isDirty ? t.saveBarTextDirty : t.saveBarText}>
          {busy ? 'saving…' : isDirty && hasErrors ? 'fix the rows marked below to save' : isDirty ? 'unsaved changes' : message || 'no unsaved changes'}
        </span>
        <span className={t.spacer} />
        <button type={'button'} className={t.btnReset} disabled={!isDirty || busy} onClick={reset}>reset</button>
        <button type={'button'} className={t.btnSave} disabled={!isDirty || busy || hasErrors} onClick={save}>save changes</button>
      </div>

      {error && <div className={t.errorBox}>{error}</div>}

      <QaPatternSettings value={draft} onChange={setDraft} apiLoad={apiLoad} />

      <div className={t.card}>
        <div className={t.cardHeader}>
          <span className={t.cardHeaderLabel}>covered sites</span>
          <span className={t.cardHeaderHint}>switching a site on adds its published pages; later publishes add the rest</span>
        </div>
        {!datasets.patterns ? (
          <div className={t.note}>Finish set-up above first: the covered sites are kept in the install's datasets.</div>
        ) : !loaded ? (
          <div className={t.note}>{error ? 'Couldn\'t load the covered sites.' : 'loading…'}</div>
        ) : (
          <>
            <div className={t.tableHead}>
              <span>on</span><span>pattern</span><span>short key</span><span>label</span><span>order</span><span>pages</span>
            </div>
            <div className={t.cardBody}>
              {entries.map((e, i) => {
                const { pattern } = e;
                const locked = keyLocked(e, loaded.used);
                const slugs = `${e.include_slugs || ''}`.split(',').map((s) => s.trim()).filter(Boolean);
                return (
                  <div key={pattern.id} className={t.rowWrap}>
                    <div className={t.row}>
                      <Switch size={'small'} enabled={e.enabled} setEnabled={(v) => setEntry(i, 'enabled', !!v)} />
                      <div className={t.patternCell}>
                        <span className={t.patternName}>{pattern.name}</span>
                        <span className={t.patternMeta}>{pattern.pattern_type} · /{trimSlashes(pattern.base_url)}{pattern.subdomain ? ` on ${pattern.subdomain}` : ''}</span>
                      </div>
                      <Input value={e.surface} disabled={locked} title={locked ? 'in use by this install\'s pages or tickets' : undefined}
                             onChange={(ev) => setEntry(i, 'surface', ev.target.value)} />
                      <Input value={e.surface_label} onChange={(ev) => setEntry(i, 'surface_label', ev.target.value)} />
                      <Input type={'number'} value={e.sort_order} onChange={(ev) => setEntry(i, 'sort_order', ev.target.value)} />
                      {pattern.pattern_type === 'page' ? (
                        <button type={'button'} className={t.limitBtn} onClick={() => toggleLimit(pattern)}>
                          {slugs.length ? `${slugs.length} page${slugs.length === 1 ? '' : 's'}` : 'every page'}
                        </button>
                      ) : <span className={t.patternMeta}>—</span>}
                    </div>
                    {errors[pattern.id] && <div className={t.rowError}>{errors[pattern.id]}</div>}
                    {openLimit === pattern.id && (
                      <div className={t.limitRow}>
                        <div className={t.limitPicker}>
                          <MultiSelect
                            value={slugs}
                            loading={!pagesFor[pattern.id]}
                            placeholder={'every page'}
                            options={(pagesFor[pattern.id] || []).map((p) => ({ label: `${p.title || p.url_slug} · /${p.url_slug}`, value: p.url_slug }))}
                            onChange={(vals) => setEntry(i, 'include_slugs', (vals || []).join(','))}
                          />
                        </div>
                        <span className={t.listHint}>none picked = every page</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {loaded.others.length > 0 && (
              <div className={t.cardFooter}>
                <span className={t.listHint}>
                  Also in the list, left as they are (a deleted pattern, or one you can't view): {loaded.others.map((r) => r.surface_label || r.surface || r.pattern).join(', ')}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      <div className={t.card}>
        <div className={t.cardHeader}>
          <span className={t.cardHeaderLabel}>ticket record</span>
          <span className={t.cardHeaderHint}>set in code for now</span>
        </div>
        <div className={t.recordGrid}>
          <span className={t.fieldLabel}>statuses</span>
          <span className={t.recordList}>{DEFAULT_STATUSES.map((s) => s.value).join(' · ')}</span>
          <span className={t.fieldLabel}>outcomes</span>
          <span className={t.recordList}>{OUTCOMES.join(' · ')}</span>
          <span className={t.fieldLabel}>page stages</span>
          <span className={t.recordList}>{PAGE_STAGES.join(' · ')}</span>
        </div>
      </div>
    </div>
  );
}
