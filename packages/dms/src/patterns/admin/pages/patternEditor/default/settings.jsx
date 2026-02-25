import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { useFalcor } from "@availabs/avl-falcor";
import { useNavigate } from "react-router";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";


const customTheme = {
    field: 'pb-2 flex flex-col col-span-9'
}

/**
 * Load the site record (the parent that owns the patterns array).
 * Returns { id, data } or null.
 */
async function loadSiteData(falcor, app, type) {
    const siteEnv = `${app}+${type}`;
    const lengthResult = await falcor.get(['dms', 'data', siteEnv, 'length']);
    const length = lengthResult?.json?.dms?.data?.[siteEnv]?.length || 0;
    if (!length) return null;

    const result = await falcor.get(
        ['dms', 'data', siteEnv, 'byIndex', 0, ['id', 'data']]
    );
    const entry = result?.json?.dms?.data?.[siteEnv]?.byIndex?.[0];
    if (!entry?.id) return null;
    return { id: entry.id, data: entry.data };
}

export const PatternSettingsEditor = ({ value = {}, onChange, ...rest}) => {
  const { apiUpdate, app, type, API_HOST, parentBaseUrl } = useContext(AdminContext);
  const { UI } = useContext(ThemeContext)
  const { FieldSet, Button, Icon } = UI;
  const { falcor } = useFalcor();
  const navigate = useNavigate();
  const [tmpValue, setTmpValue] = useImmer(value);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDelete = async () => {
      const site = await loadSiteData(falcor, app, type);
      if (!site) return;

      const rawPatterns = site.data?.patterns || [];
      const updatedPatterns = rawPatterns.filter(p => +p.id !== +value.id);

      await falcor.call(
          ['dms', 'data', 'edit'],
          [app, site.id, { patterns: updatedPatterns }]
      );

      navigate(parentBaseUrl || '/');
  };

  const handleDuplicate = async () => {
      setIsDuplicating(true);
      try {
          const newDocType = crypto.randomUUID();

          // 1. Copy pages/sections on the server
          const dmsServerPath = `${API_HOST}/dama-admin`;
          await fetch(`${dmsServerPath}/dms/${app}+${value.doc_type}/duplicate`, {
              method: "POST",
              body: JSON.stringify({ newApp: app, newType: newDocType }),
              headers: { "Content-Type": "application/json" },
          });

          // 2. Create new pattern record
          const dataToCopy = {
              app: value.app,
              base_url: `${value.base_url}_copy`,
              subdomain: value.subdomain,
              config: value.config,
              doc_type: newDocType,
              name: `${value.name}_copy`,
              pattern_type: value.pattern_type,
              auth_level: value.auth_level,
              filters: value.filters,
              theme: value.theme,
          };

          const createResult = await falcor.call(
              ['dms', 'data', 'create'],
              [app, 'pattern', dataToCopy]
          );
          const newId = Object.keys(createResult?.json?.dms?.data?.byId || {})
              .filter(d => d !== '$__path')?.[0];

          if (newId) {
              // 3. Add new pattern ref to site
              const site = await loadSiteData(falcor, app, type);
              if (site) {
                  const rawPatterns = site.data?.patterns || [];
                  await falcor.call(
                      ['dms', 'data', 'edit'],
                      [app, site.id, { patterns: [...rawPatterns, { ref: `${app}+pattern`, id: +newId }] }]
                  );
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
