
import React, {Fragment, useContext, useEffect, useState} from 'react'
import { cloneDeep, set, get, isEqual } from 'lodash-es'
import { updateTitle } from '../editFunctions'
import { PageContext, CMSContext } from '../../../context'
import { ThemeContext, getComponentTheme } from "../../../../../ui/useTheme";
import { editPanesTheme } from './editPanes.theme';
import { MountContext } from "../../../../../ui/mountContext";
import { getPageAuthPermissions, getUrlSlug } from "../../../pages/_utils";
import { nameToSlug } from '../../../../../utils/type-utils';
import {buildPageTemplatePayload, buildPageTemplateType} from "../../../../utils";

const FilterSettings = ({label, type, value, stateValue, onChange}) => {
  const { isUserAuthed } = useContext(CMSContext);
  const { pageState } = useContext(PageContext)
  const { UI } = useContext(ThemeContext)
  const {Input, FieldSet, Switch, Button} = UI;
  const [newFilter, setNewFilter] = useState({});
  const [tmpValue, setTmpValue] = useState(typeof value === 'string' ? JSON.parse(value) : (value || []));

    const reqPermissions = ['edit-page-params']
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const userHasEditPageParamsAccess = isUserAuthed(reqPermissions, pageAuthPermissions)

  const updateFilters = (idx, key, valueToUpdate) => {
    setTmpValue(tmpValue.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v))
    onChange(tmpValue.map((v, i) => i === idx ? {...v, [key]: valueToUpdate} : v));
  }

  const customTheme = {
      field: 'pb-2 flex flex-col'
  }
  if(!userHasEditPageParamsAccess) return null
  return (
      <div className={'flex flex-col gap-1'}>
        {
          tmpValue.map((filter, i) => (
              <FieldSet
                  key={`settings_filter_${i}`}
                  className={'grid grid-cols-3 gap-1'}
                  components={[
                      {label: 'Search Key', type: 'Input', placeholder: 'search key', value: filter.searchKey,
                          onChange: e => updateFilters(i, 'searchKey', e.target.value),
                          customTheme
                      },
                      {label: 'Search Value', type: 'Input', placeholder: 'search value', value: filter.values,
                          onChange: e => updateFilters(i, 'values', e.target.value),
                          customTheme
                      },
                      {label: 'Use URL', type: 'Switch', enabled: filter.useSearchParams, size: 'small',
                          setEnabled: e => updateFilters(i, 'useSearchParams', e),
                          className: 'self-center',
                          customTheme
                      },
                      // A derived variable takes its value from another variable on this page
                      // instead of from the author/URL — e.g. a network-vintage `year` that
                      // follows a `month` control (202501 → 2025). Leave 'Derived From' blank
                      // for an ordinary variable. 'Search Value' becomes the fallback used when
                      // the source is unset, and 'Use URL' should stay OFF (a derived value in
                      // the URL gets re-emitted stale by the other controls).
                      {label: 'Derived From', type: 'MultiSelect', singleSelectOnly: true, searchable: false,
                          value: filter.derivedFrom || '',
                          options: [{label: '— not derived —', value: ''},
                              ...tmpValue.filter(f => f.searchKey && f.searchKey !== filter.searchKey && !f.derivedFrom)
                                  .map(f => ({label: f.searchKey, value: f.searchKey}))],
                          onChange: v => updateFilters(i, 'derivedFrom', v || undefined),
                          customTheme
                      },
                      ...(filter.derivedFrom ? [
                          {label: 'Derive', type: 'MultiSelect', singleSelectOnly: true, searchable: false,
                              value: filter.derive || '',
                              options: [{label: 'year of YYYYMM', value: 'yyyy'}],
                              onChange: v => updateFilters(i, 'derive', v || undefined),
                              customTheme
                          }
                      ] : []),
                      {label: 'Active Value', type: () => <div className={'text-sm pb-2 flex flex-col'}>{(stateValue || []).find(sf => sf.searchKey === filter.searchKey)?.values}</div>
                      },
                      {type: 'Button', children: 'remove',
                          onClick: () => {
                              onChange(tmpValue.filter((_, idx) => i !== idx));
                              setTmpValue(tmpValue.filter((_, idx) => i !== idx))
                          }
                      }
                  ]}
              />
              ))
        }
            <FieldSet
                className={'grid grid-cols-3 gap-1'}
                components={[
                    {label: 'Search Key', type: 'Input', placeholder: 'search key', value: newFilter.searchKey,
                        onChange: e => setNewFilter({...newFilter, searchKey: e.target.value}),
                        customTheme
                    },
                    {label: 'Search Value', type: 'Input', placeholder: 'search value', value: newFilter.values,
                        onChange: e => setNewFilter({...newFilter, values: e.target.value}),
                        customTheme
                    },
                    {label: 'Use URL', type: 'Switch', enabled: newFilter.useSearchParams, size: 'small',
                        setEnabled: e => setNewFilter({...newFilter, useSearchParams: e}),
                        className: 'self-center',
                        customTheme
                    },
                    {type: 'Button', children: 'add',
                        onClick: () => {
                            const id = crypto.randomUUID();
                            onChange([...tmpValue, {id, ...newFilter}]);
                            setTmpValue([...tmpValue, {id, ...newFilter}])
                            setNewFilter({});
                        }
                    }
                ]}
            />
        <Button onClick={() => {
          onChange([]);
          setTmpValue([])
          setNewFilter({});
        }} > clear all </Button>
        {
          // Auto-registered page variables — derived by the platform from a section
          // on this page (e.g. a shareable map's `layers` + interactive `searchParamKey`s
          // via its registry entry's derivePageVariables). They live in pageState.filters (not item.filters)
          // so they can't be hand-edited here; surfaced read-only so the author can see
          // which URL params the page owns and their current values.
          (() => {
            const autoVars = (pageState?.filters || []).filter(f => f.auto);
            if (!autoVars.length) return null;
            return (
              <div className={'mt-3 border-t border-[var(--t-rule)] pt-2 flex flex-col gap-1'}>
                <div className={'text-xs font-semibold text-[var(--t-graphite)]'}>Auto-registered variables</div>
                <div className={'text-xs text-[var(--t-pencil)] pb-1'}>Owned by a section on this page (e.g. a shareable map). Read-only.</div>
                {autoVars.map((f, i) => (
                  <div key={`auto_var_${f.searchKey || i}`} className={'grid grid-cols-3 gap-1 text-sm'}>
                    <div className={'font-mono truncate'}>{f.searchKey}</div>
                    <div className={'text-[var(--t-graphite)] truncate'}>{Array.isArray(f.values) ? f.values.join(', ') : String(f.values ?? '')}</div>
                    <div className={'text-[var(--t-pencil)] text-xs self-center'}>{f.useSearchParams ? 'URL' : ''}</div>
                  </div>
                ))}
              </div>
            );
          })()
        }
      </div>
  )
};

