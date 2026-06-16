import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { useNavigate } from "react-router";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { nameToSlug, getInstance } from "../../../../../utils/type-utils";
import { settingsEditorTheme } from './settings.theme'


const customTheme = {
    field: 'pb-2 flex flex-col col-span-9'
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

export const PatternSettingsEditor = ({ value = {}, onChange, apiLoad, ...rest}) => {
  const { apiUpdate, app, type, siteType, API_HOST, parentBaseUrl, dmsEnvs = [], dmsEnvById = {}, isMultiTenant } = useContext(AdminContext);
  const { UI, theme } = useContext(ThemeContext)
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const tenantSub = (() => {
    if (!isMultiTenant) return '';
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
    const minParts = isLocalhost ? 2 : 3;
    const parts = hostname.split('.');
    return parts.length >= minParts ? parts[0] : '';
  })();
  console.log('tenantsub', tenantSub, isMultiTenant)
  const { FieldSet, Button, Icon } = UI;
  const navigate = useNavigate();
  const [tmpValue, setTmpValue] = useImmer(value);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const showDmsEnvConfig = ['datasets', 'forms', 'page', 'mapeditor'].includes(value.pattern_type);

  const siteFormat = { app, type: siteType, attributes: [] };

  const handleDelete = async () => {
      const site = await loadSiteData(apiLoad, app, siteType);
      if (!site) return;

      const rawPatterns = site.patterns || [];
      const updatedPatterns = rawPatterns.filter(p => +p.id !== +value.id);

      await apiUpdate({
          data: { id: site.id, patterns: updatedPatterns },
          config: { format: siteFormat },
          skipNavigate: true
      });

      navigate(parentBaseUrl || '/');
  };

  const handleDuplicate = async () => {
      setIsDuplicating(true);
      try {
          const siteInstance = getInstance(siteType) || type;
          const oldInstance = getInstance(value.type) || value?.base_url?.replace(/\//g, '');
          const newName = `${value.name}_copy`;
          const newSlug = nameToSlug(newName);

          // 1. Copy pages/sections on the server
          const dmsServerPath = `${API_HOST}/dama-admin`;
          const dupRes = await fetch(`${dmsServerPath}/dms/${app}+${oldInstance}/duplicate`, {
              method: "POST",
              body: JSON.stringify({ newApp: app, newType: newSlug }),
              headers: { "Content-Type": "application/json" },
          });
          // Surface a failed copy (e.g. server without the /duplicate route) instead of
          // silently creating an empty pattern.
          const dupBody = await dupRes.json().catch(() => ({}));
          if (!dupRes.ok || dupBody?.err) {
              console.error('[duplicate] page/section copy failed:', dupBody?.err || dupRes.status);
              window.alert(`Pattern duplicate failed: ${dupBody?.err || `HTTP ${dupRes.status}`} (server: ${API_HOST}). Pattern not created.`);
              return;
          }

          // 2. Create new pattern record
          const dataToCopy = {
              app: value.app,
              base_url: `${value.base_url}_copy`,
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
                  await apiUpdate({
                      data: { id: site.id, patterns: [...rawPatterns, { ref: `${app}+${siteInstance}|pattern`, id: +newId }] },
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
        <div className={t.section}>
          <span className={t.sectionTitle}>Pattern Settings</span>
            <FieldSet
                className={t.fieldGrid}
                components={[
                    {
                      label: 'Type',
                      type: 'Input',
                      value: value.type || '',
                      disabled: true,
                      customTheme: { field: 'pb-2 flex flex-col col-span-6' }
                    },
                    {
                      label: 'Pattern Type',
                      type: 'Input',
                      value: Array.isArray(value.pattern_type) ? value.pattern_type[0] : (value.pattern_type || ''),
                      disabled: true,
                      customTheme: { field: 'pb-2 flex flex-col col-span-3' }
                    },
                    {
                      type: 'Spacer',
                      customTheme: { field: 'col-span-3' }
                    },
                    {
                      label: 'Name',
                      type: 'Input',
                      placeholder: 'Site Name',
                      value: tmpValue.name,
                      onChange: e => setTmpValue(draft => {
                        draft.name = e.target.value
                      }),
                      customTheme
                    },
                    {
                      label: 'Subdomain',
                      type: 'Input',
                        disabled: tenantSub?.length,
                      placeholder: '',
                      value: tmpValue.subdomain,
                      onChange: e => setTmpValue(draft => {
                        draft.subdomain = e.target.value
                      }),
                      customTheme
                    },
                    {
                      label: 'Base Url',
                      type: 'Input',
                      placeholder: '/',
                      value: tmpValue.base_url,
                      onChange: e => setTmpValue(draft => {
                        draft.base_url = e.target.value
                      }),
                      customTheme
                    },
                    {
                      label: 'HTML Title',
                      type: 'Input',
                      placeholder: tmpValue.name || 'Browser tab title',
                      value: tmpValue.html_title || '',
                      onChange: e => setTmpValue(draft => {
                        draft.html_title = e.target.value
                      }),
                      customTheme
                    },
                    {
                      type: 'Spacer',
                      customTheme: { field: 'bg-white col-span-3 ' }
                    },
                    {
                      type: 'Spacer',
                      customTheme: { field: 'bg-white col-span-7 ' }
                    },
                    {
                      type: 'Button',
                      children: <span>Reset</span>,
                      buttonType: 'plain',
                      disabled: isEqual(tmpValue,value),
                      value: tmpValue.base_url,
                      onClick: () => setTmpValue(draft => value),
                      customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    },
                    {
                      type: 'Button',
                      children: <span>Save</span>,
                      disabled: isEqual(tmpValue,value),
                      onClick: () => apiUpdate({data:tmpValue}),
                      customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    },
                ]}
            />
        </div>

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
          />
        )}

        {value.pattern_type === 'page' && (
          <PagePatternSettings value={tmpValue} onChange={setTmpValue} />
        )}

        {value.pattern_type === 'auth' && (
          <AuthPatternSettings value={tmpValue} onChange={setTmpValue} />
        )}

        <div className={t.dangerSection}>
          <span className={t.dangerLabel}>Danger Zone</span>
          <div className={t.dangerActions}>
            <button
              className={t.btnDuplicate}
              disabled={isDuplicating}
              onClick={handleDuplicate}
            >
              <Icon icon='Copy' className={t.iconSm}/>
              {isDuplicating ? 'Duplicating...' : 'Duplicate'}
            </button>

            {!confirmDelete ? (
              <button
                className={t.btnDelete}
                onClick={() => setConfirmDelete(true)}
              >
                <Icon icon='TrashCan' className={t.iconSm}/>
                Delete
              </button>
            ) : (
              <div className={t.confirmRow}>
                <span className={t.confirmText}>Are you sure?</span>
                <button
                  className={t.btnConfirmDelete}
                  onClick={handleDelete}
                >
                  Confirm Delete
                </button>
                <button
                  className={t.btnCancelDelete}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
}

function DmsEnvConfig({ value, onChange, dmsEnvs: initialDmsEnvs, apiLoad, app, type, siteType, apiUpdate }) {
  const [newEnvName, setNewEnvName] = useState('');
  const [creating, setCreating] = useState(false);
  const [localEnvs, setLocalEnvs] = useState(initialDmsEnvs);
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { MultiSelect, Input, Button } = UI;

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
            data: { id: site.id, dms_envs: [...existing, { ref: `${app}+${siteInstance}|dmsenv`, id: +newId }] },
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
    <div className={t.section}>
      <span className={t.sectionTitle}>Data Environment</span>
      <p className={t.sectionDesc}>
        Select which data environment this pattern uses for internal sources.
      </p>
      <div className={t.envGrid}>
        <div className={t.envColWide}>
          <label className={t.envLabel}>DMS Environment</label>
          <MultiSelect
            singleSelectOnly
            searchable={false}
            options={envOptions}
            value={String(value.dmsEnvId || '')}
            onChange={handleEnvChange}
          />
        </div>
        <div className={t.envColMid}>
          <label className={t.envLabel}>Create New Environment</label>
          <div className={t.envInputRow}>
            <Input
              value={newEnvName}
              placeholder='Environment name'
              onChange={e => setNewEnvName(e.target.value)}
            />
            <Button
              disabled={!newEnvName.trim() || creating}
              onClick={handleCreateEnv}
            >{creating ? 'Creating...' : 'Create'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PagePatternSettings({ value, onChange }) {
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { FieldSet } = UI;

  return (
    <div className={t.section}>
      <span className={t.sectionTitle}>Page Pattern Settings</span>
      <p className={t.sectionDesc}>
        Pre-load section data on page navigation (router loader phase). When off,
        sections fetch their data after mount.
      </p>
      <FieldSet
        className={t.fieldGrid}
        components={[
          {
            label: 'Preload Data',
            type: 'Switch',
            enabled: value.preload_data === true,
            size: 'small',
            setEnabled: e => onChange(draft => { draft.preload_data = !!e }),
            className: 'self-center',
            customTheme: { field: 'pb-2 col-span-12' },
          },
        ]}
      />
    </div>
  );
}

function AuthPatternSettings({ value, onChange }) {
  const { UI, theme } = useContext(ThemeContext);
  const t = { ...settingsEditorTheme, ...(theme?.admin?.settingsEditor || {}) }
  const { FieldSet } = UI;

  return (
    <div className={t.section}>
      <span className={t.sectionTitle}>Auth Pattern Settings</span>
      <FieldSet
        className={t.fieldGrid}
        components={[
          {
            label: 'Disable Signup',
            type: 'Switch',
            enabled: value.disable_signup === true,
            size: 'small',
            setEnabled: e => onChange(draft => { draft.disable_signup = !!e }),
            className: 'self-center',
            customTheme: { field: 'pb-2 col-span-12' },
          },
        ]}
      />
    </div>
  );
}
