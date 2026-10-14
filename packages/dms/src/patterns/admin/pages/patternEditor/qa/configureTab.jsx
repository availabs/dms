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
import {
  FEATURE_GROUPS, storedFeatures, hasFeature, setFeature, setGroup, groupState, featureBlocked, describeFeatureEdits,
} from "../../../../qa/features";
import {
  FIELD_TYPES, FIELD_PLACES, canFilter, newField, parseOptions, installFields, fieldErrors, describeFieldEdits,
  fieldValuesInUse, settledFields, rowName, withType,
} from "../../../../qa/fields";
import { writeQaFieldColumns } from "../../../../qa/install";
import { STATUS_PILL } from "../../../../qa/pages/helpers";
import { QA_TOKENS_FONT, STAGE_MARKERS, qaPillClass } from "../../../../qa/qa.theme";
import { QaPatternSettings } from "../default/settings";
import { settingsEditorTheme } from "../default/settings.theme";
import { qaConfigureTheme } from "./configureTab.theme";

// The covered-sites columns this tab reads back, with the row id for updates.
const ROW_COLUMNS = ['id', ...COVERED_SITE_COLUMNS, 'app', 'subdomain', 'base_url'];

// The install row without its switches and fields, to tell a dataset set-up change from theirs.
const withoutSettings = (row) => ({ ...row, qa: { ...(row?.qa || {}), features: undefined, fields: undefined } });
// The row as a Save writes it: its field rows settled (patterns/qa/fields.js settledFields).
const settled = (row) => (Array.isArray(row?.qa?.fields) ? { ...row, qa: { ...row.qa, fields: settledFields(row.qa.fields) } } : row);

