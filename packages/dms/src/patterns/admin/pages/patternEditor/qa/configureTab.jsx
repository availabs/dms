import React, { useContext, useEffect, useState } from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { useFalcor } from "@availabs/avl-falcor";
import { AdminContext } from "../../../context";
import { ThemeContext, loadThemeFonts } from "../../../../../ui/useTheme";
import { getInstance } from "../../../../../utils/type-utils";
import { dmsDataEditor } from "../../../../../api";
import { COVERED_SITE_COLUMNS } from "../../../../qa/tracking";
import { QA_DATASETS, qaDatasetSlug, datasetRows } from "../../../../qa/datasets";
import {
  configureEntries, configureErrors, coveredElsewhere, keyLocked, saveConfigure, usedKeys,
  groupEntries, switchEntry, moveEntry, fieldEdited, describeEdits,
} from "../../../../qa/configure";
import { DEFAULT_STATUSES, OUTCOMES, PAGE_STAGES } from "../../../../qa/ticketRecord";
import { STATUS_PILL } from "../../../../qa/pages/helpers";
import { QA_TOKENS_FONT, STAGE_MARKERS, qaPillClass } from "../../../../qa/qa.theme";
import { QaPatternSettings } from "../default/settings";
import { settingsEditorTheme } from "../default/settings.theme";
import { qaConfigureTheme } from "./configureTab.theme";

// The covered-sites columns this tab reads back, with the row id for updates.
const ROW_COLUMNS = ['id', ...COVERED_SITE_COLUMNS, 'app', 'subdomain', 'base_url'];

// The parts of an install the feature switches will turn off (later; shown as a placeholder).
const FEATURES = ['Tickets', 'Page inventory', 'Page stages', 'Stories', 'Overview'];

