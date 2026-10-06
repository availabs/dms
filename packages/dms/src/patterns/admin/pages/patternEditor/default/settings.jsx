import React, {useContext, useEffect, useState} from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { Link, useNavigate, useRevalidator } from "react-router";
import { useFalcor } from "@availabs/avl-falcor";
import { readSitePatternRefs, mergeSitePatternRefs } from "../../../../../utils/tenantProvisioning";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { nameToSlug, getInstance, nextAvailableCopyName } from "../../../../../utils/type-utils";
import { settingsEditorTheme } from './settings.theme'
import { installQa } from "../../../../qa/install";
import { QA_DATASETS, qaDatasetSlug } from "../../../../qa/datasets";
import { qaConfigureTheme } from "../qa/configureTab.theme";
import { getSourceIdsBySlug } from "../../../../../api/sourceIdBySlug";
import { patternActions } from '../../../../../utils/adminPermissions'

// Additional {subdomain, base_url} mounts — the same pattern served at more
// locations than its primary subdomain + base URL (e.g. freightatlas2:/ AND
// www:/freightatlas). Saved through the page-level Save bar as `locations`.
// See planning/tasks/current/pattern-multi-location-mounts.md.
function LocationsEditor({ value, onChange }) {
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { Input, Button } = UI;
  const rows = Array.isArray(value) ? value : [];
  const update = (i, key, v) => onChange(rows.map((r, ri) => ri === i ? { ...r, [key]: v } : r));
  return (
    <div className={t.card}>
      <div className={t.cardHeader}>
        <span className={t.cardHeaderLabel}>additional locations</span>
        <span className={t.cardHeaderHint}>also serve this pattern at these subdomain + base URL pairs ("www" = the root domain)</span>
      </div>
      <div className={t.listSection}>
        {rows.map((loc, i) => (
          <div key={i} className={t.listRow}>
            <Input value={loc?.subdomain || ''} placeholder={'subdomain (e.g. www)'}
                   onChange={e => update(i, 'subdomain', e.target.value)} />
            <Input value={loc?.base_url || ''} placeholder={'base URL (e.g. /freightatlas)'}
                   onChange={e => update(i, 'base_url', e.target.value)} />
            <button type={'button'} className={t.listRemoveBtn} title={'remove location'}
                    onClick={() => onChange(rows.filter((_, ri) => ri !== i))}>remove</button>
          </div>
        ))}
        <button type={'button'} className={t.listAddBtn}
                onClick={() => onChange([...rows, { subdomain: '', base_url: '' }])}>
          + add location
        </button>
      </div>
    </div>
  );
}


// Subdomains this pattern has MOVED OFF. Each one redirects to the pattern's
// primary base URL on the root domain instead of 404ing, so links to the old host
// keep working after a move onto a path (e.g. tsmo2:/ → www:/tsmo). A subdomain
// the pattern still mounts is ignored — the live route always wins. Saved through
// the page-level Save bar as `retired_subdomains`.
// See utils/retiredSubdomain.js.
function RetiredSubdomainsEditor({ value, onChange }) {
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { Input } = UI;
  const rows = Array.isArray(value) ? value : [];
  return (
    <div className={t.card}>
      <div className={t.cardHeader}>
        <span className={t.cardHeaderLabel}>retired subdomains</span>
        <span className={t.cardHeaderHint}>old subdomains for this pattern — each redirects to its base URL on the root domain</span>
      </div>
      <div className={t.listSection}>
        {rows.map((sub, i) => (
          <div key={i} className={t.listRow}>
            <Input value={sub || ''} placeholder={'subdomain (e.g. tsmo2)'}
                   onChange={e => onChange(rows.map((r, ri) => ri === i ? e.target.value : r))} />
            <button type={'button'} className={t.listRemoveBtn} title={'remove subdomain'}
                    onClick={() => onChange(rows.filter((_, ri) => ri !== i))}>remove</button>
          </div>
        ))}
        <button type={'button'} className={t.listAddBtn}
                onClick={() => onChange([...rows, ''])}>
          + add retired subdomain
        </button>
      </div>
    </div>
  );
}