const trimSlashes = (s) => `${s || ''}`.replace(/^\/+|\/+$/g, '');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A QA install's Configure tab (QA installs only): its datasets, its ticket record (read-only),
// which of the site's patterns it covers (short key, label, order, page limit), and its feature
// switches (patterns/qa/features.js, stored on the row as `qa.features`), and its own ticket fields
// (patterns/qa/fields.js, `qa.fields`; a Save also adds their columns to the tickets dataset). The covered sites are the
// install's covered-sites dataset (patterns/qa/configure.js); with the page inventory on, switching
// a site on also adds its published pages. One Save writes it all: the dataset rows through
// dmsDataEditor (one reload at the end, not one per row as apiUpdate would), then the pattern row
// through apiUpdate when "finish set-up" or a switch changed it.
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
  const { Input, Select, Switch, MultiSelect, DndList, Icon } = UI;
  const { falcor } = useFalcor();
  const [draft, setDraft] = useImmer(value);
  // The row as this tab last saved it: the loaded row, then each Save's draft. Unsaved edits are the
  // draft's differences from it, not from `value`: the reload after a save brings fields the server
  // restamps (updated_at), which would read as an edit that never clears.
  const [baseline, setBaseline] = useState(value);
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
    // the tickets with the fields' columns too: a field with values keeps its type, and a pick list
    // keeps the values tickets hold
    const fieldsNow = installFields(settled(draft));
    const ticketRows = datasets.tickets ? await read(datasets.tickets, ['surface', 'page_key', ...fieldsNow.map((f) => f.name)]) : [];
    const used = usedKeys(pagesRows, ticketRows);
    // The site's other installs whose covered sites this user can read: a pattern one of them
    // covers can't be switched on here.
    const installs = patterns.filter((p) => p?.pattern_type === 'qa' && `${p.id}` !== `${value.id}` && p.qa?.datasets?.patterns);
    const elsewhere = coveredElsewhere(patterns, await Promise.all(installs.map(async (p) => ({ name: p.name, rows: await read(p.qa.datasets.patterns, COVERED_SITE_COLUMNS) }))));
    const result = configureEntries(patterns, rows);
    setLoaded({ ...result, used, elsewhere, pagesCount: pagesRows.length, fieldsInUse: fieldValuesInUse(ticketRows, fieldsNow) });
    setEntries(result.entries);
  };

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [value.id, datasets.patterns?.view_id]);

  const saved = loaded?.entries || [];
  const savedById = new Map(saved.map((e) => [e.pattern.id, e]));
  const errors = loaded ? configureErrors(entries, { elsewhere: loaded.elsewhere, others: loaded.others }) : {};
  // the install's own fields: the rows being edited, and as last saved
  const fieldRows = Array.isArray(draft?.qa?.fields) ? draft.qa.fields : [];
  const savedFields = installFields(baseline);
  const fieldErrs = fieldErrors(settledFields(fieldRows), { saved: savedFields, inUse: loaded?.fieldsInUse || {} });
  const setFieldRows = (fn) => setDraft((d) => {
    if (!d.qa) d.qa = {};
    d.qa.fields = fn(Array.isArray(d.qa.fields) ? d.qa.fields : []);
  });
  const hasErrors = Object.keys(errors).length > 0 || fieldErrs.some(Boolean);
  const toSave = settled(draft);
  const setupChanged = !isEqual(toSave, baseline);
  // the switches as stored (an install from before them reads as the Delivery QA set)
  const features = storedFeatures(draft);
  const featureOn = (key) => hasFeature(draft, key);
  const setFeatures = (next) => setDraft((d) => {
    if (!d.qa) d.qa = {};
    d.qa.features = next;
  });
  const edits = [
    ...(!isEqual(withoutSettings(toSave), withoutSettings(baseline)) ? ['dataset set-up'] : []),
    ...describeFeatureEdits(features, storedFeatures(baseline)),
    ...describeFieldEdits(installFields(toSave), savedFields),
    ...(loaded ? describeEdits(entries, saved) : []),
  ];
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
      // the page inventory as this Save leaves it: off adds no pages, just switched on adds every
      // covered site's
      const pagesOn = hasFeature(draft, 'page_inventory');
      const result = loaded ? await saveConfigure({
        entries, datasets, app,
        trackPages: pagesOn, backfillAll: pagesOn && !hasFeature(baseline, 'page_inventory'),
        loadRows: read, createRow: write, updateRow: write, loadPages,
        // A pattern on its own subdomain is served from another host, which this page can't tell.
        urlFor: (pattern, page) => (pattern.subdomain ? undefined
          : `${window.location.origin}${trimSlashes(pattern.base_url) ? `/${trimSlashes(pattern.base_url)}` : ''}/${page.url_slug}`),
      }) : { saved: 0, added: [] };
      // the fields' columns first, so a ticket can hold a value the moment the row names the field
      if (!isEqual(toSave?.qa?.fields, baseline?.qa?.fields)) {
        await writeQaFieldColumns({ falcor, app, datasets, fields: installFields(toSave) });
      }
      if (setupChanged) {
        await apiUpdate({ data: toSave });
        setBaseline(toSave);
        setDraft(toSave);
      }
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
    setDraft(baseline);
    setEntries(saved);
    setMessage('');
  };

  // One ticket field: label, its name (from the label until saved, then fixed), type (fixed once
  // tickets hold values), where it shows, and its options line when it's a pick list.
  const fieldRow = (row, i) => {
    const name = rowName(row);
    const used = row.name ? loaded?.fieldsInUse?.[row.name] : null;
    const typeLocked = Boolean(row.name && savedFields.some((f) => f.name === row.name) && used?.size);
    const set = (patch) => setFieldRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const setShow = (place, on) => set({ show: { ...row.show, [place]: on }, ...(place === 'form' && !on ? { required: false } : {}) });
    const place = (key, label, enabled, disabled, onToggle) => (
      <span key={key} className={disabled ? t.fieldPlaceOff : t.fieldPlace}>
        <Switch size={'small'} label={`${row.label || 'field'}: ${label}`} enabled={enabled && !disabled} disabled={disabled} setEnabled={(v) => onToggle(!!v)} />
        <span>{label}</span>
      </span>
    );
    return (
      <div key={row.name || `new-${i}`} className={t.rowWrap}>
        <div className={t.fieldRow}>
          <span className={t.grip} title={'drag to reorder'}><Icon icon={'MenuDots'} className={t.gripIcon} /></span>
          <span className={t.field}>
            <Input value={row.label || ''} aria-label={'field label'} placeholder={'label'} onChange={(ev) => set({ label: ev.target.value })} />
          </span>
          <span className={row.name ? t.fieldNameFixed : t.fieldName} title={row.name ? 'the dataset column: fixed once saved' : 'from the label'}>{name || '—'}</span>
          {typeLocked
            ? <span className={t.fieldTypeLocked} title={'tickets hold values for this field'}>{FIELD_TYPES.find((ft) => ft.key === row.type)?.label} · in use</span>
            : <Select value={row.type} options={FIELD_TYPES.map((ft) => ({ label: ft.label, value: ft.key }))} onChange={(v) => setFieldRows((list) => list.map((r, j) => (j === i ? withType(r, v) : r)))} />}
          <div className={t.fieldPlaces}>
            {FIELD_PLACES.map((p) => place(p.key, p.label, !!row.show?.[p.key], p.key === 'filter' && !canFilter(row.type), (on) => setShow(p.key, on)))}
            {place('required', 'required', !!row.required, !row.show?.form, (on) => set({ required: on }))}
          </div>
          <button type={'button'} className={t.fieldRemove} title={row.name ? 'remove: hides it; its values stay' : 'remove'}
            onClick={() => setFieldRows((list) => list.filter((_, j) => j !== i))}>
            <Icon icon={'TrashCan'} className={t.fieldRemoveIcon} />
          </button>
        </div>
        {row.type === 'pick_one' && (
          <div className={t.fieldOptionsRow}>
            <span className={t.fieldOptionsLabel}>options</span>
            <span className={t.fieldOptions}>
              <Input value={row._optionsText ?? (row.options || []).join(', ')} aria-label={`${row.label || 'field'} options`} placeholder={'comma-separated, e.g. phone, email, office hours'}
                onChange={(ev) => set({ _optionsText: ev.target.value, options: parseOptions(ev.target.value) })} />
            </span>
            {used?.size ? <span className={t.listHint}>in use: {[...used].join(', ')}</span> : null}
          </div>
        )}
        {fieldErrs[i] && <div className={t.fieldError}>{fieldErrs[i]}</div>}
      </div>
    );
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
          <span className={t.headerSubtitle}>which of this site's patterns the install covers, how it labels them, and which features it uses</span>
        </div>
        <span className={t.spacer} />
        <div className={t.stats}>
          {stat(loaded ? saved.filter((e) => e.enabled).length : null, 'sites covered')}
          {hasFeature(baseline, 'page_inventory') && stat(loaded ? loaded.pagesCount : null, 'pages tracked')}
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
              {featureOn('page_stages') && <div className={t.recordRow}>
                <span className={t.recordLabel}>page stages</span>
                <div className={t.recordStages}>
                  {PAGE_STAGES.map((s, i) => (
                    <React.Fragment key={s}>
                      {i > 0 && <span className={t.stageSep} aria-hidden>›</span>}
                      <span className={t.stage}><span className={`${t.stageMarker} ${STAGE_MARKERS[s] || ''}`} aria-hidden />{s}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>}
            </div>
          </div>
        </div>
      </div>

      <div className={t.card}>
        <div className={t.cardHeader}>
          <span className={t.cardHeaderLabel}>ticket fields</span>
          <span className={t.cardHeaderHint}>this install's own fields, beside the ticket record's; removing one hides it and keeps its values</span>
        </div>
        {!datasets.tickets ? (
          <p className={t.note}>The fields are columns of the install's tickets dataset, which is missing. Finish set-up above first.</p>
        ) : (
          <div className={t.tableScroll}>
            <div className={t.fieldsInner}>
              {fieldRows.length > 0 && (
                <div className={t.fieldsHead}>
                  <span /><span>label</span><span>name</span><span>type</span><span>shows on</span><span />
                </div>
              )}
              <DndList onDrop={(from, to) => setFieldRows((list) => {
                const next = [...list];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                return next;
              })}>
                {fieldRows.map(fieldRow)}
              </DndList>
              {!fieldRows.length && <p className={t.note}>No fields yet. A field becomes a column of the tickets; pick where it shows.</p>}
              <div className={t.cardFooter}>
                <button type={'button'} className={t.addFieldBtn} onClick={() => setFieldRows((list) => [...list, newField()])}>
                  <Icon icon={'Plus'} className={t.addFieldIcon} />add field
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={t.card}>
        <div className={t.cardHeader}>
          <span className={t.cardHeaderLabel}>covered sites</span>
          <span className={t.cardHeaderHint}>{featureOn('page_inventory')
            ? 'switching a site on adds its published pages now; later publishes add the rest'
            : 'switching a site on shows Report an issue on its pages'}</span>
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

      <div className={t.card}>
        <div className={t.cardHeader}>
          <span className={t.cardHeaderLabel}>features</span>
          <span className={t.cardHeaderHint}>tickets are always on; switching a feature off hides it and keeps its data</span>
        </div>
        <div className={t.featuresBody}>
          {/* a group shows once it has a feature to switch */}
          {FEATURE_GROUPS.filter((g) => g.features.length).map((g) => {
            const state = groupState(features, g.key);
            return (
              <div key={g.key} className={t.featureGroup}>
                <div className={t.featureGroupRow}>
                  <span className={t.featureGroupSwitch}>
                    <Switch size={'small'} label={g.label} enabled={state.on} setEnabled={(v) => setFeatures(setGroup(features, g.key, !!v))} />
                  </span>
                  <div className={t.featureGroupText}>
                    <span className={t.featureGroupName}>{g.label}</span>
                    <span className={t.featureGroupDesc}>{g.description}</span>
                  </div>
                  <span className={t.featureGroupCount}>{state.count} of {state.total} on</span>
                </div>
                <div className={t.featureList}>
                  {g.features.map((f) => {
                    const blocked = featureBlocked(features, f.key);
                    const on = featureOn(f.key);
                    return (
                      <div key={f.key} className={t.featureRow}>
                        {/* the shared Switch has no disabled look; a blocked one is dimmed here */}
                        <span className={blocked ? t.featureSwitchBlocked : t.featureSwitch}>
                          <Switch size={'small'} label={f.label} enabled={on} disabled={Boolean(blocked)} setEnabled={(v) => setFeatures(setFeature(features, f.key, !!v))} />
                        </span>
                        <div className={t.featureText}>
                          <span className={on ? t.featureName : t.featureNameOff}>{f.label}</span>
                          <span className={t.featureDesc}>{f.description}</span>
                          {blocked && <span className={t.featureBlocked}>{blocked}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