const trimSlashes = (s) => `${s || ''}`.replace(/^\/+|\/+$/g, '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A QA install's Configure tab (QA installs only): its datasets, its ticket record (read-only), and
// which of the site's patterns it covers (short key, label, order, page limit). The covered sites
// are the install's covered-sites dataset (patterns/qa/configure.js); switching a site on also adds
// its published pages. One Save writes it all: the dataset rows through dmsDataEditor (one reload
// at the end, not one per row as apiUpdate would), then the pattern row through apiUpdate when
// "finish set-up" changed it.
// Keyed by the install, so moving to another install's tab (back/forward, no reload) starts from
// that install's row: the body's draft and the datasets it loads from are set once, on mount.
export function QaConfigureTab(props) {
  // The --qa-* colours (status, stage markers). The QA pattern loads them when its own config runs,
  // which a /list page never does. Deduped by id.
  loadThemeFonts([QA_TOKENS_FONT]);
  return <QaConfigureBody key={props.value?.id} {...props} />;
}

function QaConfigureBody({ value = {}, apiLoad, apiUpdate }) {
  const { app, siteType } = useContext(AdminContext);
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...qaConfigureTheme, ...(theme?.admin?.settingsEditor || {}), ...(theme?.admin?.qaConfigure || {}) };
  const { Input, Switch, MultiSelect, DndList, Icon } = UI;
  const { falcor } = useFalcor();
  const [draft, setDraft] = useImmer(value);
  const [loaded, setLoaded] = useState(null); // { entries, others, used, elsewhere, pagesCount }
  const [entries, setEntries] = useState([]);
  const [pagesFor, setPagesFor] = useState({}); // pattern id → its pages, for the page-limit picker
  const [openLimit, setOpenLimit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saves, setSaves] = useState(0); // bumped after a Save, so the datasets card re-counts
  const datasets = draft?.qa?.datasets || {};

  const read = (ref, columns) => datasetRows(apiLoad, app, ref, columns);
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
    const pagesRows = datasets.pages ? await read(datasets.pages, ['surface', 'page_key']) : [];
    const used = usedKeys(pagesRows, datasets.tickets ? await read(datasets.tickets, ['surface', 'page_key']) : []);
    // The site's other installs whose covered sites this user can read: a pattern one of them
    // covers can't be switched on here.
    const installs = patterns.filter((p) => p?.pattern_type === 'qa' && `${p.id}` !== `${value.id}` && p.qa?.datasets?.patterns);
    const elsewhere = coveredElsewhere(patterns, await Promise.all(installs.map(async (p) => ({ name: p.name, rows: await read(p.qa.datasets.patterns, COVERED_SITE_COLUMNS) }))));
    const result = configureEntries(patterns, rows);
    setLoaded({ ...result, used, elsewhere, pagesCount: pagesRows.length });
    setEntries(result.entries);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [value.id, datasets.patterns?.view_id]);

  const saved = loaded?.entries || [];
  const savedById = new Map(saved.map((e) => [e.pattern.id, e]));
  const errors = loaded ? configureErrors(entries, { elsewhere: loaded.elsewhere, others: loaded.others }) : {};
  const hasErrors = Object.keys(errors).length > 0;
  const setupChanged = !isEqual(draft, value);
  const edits = [...(setupChanged ? ['dataset set-up'] : []), ...(loaded ? describeEdits(entries, saved) : [])];
  const isDirty = edits.length > 0;
  const { on, off } = groupEntries(entries);
  const setEntry = (id, key, v) => setEntries((list) => list.map((e) => (e.pattern.id === id ? { ...e, [key]: v } : e)));

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
      if (setupChanged) await apiUpdate({ data: draft });
      const added = result.added.map((a) => `added ${plural(a.pages, 'page')} from ${a.pattern}`);
      setMessage(['saved', ...added].join(' · '));
      await load();
      setSaves((n) => n + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setDraft(value);
    setEntries(saved);
    setMessage('');
  };

  // One covered-sites row: switched-on rows are editable (and dragged by DndList), switched-off
  // ones are one quiet line.
  const siteRow = (e) => {
    const { pattern } = e;
    const before = savedById.get(pattern.id);
    const locked = keyLocked(e, loaded.used);
    const slugs = `${e.include_slugs || ''}`.split(',').map((s) => s.trim()).filter(Boolean);
    return (
      <div key={pattern.id} className={t.rowWrap}>
        <div className={t.row}>
          <span className={e.enabled ? t.grip : t.gripOff} title={e.enabled ? 'drag to reorder' : undefined} aria-hidden={!e.enabled}>
            <Icon icon={'MenuDots'} className={t.gripIcon} />
          </span>
          <Switch size={'small'} enabled={e.enabled} setEnabled={(v) => setEntries((list) => switchEntry(list, pattern.id, !!v))} />
          <div className={t.patternCell}>
            <span className={e.enabled ? t.patternName : t.patternNameOff}>{pattern.name}</span>
            <span className={t.patternMeta}>{pattern.pattern_type} · /{trimSlashes(pattern.base_url)}{pattern.subdomain ? ` on ${pattern.subdomain}` : ''}</span>
          </div>
          {e.enabled ? (
            <span className={fieldEdited(e, before, 'surface_label') ? t.fieldDirty : t.field}>
              <Input value={e.surface_label} aria-label={`${pattern.name} label`} onChange={(ev) => setEntry(pattern.id, 'surface_label', ev.target.value)} />
            </span>
          ) : <span className={t.offNote}>not covered</span>}
          {!e.enabled ? <span /> : locked ? (
            <span className={t.keyLocked} title={'in use by this install\'s pages and tickets'}>
              <Icon icon={'Lock'} className={t.keyLockIcon} />
              <span className={t.keyText}>{e.surface}</span>
              <span className={t.keyHint}>in use</span>
            </span>
          ) : (
            <span className={fieldEdited(e, before, 'surface') ? t.fieldDirty : t.field}>
              <Input value={e.surface} aria-label={`${pattern.name} short key`} onChange={(ev) => setEntry(pattern.id, 'surface', ev.target.value)} />
            </span>
          )}
          {!e.enabled ? <span /> : pattern.pattern_type === 'page' ? (
            <button type={'button'} className={t.limitBtn} onClick={() => toggleLimit(pattern)}>
              {slugs.length ? plural(slugs.length, 'page') : 'every page'}
              <Icon icon={'CaretDown'} className={t.limitIcon} />
            </button>
          ) : <span className={t.offNote}>all of it</span>}
        </div>
        {errors[pattern.id] && <div className={t.rowError}>{errors[pattern.id]}</div>}
        {e.enabled && openLimit === pattern.id && (
          <div className={t.limitRow}>
            <div className={t.limitPicker}>
              <MultiSelect
                value={slugs}
                loading={!pagesFor[pattern.id]}
                placeholder={'every page'}
                options={(pagesFor[pattern.id] || []).map((p) => ({ label: `${p.title || p.url_slug} · /${p.url_slug}`, value: p.url_slug }))}
                onChange={(vals) => setEntry(pattern.id, 'include_slugs', (vals || []).join(','))}
              />
            </div>
            <span className={t.listHint}>none picked = every page</span>
          </div>
        )}
      </div>
    );
  };

  const linked = QA_DATASETS.filter((d) => datasets[d.key]).length;
  const stat = (n, label, shown = n) => (
    <div className={t.stat}>
      <p className={n == null ? t.statValueEmpty : t.statValue}>{n == null ? '—' : shown}</p>
      <p className={t.statLabel}>{label}</p>
    </div>
  );

  return (
    <div className={t.wrapper}>
      <div className={t.header}>
        <div className={t.headerMain}>
          <div className={t.headerTitleRow}>
            <span className={t.headerTitle}>{value.name || 'QA'}</span>
            <span className={t.headerTypePill}>{Array.isArray(value.pattern_type) ? value.pattern_type[0] : value.pattern_type}</span>
          </div>
          <span className={t.headerSubtitle}>which of this site's patterns the install covers, and how it labels them</span>
        </div>
        <span className={t.spacer} />
        <div className={t.stats}>
          {stat(loaded ? saved.filter((e) => e.enabled).length : null, 'sites covered')}
          {stat(loaded ? loaded.pagesCount : null, 'pages tracked')}
          {stat(linked, 'datasets', `${linked}/${QA_DATASETS.length}`)}
        </div>
      </div>

      <div className={t.saveBarSticky}>
        <div className={isDirty ? t.saveBarDirty : t.saveBar}>
          {isDirty ? (
            <span className={`${t.saveBarTextDirty} ${t.saveBarLine}`}>
              <span className={t.dirtyDot} aria-hidden />
              <span>
                <span className={t.dirtyCount}>{plural(edits.length, 'unsaved change')}</span>
                {' · '}{busy ? 'saving…' : hasErrors ? 'fix the rows marked below to save' : edits.join(', ')}
              </span>
            </span>
          ) : (
            <span className={`${t.saveBarText} ${t.saveBarLine}`}>
              <Icon icon={'CircleCheck'} className={t.savedIcon} />
              {message || 'All changes saved'}
            </span>
          )}
          <span className={t.spacer} />
          {isDirty && <button type={'button'} className={t.btnReset} disabled={busy} onClick={reset}>reset</button>}
          {isDirty && <button type={'button'} className={t.btnSave} disabled={busy || hasErrors} onClick={save}>save changes</button>}
        </div>
      </div>

      {error && <div className={t.errorBox}>{error}</div>}

      <div className={t.topRow}>
        <div className={t.topDatasets}>
          <QaPatternSettings value={draft} onChange={setDraft} apiLoad={apiLoad} reloadKey={saves} />
        </div>
        <div className={t.topRecord}>
          <div className={`${t.card} ${t.recordCard}`}>
            <div className={t.cardHeader}>
              <span className={t.cardHeaderLabel}>ticket record</span>
              <span className={t.spacer} />
              <span className={t.recordTag}>set in code for now</span>
            </div>
            <div className={t.cardBody}>
              <div className={t.recordRow}>
                <span className={t.recordLabel}>statuses</span>
                <div className={t.recordChips}>
                  {DEFAULT_STATUSES.map((s) => <span key={s.value} className={qaPillClass(STATUS_PILL[s.value])}>{s.value}</span>)}
                </div>
              </div>
              <div className={t.recordRow}>
                <span className={t.recordLabel}>outcomes</span>
                <div className={t.recordChips}>
                  {OUTCOMES.map((o) => <span key={o} className={qaPillClass('qa_tag')}>{o}</span>)}
                </div>
              </div>
              <div className={t.recordRow}>
                <span className={t.recordLabel}>page stages</span>
                <div className={t.recordStages}>
                  {PAGE_STAGES.map((s, i) => (
                    <React.Fragment key={s}>
                      {i > 0 && <span className={t.stageSep} aria-hidden>›</span>}
                      <span className={t.stage}><span className={`${t.stageMarker} ${STAGE_MARKERS[s] || ''}`} aria-hidden />{s}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={t.card}>
        <div className={t.cardHeader}>
          <span className={t.cardHeaderLabel}>covered sites</span>
          <span className={t.cardHeaderHint}>switching a site on adds its published pages now; later publishes add the rest</span>
        </div>
        {!datasets.patterns ? (
          <p className={t.note}>
            The covered sites live in the install's <span className={t.noteCode}>{qaDatasetSlug(getInstance(value.type), 'patterns')}</span> dataset,
            which is missing. Finish set-up above first.
          </p>
        ) : !loaded ? (
          <p className={t.note}>{error ? 'Couldn\'t load the covered sites.' : 'loading…'}</p>
        ) : (
          <div className={t.tableScroll}>
            <div className={t.tableInner}>
              <div className={t.tableHead}>
                <span /><span>on</span><span>site</span><span>label</span><span>short key</span><span>pages</span>
              </div>
              <DndList onDrop={(from, to) => setEntries((list) => moveEntry(list, from, to))}>
                {on.map(siteRow)}
              </DndList>
              {off.map(siteRow)}
              {loaded.others.length > 0 && (
                <div className={t.cardFooter}>
                  <span className={t.listHint}>
                    Also in the list, left as they are (a deleted pattern, or one you can't view): {loaded.others.map((r) => r.surface_label || r.surface || r.pattern).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={t.featuresCard}>
        <div className={t.featuresHeader}>
          <span className={t.cardHeaderLabel}>features</span>
          <span className={qaPillClass('qa_planned')}>planned</span>
          <span className={t.cardHeaderHint}>turn parts of the install off; off hides, never deletes</span>
        </div>
        <div className={t.featuresGrid}>
          {FEATURES.map((f) => (
            <div key={f} className={t.featureTile}>
              <span className={t.featureSwitch} aria-hidden />
              <span className={t.featureName}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
