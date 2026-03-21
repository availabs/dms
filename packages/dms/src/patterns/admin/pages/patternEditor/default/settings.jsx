import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { useNavigate } from "react-router";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { nameToSlug, getInstance } from "../../../../../utils/type-utils";


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
  const { apiUpdate, app, type, siteType, API_HOST, parentBaseUrl, dmsEnvs = [], dmsEnvById = {} } = useContext(AdminContext);
  const { UI } = useContext(ThemeContext)
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
          await fetch(`${dmsServerPath}/dms/${app}+${oldInstance}/duplicate`, {
              method: "POST",
              body: JSON.stringify({ newApp: app, newType: newSlug }),
              headers: { "Content-Type": "application/json" },
          });

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
      <div className='flex flex-col gap-4 max-w-5xl'>
        <div className={'flex flex-col gap-1 p-4 border rounded-md'}>
          <span className='font-semibold text-lg'>Pattern Settings</span>
            <FieldSet
                className={'grid grid-cols-12 gap-1 border rounded p-4'}
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

        <div className='flex flex-col gap-2 p-4 border border-red-200 rounded-md'>
          <span className='font-semibold text-sm text-red-600'>Danger Zone</span>
          <div className='flex items-center gap-2'>
            <button
              className='flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50'
              disabled={isDuplicating}
              onClick={handleDuplicate}
            >
              <Icon icon='Copy' className='size-4'/>
              {isDuplicating ? 'Duplicating...' : 'Duplicate'}
            </button>

            {!confirmDelete ? (
              <button
                className='flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg'
                onClick={() => setConfirmDelete(true)}
              >
                <Icon icon='TrashCan' className='size-4'/>
                Delete
              </button>
            ) : (
              <div className='flex items-center gap-2'>
                <span className='text-sm text-red-600'>Are you sure?</span>
                <button
                  className='px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg'
                  onClick={handleDelete}
                >
                  Confirm Delete
                </button>
                <button
                  className='px-3 py-1.5 text-sm text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg'
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
  const { UI } = useContext(ThemeContext);
  const { Select, Input, Button } = UI;

  const envOptions = [
    { label: 'None (legacy)', value: '' },
    ...localEnvs.map(env => ({ label: env.name || `Env #${env.id}`, value: String(env.id) })),
  ];

  const handleEnvChange = (e) => {
    const envId = e.target.value ? +e.target.value : undefined;
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
    <div className='flex flex-col gap-1 p-4 border rounded-md'>
      <span className='font-semibold text-lg'>Data Environment</span>
      <p className='text-sm text-gray-500 mb-2'>
        Select which data environment this pattern uses for internal sources.
      </p>
      <div className='grid grid-cols-12 gap-2'>
        <div className='col-span-6'>
          <label className='text-sm font-medium text-gray-700'>DMS Environment</label>
          <Select
            options={envOptions}
            value={String(value.dmsEnvId || '')}
            onChange={handleEnvChange}
          />
        </div>
        <div className='col-span-4'>
          <label className='text-sm font-medium text-gray-700'>Create New Environment</label>
          <div className='flex gap-2'>
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