/**
 * Load the site record via apiLoad.
 * Returns the first site item (with flattened data) or null.
 */
async function loadSiteData(apiLoad, app, siteType) {
    const siteConfig = {
        format: { app, type: siteType, attributes: [] },
        children: [{ action: 'list', path: '/*' }]
    };
    const items = await apiLoad(siteConfig, '/');
    return items?.[0] || null;
}

/**
 * Load the site's sibling patterns fully expanded (name, base_url, type) —
 * read-only, for collision checks. `loadSiteData` above deliberately keeps
 * `patterns` as bare {ref, id} entries since its result is reused as a write
 * payload elsewhere; this is a separate fetch so that shape stays untouched.
 */
async function loadSitePatterns(apiLoad, app, siteType) {
    const siteConfig = {
        format: {
            app,
            type: siteType,
            attributes: [
                { key: 'patterns', type: 'dms-format', isArray: true, format: `${app}+pattern` }
            ]
        },
        children: [{ action: 'list', path: '/*' }]
    };
    const items = await apiLoad(siteConfig, '/');
    return items?.[0]?.patterns || [];
}

export const PatternSettingsEditor = ({ value = {}, onChange, apiLoad, ...rest}) => {
  const { apiUpdate, app, type, siteType, API_HOST, parentBaseUrl, dmsEnvs = [], dmsEnvById = {}, isMultiTenant, user, authPermissions } = useContext(AdminContext);
  const { UI, theme } = useContext(ThemeContext)
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const tenantSub = (() => {
    if (!isMultiTenant) return '';
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
    const minParts = isLocalhost ? 2 : 3;
    const parts = hostname.split('.');
    // Bare IPv4 host (e.g. 1.2.3.4) would otherwise misread its last octet as
    // a subdomain; real TLDs are never all-digits.
    if (/^\d+$/.test(parts[parts.length - 1])) return '';
    return parts.length >= minParts ? parts[0] : '';
  })();
  const { FieldSet, Button, Icon } = UI;
  const navigate = useNavigate();
  const [tmpValue, setTmpValue] = useImmer(value);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [duplicateProgress, setDuplicateProgress] = useState(0);

  const showDmsEnvConfig = ['datasets', 'forms', 'page', 'mapeditor'].includes(value.pattern_type);
  const isDirty = !isEqual(tmpValue, value);
  // The site's admin pattern row: it can't be duplicated or deleted, isn't
  // mounted anywhere but its own base URL, and moving that URL moves the admin
  // panel itself — so the save asks for a second click first.
  const isAdminPattern = value.pattern_type === 'admin';
  // Same Delete/Duplicate rules as the pattern list's row actions (never for
  // auth/admin rows). See utils/adminPermissions.js.
  const can = patternActions(user, app, authPermissions, value);
  const adminPathChanged = isAdminPattern && (tmpValue.base_url || '') !== (value.base_url || '');
  const [confirmAdminMove, setConfirmAdminMove] = useState(false);
  const saveChanges = () => {
    if (adminPathChanged && !confirmAdminMove) { setConfirmAdminMove(true); return; }
    setConfirmAdminMove(false);
    apiUpdate({ data: tmpValue });
  };

  const siteFormat = { app, type: siteType, attributes: [] };

  // `loadSiteData` goes through apiLoad — with sync on, the local store's copy,
  // which misses refs written straight to the server (createSite's core refs,
  // the admin backfill). Merge the edited list against the server's before
  // writing, so delete/duplicate can't drop them (see mergeSitePatternRefs).
  const { falcor } = useFalcor();
  const withServerRefs = async (site, edited, removed = []) => {
    try {
      const server = await readSitePatternRefs(falcor, app, site.id);
      return mergeSitePatternRefs({ edited, baseline: site.patterns || [], server, removed });
    } catch (err) {
      console.error('Could not re-read site patterns before saving; saving the list as loaded:', err);
      return edited;
    }
  };

  const handleDelete = async () => {
      const site = await loadSiteData(apiLoad, app, siteType);
      if (!site) return;

      const rawPatterns = site.patterns || [];
      const updatedPatterns = await withServerRefs(site, rawPatterns.filter(p => +p.id !== +value.id), [value.id]);

      await apiUpdate({
          data: { id: site.id, patterns: updatedPatterns },
          config: { format: siteFormat },
          skipNavigate: true
      });

      navigate(parentBaseUrl || '/');
  };

  const handleDuplicate = async () => {
      setIsDuplicating(true);
      setDuplicateProgress(0);
      try {
          const siteInstance = getInstance(siteType) || type;
          const oldInstance = getInstance(value.type) || value?.base_url?.replace(/\//g, '');

          const siblingPatterns = await loadSitePatterns(apiLoad, app, siteType);
          const existingSlugs = siblingPatterns
              .filter(p => +p.id !== +value.id)
              .map(p => getInstance(p.type) || p?.base_url?.replace(/\//g, ''))
              .filter(Boolean);
          const { name: newName, slug: newSlug, suffix } = nextAvailableCopyName(value.name, existingSlugs);

          // 1. Queue the duplicate task — returns { task_id } immediately.
          const dmsServerPath = `${API_HOST}/dama-admin`;
          const dupRes = await fetch(`${dmsServerPath}/dms/${app}+${oldInstance}/duplicate`, {
              method: "POST",
              body: JSON.stringify({ newApp: app, newType: newSlug }),
              headers: { "Content-Type": "application/json" },
          });
          const dupBody = await dupRes.json().catch(() => ({}));
          if (!dupRes.ok || dupBody?.err) {
              console.error('[duplicate] failed to queue task:', dupBody?.err || dupRes.status);
              window.alert(`Pattern duplicate failed: ${dupBody?.err || `HTTP ${dupRes.status}`} (server: ${API_HOST}). Pattern not created.`);
              return;
          }

          // 2. Poll until pages/sections are fully cloned.
          const { task_id } = dupBody;
          for (;;) {
              await new Promise(r => setTimeout(r, 3000));
              const statusRes = await fetch(`${dmsServerPath}/dms/tasks/${task_id}`);
              const task = await statusRes.json().catch(() => ({}));
              if (task.progress != null) setDuplicateProgress(task.progress);
              if (task.status === 'done') break;
              if (task.status === 'error') {
                  console.error('[duplicate] task failed:', task.error);
                  window.alert(`Pattern duplicate failed: ${task.error}. Pattern not created.`);
                  return;
              }
          }

          // 3. Create new pattern record
          const dataToCopy = {
              app: value.app,
              base_url: value.base_url ? `${value.base_url}${suffix}` : `/${newSlug}`,
              subdomain: value.subdomain,
              config: value.config,
              name: newName,
              pattern_type: value.pattern_type,
              authPermissions: value.authPermissions,
              auth_level: value.auth_level,
              filters: value.filters,
              theme: value.theme,
              additionalSectionAttributes: value.additionalSectionAttributes
          };

          const patternType = `${siteInstance}|${newSlug}:pattern`;
          const createResult = await apiUpdate({
              data: dataToCopy,
              config: { format: { app, type: patternType, attributes: [] } },
              skipNavigate: true
          });
          const newId = createResult?.id;

          if (newId) {
              // 3. Add new pattern ref to site
              const site = await loadSiteData(apiLoad, app, siteType);
              if (site) {
                  const rawPatterns = site.patterns || [];
                  const patterns = await withServerRefs(site, [...rawPatterns, { ref: `${app}+${patternType}`, id: +newId }]);
                  await apiUpdate({
                      data: { id: site.id, patterns },
                      config: { format: siteFormat },
                      skipNavigate: true
                  });
              }
          }

          navigate(parentBaseUrl || '/');
      } finally {
          setIsDuplicating(false);
      }
  };

    return (
      <div className={t.wrapper}>
        <div className={t.header}>
          <span className={t.headerTitle}>{value.name || 'Pattern'}</span>
          {!!value.pattern_type && (
            <span className={t.headerTypePill}>{Array.isArray(value.pattern_type) ? value.pattern_type[0] : value.pattern_type}</span>
          )}
          <span className={t.headerSubtitle}>{value.type} · id {value.id} · {value.base_url || '/'} on {value.subdomain || '*'}</span>
        </div>

        <div className={isDirty ? t.saveBarDirty : t.saveBar}>
          <span className={isDirty ? t.saveBarTextDirty : t.saveBarText}>
            {confirmAdminMove
              ? `the admin panel will move to /${`${tmpValue.base_url || ''}`.replace(/^\/+/, '')} on the next page load — save again to confirm`
              : isDirty ? 'unsaved changes — applies to identity, locations, and retired subdomains below' : 'no unsaved changes'}
          </span>
          <span className='flex-1' />
          <button type={'button'} className={t.btnReset} disabled={!isDirty} onClick={() => { setConfirmAdminMove(false); setTmpValue(value); }}>
            reset
          </button>
          <button type={'button'} className={t.btnSave} disabled={!isDirty} onClick={saveChanges}>
            {confirmAdminMove ? 'confirm move' : 'save changes'}
          </button>
        </div>

        <div className={t.card}>
          <div className={t.cardHeader}>
            <span className={t.cardHeaderLabel}>identity</span>
          </div>
            <FieldSet
                className={t.fieldGrid}
                components={[
                    {
                      label: 'Type',
                      type: 'Input',
                      value: value.type || '',
                      disabled: true,
                      customTheme: { field: t.fieldRow, label: t.fieldLabel }
                    },
                    {
                      label: 'Pattern Type',
                      type: 'Input',
                      value: Array.isArray(value.pattern_type) ? value.pattern_type[0] : (value.pattern_type || ''),
                      disabled: true,
                      customTheme: { field: t.fieldRow, label: t.fieldLabel }
                    },
                    {
                      label: 'Name',
                      type: 'Input',
                      placeholder: 'Site Name',
                      value: tmpValue.name,
                      onChange: e => setTmpValue(draft => {
                        draft.name = e.target.value
                      }),
                      customTheme: { field: t.fieldRow, label: t.fieldLabel }
                    },
                    {
                      label: 'Subdomain',
                      type: 'Input',
                        disabled: tenantSub?.length || isAdminPattern,
                      placeholder: '',
                      value: tmpValue.subdomain,
                      onChange: e => setTmpValue(draft => {
                        draft.subdomain = e.target.value
                      }),
                      customTheme: { field: t.fieldRowNarrow, label: t.fieldLabel }
                    },
                    {
                      label: 'Base Url',
                      type: 'Input',
                      placeholder: '/',
                      value: tmpValue.base_url,
                      onChange: e => setTmpValue(draft => {
                        draft.base_url = e.target.value
                      }),
                      customTheme: { field: t.fieldRowNarrow, label: t.fieldLabel }
                    },
                    {
                      label: 'HTML Title',
                      type: 'Input',
                      placeholder: tmpValue.name || 'Browser tab title',
                      value: tmpValue.html_title || '',
                      onChange: e => setTmpValue(draft => {
                        draft.html_title = e.target.value
                      }),
                      customTheme: { field: t.fieldRowFull, label: t.fieldLabel }
                    },
                ]}
            />
        </div>

        {!isAdminPattern && (
          <>
            <LocationsEditor
              value={tmpValue.locations}
              onChange={(locations) => setTmpValue(draft => { draft.locations = locations; })}
            />
            <RetiredSubdomainsEditor
              value={tmpValue.retired_subdomains}
              onChange={(subs) => setTmpValue(draft => { draft.retired_subdomains = subs; })}
            />
          </>
        )}

        {showDmsEnvConfig && (
          <DmsEnvConfig
            value={tmpValue}
            onChange={setTmpValue}
            dmsEnvs={dmsEnvs}
            apiLoad={apiLoad}
            app={app}
            type={type}
            siteType={siteType}
            apiUpdate={apiUpdate}
            isPage={value.pattern_type === 'page'}
          />
        )}

        {value.pattern_type === 'auth' && (
          <AuthPatternSettings value={tmpValue} onChange={setTmpValue} />
        )}

        {value.pattern_type === 'qa' && (
          <QaPatternSettings value={tmpValue} onChange={setTmpValue} apiLoad={apiLoad} />
        )}

        {(can.duplicate || can.delete) && (
        <div className={t.dangerCard}>
          <div className={t.dangerHeader}>
            <Icon icon='Alert' className={t.iconSm} />
            <span className={t.dangerHeaderLabel}>danger zone</span>
          </div>
          <div className={t.dangerBody}>
            {can.duplicate && (
            <div className={t.dangerRow}>
              <div className='min-w-0 flex-1'>
                <p className={t.dangerRowTitle}>duplicate this pattern</p>
                {isDuplicating && (
                  <div className={t.duplicateProgressBox}>
                    <p className={t.duplicateProgressText}>duplicating… {Math.round(duplicateProgress * 100)}%</p>
                    <div className={t.duplicateProgressBar}>
                      <div className={t.duplicateProgressFill} style={{ width: `${Math.round(duplicateProgress * 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
              <button
                className={t.btnDuplicate}
                disabled={isDuplicating}
                onClick={handleDuplicate}
              >
                <Icon icon='Copy' className={t.iconSm}/>
                {isDuplicating ? 'duplicating…' : 'duplicate'}
              </button>
            </div>
            )}

            {can.delete && (
            <div className={t.dangerRow}>
              <div className='min-w-0 flex-1'>
                <p className={t.dangerRowTitle}>delete this pattern</p>
              </div>
              {!confirmDelete ? (
                <button
                  className={t.btnDelete}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon icon='TrashCan' className={t.iconSm}/>
                  delete pattern…
                </button>
              ) : (
                <div className={t.confirmRow}>
                  <span className={t.confirmText}>are you sure?</span>
                  <button
                    className={t.btnConfirmDelete}
                    onClick={handleDelete}
                  >
                    confirm delete
                  </button>
                  <button
                    className={t.btnCancelDelete}
                    onClick={() => setConfirmDelete(false)}
                  >
                    cancel
                  </button>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
        )}
      </div>
    )
}

function DmsEnvConfig({ value, onChange, dmsEnvs: initialDmsEnvs, apiLoad, app, type, siteType, apiUpdate, isPage }) {
  const [newEnvName, setNewEnvName] = useState('');
  const [creating, setCreating] = useState(false);
  const [localEnvs, setLocalEnvs] = useState(initialDmsEnvs);
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { MultiSelect, Input, Button, Switch } = UI;

  const envOptions = [
    { label: 'None (legacy)', value: '' },
    ...localEnvs.map(env => ({ label: env.name || `Env #${env.id}`, value: String(env.id) })),
  ];

  const handleEnvChange = (value) => {
    const envId = value ? +value : undefined;
    onChange(draft => { draft.dmsEnvId = envId; });
  };

  const handleCreateEnv = async () => {
    if (!newEnvName.trim() || creating) return;
    setCreating(true);
    try {
      const siteInstance = getInstance(siteType) || type;
      const envSlug = nameToSlug(newEnvName.trim());
      const envType = `${siteInstance}|${envSlug}:dmsenv`;

      // Create dmsEnv row
      const createResult = await apiUpdate({
        data: { name: newEnvName.trim(), sources: [] },
        config: { format: { app, type: envType, attributes: [] } },
        skipNavigate: true
      });
      const newId = createResult?.id;

      if (newId) {
        // Add ref to site's dms_envs array
        const site = await loadSiteData(apiLoad, app, siteType);
        if (site) {
          const existing = site.dms_envs || [];
          await apiUpdate({
            data: { id: site.id, dms_envs: [...existing, { ref: `${app}+${envType}`, id: +newId }] },
            config: { format: { app, type: siteType, attributes: [] } },
            skipNavigate: true
          });
        }
        // Optimistically add to local dropdown
        setLocalEnvs(prev => [...prev, { id: +newId, name: newEnvName.trim(), sources: [] }]);
        // Set this pattern to use the new env
        onChange(draft => { draft.dmsEnvId = +newId; });
      }
      setNewEnvName('');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={t.card}>
      <div className={t.cardHeader}>
        <span className={t.cardHeaderLabel}>data environment</span>
        <span className={t.cardHeaderHint}>which data environment this pattern uses for internal sources</span>
      </div>
      <div className={t.envGrid}>
        <div className={t.envColWide}>
          <label className={t.envLabel}>dms environment</label>
          <MultiSelect
            singleSelectOnly
            searchable={false}
            options={envOptions}
            value={String(value.dmsEnvId || '')}
            onChange={handleEnvChange}
          />
        </div>
        <div className={t.envColMid}>
          <label className={t.envLabel}>create new environment</label>
          <div className={t.envInputRow}>
            <Input
              value={newEnvName}
              placeholder='Environment name'
              onChange={e => setNewEnvName(e.target.value)}
            />
            <Button
              disabled={!newEnvName.trim() || creating}
              onClick={handleCreateEnv}
            >{creating ? 'creating…' : 'create'}</Button>
          </div>
        </div>
      </div>
      {isPage && (
        <div className={t.envSwitchRow}>
          <span className={t.envSwitchLabel}>preload data</span>
          <Switch
            size={'small'}
            enabled={value.preload_data === true}
            setEnabled={e => onChange(draft => { draft.preload_data = !!e })}
          />
          <span className={t.envSwitchHint}>{value.preload_data ? 'on — router loader phase' : 'off — sections fetch on view'}</span>
        </div>
      )}
    </div>
  );
}

// A QA install's datasets: one row each, with its row count, or what's missing and "finish set-up".
// On the Overview and on Configure (qa/configureTab.jsx). `reloadKey`: change it to re-count, as
// Configure does after a Save.
export function QaPatternSettings({ value, onChange, apiLoad, reloadKey }) {
  const { app, type, siteType } = useContext(AdminContext);
  const { theme, UI } = useContext(ThemeContext);
  const { Icon } = UI;
  const t = { ...settingsEditorTheme, ...qaConfigureTheme, ...(theme?.admin?.settingsEditor || {}), ...(theme?.admin?.qaConfigure || {}) }
  const { falcor } = useFalcor();
  const { revalidate } = useRevalidator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [datasetsUrl, setDatasetsUrl] = useState(null);
  const [found, setFound] = useState(null); // { [key]: sourceId | null } for the unlinked ones
  const [counts, setCounts] = useState({}); // { [key]: rows } for the linked ones

  const refs = value?.qa?.datasets || {};
  const unlinked = QA_DATASETS.filter(d => !refs[d.key]);
  const linked = QA_DATASETS.length - unlinked.length;
  const leftOver = found ? unlinked.filter(d => found[d.key]).length : 0;
  const missing = found ? unlinked.length - leftOver : unlinked.length;
  const instance = getInstance(value?.type);

  useEffect(() => {
    if (!unlinked.length) return setFound({});
    getSourceIdsBySlug(falcor, app, unlinked.map(d => qaDatasetSlug(instance, d.key)))
      .then(ids => setFound(Object.fromEntries(unlinked.map(d => [d.key, ids[qaDatasetSlug(instance, d.key)]]))));
  }, [linked]);

  useEffect(() => {
    let current = true;
    Promise.all(QA_DATASETS.filter(d => refs[d.key]).map(async d => {
      const ref = refs[d.key];
      const length = await apiLoad({
        format: { app, type: `${ref.slug}|${ref.view_id}:data`, env: `${app}+${ref.slug}`, view_id: ref.view_id },
        children: [{ type: () => {}, action: 'udaLength', path: '/', filter: { options: '{}' } }],
      }, '/').catch(() => null);
      return [d.key, length == null ? null : +(length?.value ?? length) || 0];
    }))
      .then(pairs => current && setCounts(Object.fromEntries(pairs)));
    return () => { current = false; };
  }, [linked, reloadKey]);

  useEffect(() => {
    if (!value?.dmsEnvId) return;
    loadSitePatterns(apiLoad, app, siteType).then(patterns => {
      const datasets = patterns.find(p => p?.pattern_type === 'datasets' && +p.dmsEnvId === +value.dmsEnvId);
      setDatasetsUrl(datasets ? `/${`${datasets.base_url || ''}`.replace(/^\/+|\/+$/g, '')}` : null);
    });
  }, [value?.dmsEnvId]);

  const createMissing = async () => {
    setBusy(true);
    setError('');
    try {
      const site = await loadSiteData(apiLoad, app, siteType);
      const result = await installQa({
        falcor, app, siteId: site?.id, siteInstance: getInstance(siteType) || type,
        patternId: value.id, instance, installName: value.name,
        patterns: await loadSitePatterns(apiLoad, app, siteType),
      });
      // The tab's Save sends this whole draft, so it takes the install's writes too.
      onChange(draft => {
        draft.dmsEnvId = result.env.id;
        draft.qa = { version: 1, datasets: result.datasets };
        if (result.authPermissions) draft.authPermissions = result.authPermissions;
      });
      revalidate();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // What "finish set-up" will do, in one sentence.
  const finishing = [missing && `creates the ${missing} missing`, leftOver && `links the ${leftOver} left by an interrupted set-up`].filter(Boolean).join(' and ');
  const finishNote = !found ? 'checking…'
    : linked ? `Set-up stopped part way. Finishing it ${finishing} and keeps the rest.`
    : `Not set up yet. Finishing set-up ${finishing}.`;

  return (
    <div className={`${t.card} ${t.datasetsCard}`}>
      <div className={t.cardHeader}>
        <span className={t.cardHeaderLabel}>datasets</span>
        <span className={t.spacer} />
        {unlinked.length
          ? <span className={t.badgeWarn}>{unlinked.length} missing</span>
          : <span className={t.badgeOk}>all linked</span>}
      </div>
      <ul className={t.datasetList}>
        {QA_DATASETS.map(d => {
          const ref = refs[d.key];
          const n = counts[d.key];
          return (
            <li key={d.key} className={t.datasetRow}>
              {ref ? <Icon icon='CircleCheck' className={t.datasetTick} /> : <span className={t.datasetRing} aria-hidden />}
              <span className={t.datasetName}>{d.name}</span>
              <span className={t.datasetSlug}>{ref?.slug || qaDatasetSlug(instance, d.key)}</span>
              {ref
                ? <span className={t.datasetCount}>{n == null ? '…' : `${n} row${n === 1 ? '' : 's'}`}</span>
                : <span className={t.datasetMissing}>{found?.[d.key] ? 'not linked' : 'missing'}</span>}
            </li>
          );
        })}
      </ul>
      {(unlinked.length > 0 || datasetsUrl || error) && (
        <div className={t.cardFooter}>
          {unlinked.length > 0 ? (
            <>
              <span className={t.datasetNote}>{finishNote}</span>
              <button type={'button'} className={t.btnSave} disabled={busy || !found} onClick={createMissing}>
                {busy ? 'finishing…' : 'finish set-up'}
              </button>
            </>
          ) : datasetsUrl && (
            <Link to={datasetsUrl} className={t.datasetLink}>browse in Datasets<Icon icon='ArrowRight' className={t.datasetLinkIcon} /></Link>
          )}
          {error && <span className={t.qaError}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function AuthPatternSettings({ value, onChange }) {
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { Switch } = UI;

  return (
    <div className={t.card}>
      <div className={t.cardHeader}>
        <span className={t.cardHeaderLabel}>auth pattern settings</span>
      </div>
      <div className={t.settingsGrid}>
        <Switch
          size={'small'}
          enabled={value.disable_signup === true}
          setEnabled={e => onChange(draft => { draft.disable_signup = !!e })}
        />
        <span className={t.settingsLabel}>disable signup</span>
      </div>
    </div>
  );
}