function DebouncedInput({value, onChange, Input, ...rest}) {
    const [tmpValue, setTmpValue] = React.useState(value || '');

    React.useEffect(() => {
        const handler = setTimeout(() => {
            if (!isEqual(value, tmpValue)) {
                onChange(tmpValue);
            }
        }, 300);

        return () => clearTimeout(handler);
    }, [tmpValue, value]);

    // `rest` was destructured but never forwarded, so a field config could not set
    // `placeholder` (or anything else) on the underlying input. Input destructures
    // label/description/activeStyle out of its own props, so the FieldSet config keys
    // that ride along here are absorbed rather than leaked onto the DOM element.
    return <Input {...rest} value={tmpValue} onChange={e => setTmpValue(e.target.value)}/>
}

function SaveAsTemplateSection({ t }) {
  const { item, apiLoad, apiUpdate, format } = useContext(PageContext) || {};
  const { user } = useContext(CMSContext) || {};
  const { UI } = useContext(ThemeContext) || {};
  const { Input, Button } = UI;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null);
  const [pendingOverwrite, setPendingOverwrite] = useState(false);

  const templateType = React.useMemo(() => buildPageTemplateType(format), [format]);
  const trimmedName = name.trim();

  useEffect(() => {
    if (!trimmedName || !apiLoad || !format?.app) { setExisting(null); return; }
    let cancelled = false;
    const check = async () => {
      try {
        const rows = await apiLoad({
          format: { app: format.app, type: templateType, attributes: ['id', 'app', 'type', 'data'] },
          children: [{ type: () => {}, action: 'list', path: '/' }],
        });
        if (cancelled) return;
        const slug = nameToSlug(trimmedName);
        setExisting((rows || []).find(r => r?.slug === slug) || null);
      } catch { /* ignore */ }
    };
    check();
    return () => { cancelled = true; };
  }, [trimmedName, apiLoad, format?.app, templateType]);

  const save = async (overwriteTarget) => {
    if (!trimmedName || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = buildPageTemplatePayload({
        name: trimmedName,
        description: description.trim(),
        sections: item?.draft_sections || [],
        sectionGroups: item?.draft_section_groups || [],
        sidebar: item?.sidebar,
        user,
        existing: overwriteTarget,
      });
      await apiUpdate({
        data: payload,
        config: { format: { app: format.app, type: templateType } },
      });
      setName('');
      setDescription('');
      setExisting(null);
      setPendingOverwrite(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('<SaveAsTemplate>', e);
      setError('Could not save template.');
    } finally {
      setSaving(false);
    }
  };

  // v3 (Settings pane v3): the same form inside a collapsible section — inputs + buttons themed.
  if (t) return (
    <>
      <Input placeholder='Template name…' value={name}
             onChange={e => { setName(e.target.value); setPendingOverwrite(false); setSaved(false); }} />
      <Input placeholder='Description (optional)' value={description}
             onChange={e => setDescription(e.target.value)} />
      <div className={t.line}>
        {existing && !pendingOverwrite ? <span className={t.templateMsg}>&quot;{existing.name}&quot; already exists</span>
          : existing && pendingOverwrite ? <span className={t.templateMsg}>Replace &quot;{existing.name}&quot;?</span>
          : saved ? <span className={t.templateOk}>Saved</span>
          : error ? <span className={t.templateErr}>{error}</span>
          : <span className={t.lineLabel} />}
        {!existing && (
          <Button activeStyle='primary' disabled={!trimmedName || saving} onClick={() => save(null)}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        )}
        {existing && !pendingOverwrite && (
          <Button activeStyle='action' disabled={!trimmedName || saving} onClick={() => setPendingOverwrite(true)}>Overwrite…</Button>
        )}
        {existing && pendingOverwrite && (
          <>
            <Button activeStyle='action' onClick={() => setPendingOverwrite(false)}>Cancel</Button>
            <Button activeStyle='primary' disabled={saving} onClick={() => save(existing)}>{saving ? 'Saving…' : 'Overwrite'}</Button>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className='flex flex-col gap-2 pt-4 border-t border-[var(--t-rule)] mt-4'>
      <div className='text-xs font-medium text-[var(--t-graphite)] uppercase tracking-wider'>Save as Template</div>
      <Input
        placeholder='Template name…'
        value={name}
        onChange={e => { setName(e.target.value); setPendingOverwrite(false); setSaved(false); }}
      />
      <Input
        placeholder='Description (optional)'
        value={description}
        onChange={e => setDescription(e.target.value)}
      />
      <div className='flex items-center gap-2'>
        {existing && !pendingOverwrite && (
          <span className='text-xs text-amber-600'>&quot;{existing.name}&quot; exists</span>
        )}
        {existing && pendingOverwrite && (
          <span className='text-xs text-amber-600'>Replace &quot;{existing.name}&quot;?</span>
        )}
        {saved && <span className='text-xs text-[var(--t-go)]'>Saved!</span>}
        {error && <span className='text-xs text-[var(--t-brick)]'>{error}</span>}
        <div className='flex gap-1 ml-auto'>
          {!existing && (
            <Button disabled={!trimmedName || saving} onClick={() => save(null)}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          )}
          {existing && !pendingOverwrite && (
            <Button disabled={!trimmedName || saving} onClick={() => setPendingOverwrite(true)}>
              Overwrite…
            </Button>
          )}
          {existing && pendingOverwrite && (
            <>
              <Button type='plain' onClick={() => setPendingOverwrite(false)}>Cancel</Button>
              <Button disabled={saving} onClick={() => save(existing)}>
                {saving ? 'Saving…' : 'Overwrite'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LegacySettingsPane () {
  const { theme, UI } = React.useContext(ThemeContext);
  const { baseUrl, user, isUserAuthed  } = React.useContext(CMSContext) || {}
  const { item, pageState, dataItems, apiUpdate } =  React.useContext(PageContext) || {}
  const { baseUrl: mountBaseUrl, siteRootPaths } = React.useContext(MountContext) || {}
  const { Button, FieldSet, Icon, Input } = UI;
    const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
    const themeSettings = React.useMemo(() => {
    return (theme?.pageOptions?.settingsPane || [])
      .map(setting => {
        setting.value = get(item, setting.location, setting.default || '')
        setting.onChange = (e) => {
          togglePageSetting(item, setting.location, e?.target?.value ?? e,  apiUpdate)
        }
        return setting
      }).filter(d => d)
  },[theme?.pageOptions?.settingsPane, item])

  //console.log(themeSettings)
  return (
      <div className="flex flex-col p-2 w-full h-full overflow-y-auto scrollbar-sm">
          <FieldSet components={[
              {
                  type:'ConfirmInput',
                  label: 'Page Name',
                  value: item.title,
                  onChange: (val) => {
                      console.log('Change page Name', val)
                      updateTitle ( item, dataItems, val, user, apiUpdate, mountBaseUrl, siteRootPaths)
                  }
              },
              {
                  type: DebouncedInput,
                  Input,
                  label: 'Page Description',
                  value: item?.description || '',
                  onChange:(e) => {
                      apiUpdate({data: {...item, description: e}})
                  }
              },
              {
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  label: 'Icon',
                  value:  item?.icon,
                  placeholder: 'Select an icon…',
                  options: [
                      ...Object.keys(theme.Icons)
                          .map((iconName) => {
                              return {
                                  label: (
                                      <div className='flex'>
                                          <div className='px-2'>
                                              <Icon icon={iconName} className='size-6' />
                                          </div>
                                          <div>
                                              {iconName}
                                          </div>
                                      </div>
                                  ),
                                  value: iconName
                              }
                          }),
                      {label: 'No Icon', value: 'none'}
                  ],
                  onChange:(e) => {
                      togglePageSetting(item, 'icon', e,  apiUpdate)
                  }
              },
              {
                  type:'Switch',
                  label: 'Hide in Nav',
                  enabled: !!(item.hide_in_nav), size: 'small',
                  setEnabled: e => togglePageSetting(item, 'hide_in_nav', e ? 'hide' : null, apiUpdate),
                  customTheme:{
                      field: 'pb-2 flex flex-row gap-2'
                  }
              },
              {
                  // LINK PAGE (`nav_link`, page.format.js). Setting this turns the page
                  // into a nav entry that points somewhere else: it stops rendering its
                  // own sections and a visit to its slug redirects. Clearing the field
                  // turns it back into an ordinary page.
                  type: DebouncedInput,
                  Input,
                  label: 'Nav Link',
                  value: item?.nav_link || '',
                  // The three accepted forms are not guessable, so name them here —
                  // there is nowhere else in the UI an author would learn them.
                  placeholder: '/actions/dashboard · sub://name/path · https://…',
                  onChange:(e) => {
                      togglePageSetting(item, 'nav_link', e, apiUpdate)
                  }
              },
              {
                  type:'Switch',
                  label: 'Show in Footer',
                  enabled: item.show_in_footer === 'show', size: 'small',
                  setEnabled: e => togglePageSetting(item, 'show_in_footer', e ? 'show' : false, apiUpdate),
                  customTheme:{
                      field: 'pb-2 flex flex-row gap-2'
                  }
              },
              {
                  type:'Switch',
                  label: 'Cover Page',
                  enabled: item.is_cover_page === 'yes', size: 'small',
                  setEnabled: e => togglePageSetting(item, 'is_cover_page', e ? 'yes' : false, apiUpdate),
                  customTheme:{
                      field: 'pb-2 flex flex-row gap-2'
                  }
              },
              {
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  searchable: false,
                  label: 'Show Content Sidebar',
                  value: item.sidebar || '',
                  options: [
                      {label: 'None', value: ''},
                      {label: 'Left', value: 'left'},
                      {label: 'Right', value: 'right'},

                  ],
                  onChange:(value) => {
                      togglePageSetting(item, 'sidebar', value,  apiUpdate)
                  }
              },
              {
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  searchable: false,
                  label: 'Show SideNav',
                  value: theme?.layout?.options?.sideNav?.size || '',
                  options: [
                      {label: 'Show', value: 'compact'},
                      {label: 'Hide', value: 'none'}

                  ],
                  onChange:(value) => {
                      togglePageSetting(item, 'theme.layout.options.sideNav.size', value,  apiUpdate)
                  }
              },
              {
                  type:'MultiSelect',
                  singleSelectOnly: true,
                  searchable: false,
                  label: 'Sidenav Style',
                  value: item?.theme?.layout?.options?.sideNav?.activeStyle || '',
                  options: [
                      { label: 'default', value: "" },
                      ...(theme?.sidenav?.styles || [{}])
                          .map((k, i) => ({ label: k?.name || i, value: i })),
                  ],
                  onChange:(value) => {
                      togglePageSetting(item, 'theme.layout.options.sideNav.activeStyle', value,  apiUpdate)
                  }
              },
              ...themeSettings,
              // Page filters moved to their own drawer pane (FiltersPane, 2026-10-08).
          ].filter(f => !f.reqPermissions || isUserAuthed(f.reqPermissions, pageAuthPermissions))
          } />
          <SaveAsTemplateSection />
      </div>
  )
}

// Settings pane v3 (tessera v6, 2026-10-08): identity header + collapsible sections. Same fields
// and writes as LegacySettingsPane; shown when the theme sets `pages.editPanes.settingsWrap`.
function SettingsSection({ t, Icon, title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={t.sect}>
      <div className={t.sectSummary} onClick={() => setOpen(!open)} role='button' aria-expanded={open}>
        <span className={t.sectTitle}>{title}</span>
        <span className={t.sectValue}>{open ? '' : summary}</span>
        <Icon icon='ChevronDown' className={`${t.sectChevron} ${open ? 'rotate-180' : ''}`} />
      </div>
      {open ? <div className={t.sectBody}>{children}</div> : null}
    </div>
  );
}

function SettingsLine({ t, label, hint, children }) {
  return (
    <div className={t.line}>
      <span className={t.lineLabel}><span className={t.lineText}>{label}</span>{hint ? <span className={t.lineHint}>{hint}</span> : null}</span>
      {children}
    </div>
  );
}

function LayoutThumb({ t, label, kind, active, disabled, onClick }) {
  const { UI } = React.useContext(ThemeContext) || {};
  const nav = ['nav', 'none', 'left', 'right'].includes(kind) ? <span className={t.thumbNav} /> : null;
  const rail = ['left', 'right'].includes(kind) ? <span className={t.thumbRail} /> : null;
  const body = (
    <span className={t.thumbBody}>
      <span className={t.thumbHead} /><span className={t.thumbLine} /><span className={t.thumbLine} /><span className={t.thumbLine} />
    </span>
  );
  return (
    <span className={t.thumbCell}>
      <UI.Button activeStyle='bare' disabled={disabled} onClick={onClick}>
        <span className={t.thumbInner}>
          <span className={active ? t.thumbFrameActive : t.thumbFrame}>{nav}{kind === 'left' ? rail : null}{body}{kind === 'right' ? rail : null}</span>
          <span className={active ? t.thumbLabelActive : t.thumbLabel}>{label}</span>
        </span>
      </UI.Button>
    </span>
  );
}

function SettingsPaneV3({ t }) {
  const { theme, UI } = React.useContext(ThemeContext);
  const { baseUrl, user, isUserAuthed } = React.useContext(CMSContext) || {}
  const { item, pageState, dataItems = [], apiUpdate } = React.useContext(PageContext) || {}
  const { baseUrl: mountBaseUrl, siteRootPaths } = React.useContext(MountContext) || {}
  const { Icon, Switch, Select, FieldSet, Button, Input, Textarea } = UI;

  const [title, setTitle] = useState(item?.title || '');
  useEffect(() => { setTitle(item?.title || '') }, [item?.title]);
  const [description, setDescription] = useState(item?.description || '');
  useEffect(() => { setDescription(item?.description || '') }, [item?.id]);
  useEffect(() => {
    if ((item?.description || '') === description) return;
    const h = setTimeout(() => apiUpdate({ data: { ...item, description } }), 300);
    return () => clearTimeout(h);
  }, [description]);
  const [iconsOpen, setIconsOpen] = useState(false);
  const [iconFind, setIconFind] = useState('');
  const [linkOn, setLinkOn] = useState(!!item?.nav_link);
  useEffect(() => { if (item?.nav_link) setLinkOn(true) }, [item?.nav_link]);
  const [navLink, setNavLink] = useState(item?.nav_link || '');
  useEffect(() => { setNavLink(item?.nav_link || '') }, [item?.id]);
  useEffect(() => {
    if ((item?.nav_link || '') === navLink) return;
    const h = setTimeout(() => togglePageSetting(item, 'nav_link', navLink, apiUpdate), 300);
    return () => clearTimeout(h);
  }, [navLink]);

  const themeSettings = React.useMemo(() => {
    return (theme?.pageOptions?.settingsPane || [])
      .map(setting => {
        setting.value = get(item, setting.location, setting.default || '')
        setting.onChange = (e) => {
          togglePageSetting(item, setting.location, e?.target?.value ?? e, apiUpdate)
        }
        return setting
      }).filter(d => d)
  }, [theme?.pageOptions?.settingsPane, item])

  const isDraft = item?.published === 'draft' || item?.has_changes;
  const parents = [];
  let p = dataItems.find(d => d.id === item?.parent);
  while (p && parents.length < 6) { parents.unshift(p.title || p.url_slug); p = dataItems.find(d => d.id === p.parent); }
  const renaming = title.trim() && title !== item?.title;
  const newSlug = renaming ? getUrlSlug({ id: item.id, title, parent: item?.parent || '' }, dataItems) : '';
  const sidebar = item?.sidebar || '';
  const navShown = (theme?.layout?.options?.sideNav?.size || '') !== 'none';
  const sideNavStyles = [{ label: 'default', value: '' }, ...(theme?.sidenav?.styles || [{}]).map((k, i) => ({ label: k?.name || String(i), value: i }))];
  const sideNavStyle = item?.theme?.layout?.options?.sideNav?.activeStyle ?? '';
  // skip the registry's blank / fallback entries — they draw nothing (or the warning shield)
  const iconNames = Object.keys(theme?.Icons || {})
    .filter(n => !['Blank', 'Default', 'Padding', 'Border'].includes(n))
    .filter(n => !iconFind || n.toLowerCase().includes(iconFind.toLowerCase()));
  const linkHost = (() => { try { return item?.nav_link?.startsWith('http') ? new URL(item.nav_link).host : item?.nav_link } catch { return item?.nav_link } })();

  return (
    <div className={t.settingsWrap}>
      {/* identity */}
      <div className={t.identity}>
        <div className={t.identityRow}>
          <Button activeStyle={iconsOpen ? 'iconTileOn' : 'iconTile'} title='Change icon' aria-expanded={iconsOpen} onClick={() => setIconsOpen(!iconsOpen)}>
            <Icon icon={item?.icon && item.icon !== 'none' ? item.icon : 'Page'} className={t.iconTileIcon} />
          </Button>
          <div className={t.identityBody}>
            <div className={t.statusRow}>
              <span className={isDraft ? t.statusDraft : t.statusPublished}><span className={t.statusDot} />{isDraft ? 'draft' : 'published'}</span>
              {parents.length ? <span className={t.parentPath}>{parents.join(' › ')}</span> : null}
            </div>
            <Input activeStyle='title' aria-label='Page title' value={title} onChange={e => setTitle(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter' && renaming) updateTitle(item, dataItems, title, user, apiUpdate, mountBaseUrl, siteRootPaths) }} />
            {renaming ? (
              <>
                <div className={t.slugRow}>
                  <span className={t.slugOld}>/{item?.url_slug}</span>
                  <Icon icon='ArrowRight' className={t.icon} />
                  <span className={t.slugNew}>/{newSlug}</span>
                </div>
                <div className={t.renameRow}>
                  <Button activeStyle='primary' onClick={() => updateTitle(item, dataItems, title, user, apiUpdate, mountBaseUrl, siteRootPaths)}>
                    <Icon icon='Check' className={t.icon} />Rename
                  </Button>
                  <Button activeStyle='action' onClick={() => setTitle(item?.title || '')}>Revert</Button>
                </div>
              </>
            ) : (
              <div className={t.slugRow}>
                <span className={t.slug}>/{item?.url_slug}</span>
                <Button activeStyle='iconInline' title='Copy link' aria-label='Copy link'
                        onClick={() => navigator?.clipboard?.writeText(`${window.location.origin}${baseUrl || ''}/${item?.url_slug || ''}`)}>
                  <Icon icon='Copy' className={t.icon} />
                </Button>
              </div>
            )}
          </div>
        </div>
        {iconsOpen ? (
          <div className={t.iconPicker}>
            <div className={t.iconSearchWrap}>
              <Icon icon='Search' className={t.searchFieldIcon} />
              <Input activeStyle='search' aria-label='Find an icon' placeholder='find an icon…' value={iconFind} onChange={e => setIconFind(e.target.value)} />
            </div>
            <div className={t.iconGrid}>
              {iconNames.map(name => (
                <Button key={name} activeStyle={item?.icon === name ? 'iconPickOn' : 'iconPick'} title={name} aria-label={name}
                        onClick={() => { togglePageSetting(item, 'icon', name, apiUpdate); setIconsOpen(false) }}>
                  <Icon icon={name} className={t.iconTileIcon} />
                </Button>
              ))}
            </div>
            <div className={t.iconNoneWrap}>
              <Button activeStyle='linkProse' onClick={() => { togglePageSetting(item, 'icon', 'none', apiUpdate); setIconsOpen(false) }}>no icon</Button>
            </div>
          </div>
        ) : null}
        <div className={t.description}>
          <Textarea activeStyle='quiet' rows={2} aria-label='Page description' placeholder='Add a short description — used by search and link previews'
                    value={description} onChange={e => setDescription(e.target.value)} />
        </div>
      </div>

      <SettingsSection t={t} Icon={Icon} title='Layout' defaultOpen
                       summary={`${sidebar || 'no'} sidebar · nav ${navShown ? 'shown' : 'hidden'}${item?.is_cover_page === 'yes' ? ' · cover' : ''}`}>
        <div>
          <span className={`${t.eyebrow} block mb-2`}>content sidebar</span>
          <div className={t.thumbs}>
            {[['none', ''], ['left', 'left'], ['right', 'right']].map(([label, v]) => (
              <LayoutThumb key={label} t={t} label={label} kind={label} active={sidebar === v}
                           onClick={() => togglePageSetting(item, 'sidebar', v, apiUpdate)} />
            ))}
          </div>
        </div>
        <div>
          <span className={`${t.eyebrow} block mb-2`}>site navigation</span>
          <div className={t.thumbs}>
            <LayoutThumb t={t} label='show' kind='nav' active={navShown} onClick={() => togglePageSetting(item, 'theme.layout.options.sideNav.size', 'compact', apiUpdate)} />
            <LayoutThumb t={t} label='hide' kind='nonav' active={!navShown} onClick={() => togglePageSetting(item, 'theme.layout.options.sideNav.size', 'none', apiUpdate)} />
            <span className='flex-1' />
          </div>
        </div>
        <SettingsLine t={t} label='Side nav style'>
          <div className={t.select}>
            <Select value={sideNavStyle === '' ? undefined : sideNavStyle} placeholder='default' options={sideNavStyles} disabled={!navShown}
                    onChange={v => togglePageSetting(item, 'theme.layout.options.sideNav.activeStyle', v, apiUpdate)} />
          </div>
        </SettingsLine>
        <SettingsLine t={t} label='Cover page' hint='Full-bleed opening band'>
          <Switch size='small' enabled={item?.is_cover_page === 'yes'} setEnabled={e => togglePageSetting(item, 'is_cover_page', e ? 'yes' : false, apiUpdate)} />
        </SettingsLine>
      </SettingsSection>

      <SettingsSection t={t} Icon={Icon} title='Navigation' defaultOpen
                       summary={`${item?.hide_in_nav ? 'hidden from nav' : 'in nav'}${item?.show_in_footer === 'show' ? ' · in footer' : ''}`}>
        {/* "Show in nav" = !hide_in_nav — the same field, label read positively */}
        <SettingsLine t={t} label='Show in nav'>
          <Switch size='small' enabled={!item?.hide_in_nav} setEnabled={e => togglePageSetting(item, 'hide_in_nav', e ? null : 'hide', apiUpdate)} />
        </SettingsLine>
        <SettingsLine t={t} label='Show in footer'>
          <Switch size='small' enabled={item?.show_in_footer === 'show'} setEnabled={e => togglePageSetting(item, 'show_in_footer', e ? 'show' : false, apiUpdate)} />
        </SettingsLine>
      </SettingsSection>

      <SettingsSection t={t} Icon={Icon} title='Link page' defaultOpen={!!item?.nav_link} summary={item?.nav_link ? `links to ${linkHost}` : 'off'}>
        <SettingsLine t={t} label='Make this a link' hint={linkOn ? '' : 'Point its nav entry somewhere else instead of showing content.'}>
          <Switch size='small' enabled={linkOn} setEnabled={e => { setLinkOn(e); if (!e) setNavLink('') }} />
        </SettingsLine>
        {linkOn ? (
          <div>
            <Input activeStyle='mono' aria-label='Link target' value={navLink} placeholder='/actions/dashboard · sub://name/path · https://…' onChange={e => setNavLink(e.target.value)} />
            <p className={t.hint}>Visitors who click it in the nav go here. It has no content of its own — the canvas shows a notice instead.</p>
            <p className={t.hint}>Accepts <span className={t.code}>/a/page</span> · <span className={t.code}>sub://name/path</span> · <span className={t.code}>https://…</span></p>
          </div>
        ) : null}
      </SettingsSection>

      {themeSettings.length ? (
        <SettingsSection t={t} Icon={Icon} title='Site theme'
                         summary={themeSettings.map(s => (typeof s.value === 'string' || typeof s.value === 'number') ? s.value : '').filter(Boolean).join(' · ')}>
          <FieldSet components={themeSettings} />
        </SettingsSection>
      ) : null}

      <SettingsSection t={t} Icon={Icon} title='Save as template' summary=''>
        <SaveAsTemplateSection t={t} />
      </SettingsSection>
    </div>
  )
}

function SettingsPane () {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...editPanesTheme, ...getComponentTheme(themeFromContext, 'pages.editPanes') };
  return t.settingsWrap ? <SettingsPaneV3 t={t} /> : <LegacySettingsPane />
}

export default SettingsPane

// The page filters editor, shared by the Filters pane (filtersPane.jsx) for the pre-v3 look.
export { FilterSettings }

const togglePageSetting = async (item,type, value='', apiUpdate) => {
  const newItem = {id: item.id}
  set(newItem, type, value)
  //console.log('update', type, newItem)

  // console.log('item', newItem, value)
  let sectionType = 'draft_sections';
  if(type === 'header' && !item?.[sectionType]?.filter(d => d.is_header)?.[0]) {
    //console.log('toggleHeader add header', newItem[sectionType])
    newItem[sectionType] = cloneDeep(item[sectionType] || [])
    newItem[sectionType].unshift({
      is_header: true,
      size: 2,
      element : {
        "element-type": "Header: Default Header",
        "element-data": {}
      }
    })

  }

  apiUpdate({data:newItem})
}

// export function PublishButton () {
//   // const {item, apiUpdate } =  React.useContext(PageContext) || {}
//   // const hasChanges = item.published === 'draft' || item.has_changes
//   // const { user, UI } = React.useContext(CMSContext) || {};
//   // const {Icon, Button} = UI;
//   //
//   // return (
//   //   <div className='w-full flex justify-center h-[40px]'>
//   //     <Button
//   //         padding={'pl-2 flex items-center h-[40px]'}
//   //         disabled={!hasChanges}
//   //         rounded={hasChanges ? 'rounded-l-lg' : 'rounded-lg'}
//   //         type={hasChanges ? 'active' : 'inactive'}
//   //         // onClick={() => publish(user,item, apiUpdate)}
//   //     >
//   //       <span className='text-nowrap'> {hasChanges ? `Publish` : `No Changes`} </span>
//   //
//   //     </Button>
//   //     {hasChanges && (
//   //       <Menu
//   //         items={[{
//   //           name: (<span className='text-[var(--t-brick)]'>Discard Changes</span>),
//   //           // onClick: () =>  discardChanges(user,item, apiUpdate)}
//   //         ]}
//   //       >
//   //         <Button padding={'py-1 w-[35px] h-[40px]'} rounded={'rounded-r-lg'} type={hasChanges ? 'active' : 'inactive'}>
//   //           <Icon icon={'CaretDown'} className='size-[28px]' />
//   //         </Button>
//   //       </Menu>
//   //     )}
//   //   </div>
//   // )
// }
