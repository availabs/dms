import React from 'react';
import { AdminContext } from '../../context';
import { AuthContext } from '../../../auth/context';
import { ThemeContext } from '../../../../ui/useTheme';
import { getInstance } from '../../../../utils/type-utils';
import { adminPatternType } from '../../../../utils/tenantProvisioning';
import {
  DEFAULT_USER_MENU_ID,
  DEFAULT_USER_MENU_NAME,
  getUserMenus,
  patternOwnMenuItems,
  sanitizeMenuItems,
  themeOwnMenuItems,
} from '../../../../utils/userMenus';
import { patternCan, EDIT_PATTERN } from '../../../../utils/adminPermissions';
import { SiteUserMenuContext } from '../../../../utils/userMenuContext';
import { userMenuEditorTheme } from './userMenuEditor.theme';

// Pattern Editor → User Menu: THIS pattern's avatar-menu links. A pattern either
// uses the site's Default menu (`user_menus` on the admin pattern row, shared by
// every pattern without a menu of its own) or has its own (its theme's
// navOptions.authMenu.navItems, which wins: owner, 2026-10-09). The tab edits
// whichever this pattern uses, and switching between them is part of the draft.
// render/spa/utils pattern2routes + utils/userMenus.js apply both.
// Design: design_system_v6/pages/admin-pattern-user-menu.html.

// "Preview as" option for a viewer in no particular group.
const ANY_VIEWER = '__any__';

const isExternal = (path) => /^https?:\/\//.test(path || '');
const clone = (v) => JSON.parse(JSON.stringify(v ?? null));
const parseJSON = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return undefined; } };

// What userMenu.jsx shows when nothing is configured anywhere.
const fallbackItems = (datasetsPath, adminPath) => [
  { name: 'Datasets', icon: 'Database', path: datasetsPath || '/datasets' },
  { name: 'Manager', icon: 'Settings', path: adminPath || '/list' },
];

// This pattern's theme with its own menu set (array) or removed (null). Keeps
// every other theme and navOptions key. Removal writes `authMenu: null`, not a
// missing key: edits merge nested objects key by key on the server (JSON
// merge-patch), so an omitted key keeps its old value and only null clears it.
const themeWithOwnMenu = (rawTheme, items) => {
  const theme = clone(parseJSON(rawTheme) || {});
  theme.navOptions = {
    ...(theme.navOptions || {}),
    authMenu: items === null
      ? null
      : { ...(theme.navOptions?.authMenu || {}), navItems: sanitizeMenuItems(items) },
  };
  return theme;
};

export default function UserMenuEditor({ value, apiLoad, apiUpdate }) {
  const { UI, theme } = React.useContext(ThemeContext) || {};
  const { Icon, MultiSelect } = UI;
  const t = { ...userMenuEditorTheme, ...(theme?.admin?.userMenuEditor || {}) };
  const {
    app, siteType, user, themes, parentBaseUrl, datasources = [], authPermissions,
    adminPatternRow, userMenuUsage = { total: 0, own: [] },
  } = React.useContext(AdminContext) || {};
  const { AuthAPI } = React.useContext(AuthContext) || {};
  // Shows a saved menu in this tab's own avatar menus without a reload.
  const { publish: publishLiveMenu, publishPattern: publishLivePatternMenu } = React.useContext(SiteUserMenuContext);

  const adminType = adminPatternType(getInstance(siteType) || siteType);
  const patternName = value?.name || 'this pattern';

  const [adminRow, setAdminRow] = React.useState(null);
  const [patternRow, setPatternRow] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const [defaultSaved, setDefaultSaved] = React.useState(null); // null = no Default menu saved
  const [ownSaved, setOwnSaved] = React.useState(null);         // null = no own menu
  const [mode, setMode] = React.useState('default');            // draft: 'default' | 'own'
  const [items, setItems] = React.useState([]);
  const [openIndex, setOpenIndex] = React.useState(-1);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [iconQuery, setIconQuery] = React.useState('');
  const [groups, setGroups] = React.useState([]);
  const [viewer, setViewer] = React.useState('');
  const dragFrom = React.useRef(null);
  const [dragOver, setDragOver] = React.useState(-1);
  const [confirmReset, setConfirmReset] = React.useState(false);

  // Own menu: edit access to this pattern. Default menu: edit access to the admin row.
  const canEditOwn = patternCan(user, app, authPermissions, value, EDIT_PATTERN);
  const canEditDefault = patternCan(user, app, authPermissions, adminRow || adminPatternRow || { pattern_type: 'admin' }, EDIT_PATTERN);

  // What a site with no Default menu shows: this pattern's theme's own authMenu,
  // else userMenu.jsx's fallback (with the Datasets link pointed at the site's
  // real datasets pattern).
  const themeItems = React.useMemo(() => {
    const selected = value?.theme?.selectedTheme || 'default';
    const navItems = themeOwnMenuItems(themes?.[selected]);
    if (Array.isArray(navItems)) return sanitizeMenuItems(navItems);
    const datasetsPath = datasources.find(d => d?.type === 'internal' && d?.baseUrl)?.baseUrl;
    return fallbackItems(datasetsPath, parentBaseUrl);
  }, [themes, value?.theme?.selectedTheme, datasources, parentBaseUrl]);
  const themeName = value?.theme?.selectedTheme || 'default';

  const savedMode = ownSaved ? 'own' : 'default';
  const defaultItems = defaultSaved ?? themeItems;
  // The list a mode starts from: its saved links; a new own menu starts as a copy
  // of the Default menu.
  const baselineFor = (m) => (m === 'own' ? (ownSaved ?? defaultItems) : defaultItems);

  const load = React.useCallback(async () => {
    if (!apiLoad || !app) return;
    setLoading(true);
    setError('');
    try {
      const listOf = (type) => apiLoad({
        format: { app, type, attributes: ['id', 'app', 'type', 'data'] },
        children: [{ type: () => {}, action: 'list', path: '/' }],
      });
      const [adminRows, patternRows] = await Promise.all([
        listOf(adminType),
        value?.type && value.type !== adminType ? listOf(value.type) : Promise.resolve([]),
      ]);
      // Same rule as pickAdminPattern: duplicates settle on the lowest id.
      const aRow = (adminRows || []).filter(r => r?.id)
        .sort((a, b) => (+a.id || Infinity) - (+b.id || Infinity))[0] || null;
      const pRow = (patternRows || []).find(r => `${r?.id}` === `${value?.id}`) || value || null;
      setAdminRow(aRow);
      setPatternRow(pRow);
      const menu = getUserMenus(aRow).find(m => m.id === DEFAULT_USER_MENU_ID);
      const dSaved = Array.isArray(menu?.items) ? sanitizeMenuItems(menu.items) : null;
      const own = patternOwnMenuItems(pRow);
      const oSaved = own ? sanitizeMenuItems(own) : null;
      setDefaultSaved(dSaved);
      setOwnSaved(oSaved);
      setMode(oSaved ? 'own' : 'default');
      setItems(clone(oSaved ?? dSaved ?? themeItems));
    } catch (e) {
      console.error('<UserMenuEditor:load>', e);
      setError('Could not load the user menu.');
    } finally {
      setLoading(false);
    }
  }, [apiLoad, app, adminType, value?.id, value?.type, themeItems]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    if (!user?.token || !AuthAPI?.getGroups) return;
    AuthAPI.getGroups({ user })
      .then(res => { if (!cancelled) setGroups((res?.groups || []).map(g => g?.name ?? g).filter(g => typeof g === 'string' && g !== 'public')); })
      .catch(e => console.error('<UserMenuEditor:groups>', e));
    return () => { cancelled = true; };
  }, [user?.token]);

  // Groups already on a link stay pickable even if the auth server doesn't list them.
  const allGroups = React.useMemo(() => {
    const used = items.flatMap(it => it?.groups || []);
    return [...new Set([...groups, ...used])];
  }, [groups, items]);

  // Not via sanitizeMenuItems: a new, still-empty link must count as a change.
  const fingerprint = (list) => JSON.stringify(list.map(it => it?.type === 'separator'
    ? '-' : [it?.name || '', it?.path || '', it?.icon || '', (it?.groups || []).join('|')]));
  const linksChanged = fingerprint(items) !== fingerprint(baselineFor(mode));
  const dirty = !loading && (mode !== savedMode || linksChanged);
  // Editing the Default menu's links needs the admin row; switching this
  // pattern on or off its own menu needs this pattern.
  const readOnly = mode === 'default' ? !canEditDefault : !canEditOwn;
  const canSwitch = canEditOwn;
  const linkCount = items.filter(it => it?.type !== 'separator').length;
  const incomplete = items.some(it => it?.type !== 'separator' && (!`${it?.name ?? ''}`.trim() || !`${it?.path ?? ''}`.trim()));

  const update = (fn) => { if (readOnly) return; setJustSaved(false); setItems(prev => { const next = clone(prev); fn(next); return next; }); };
  const setField = (i, key, val) => update(next => { next[i][key] = val; });
  const setLinkGroups = (i, v) => update(next => {
    next[i].groups = (Array.isArray(v) ? v : [v]).filter(g => typeof g === 'string' && g);
  });
  // `_restricted` is draft-only (sanitizeMenuItems drops it): it keeps the group
  // picker open while the author is still choosing, even with no group picked yet.
  const setRestricted = (i, on) => update(next => {
    next[i]._restricted = on;
    if (!on) next[i].groups = [];
  });
  const move = (from, to) => {
    if (to < 0 || to >= items.length || from === to) return;
    update(next => { const [it] = next.splice(from, 1); next.splice(to, 0, it); });
    if (openIndex === from) setOpenIndex(to);
  };
  const remove = (i) => { update(next => { next.splice(i, 1); }); setOpenIndex(-1); setPickerOpen(false); };
  const addLink = () => { update(next => { next.push({ name: '', icon: 'PageRound', path: '', groups: [] }); }); setOpenIndex(items.length); setPickerOpen(false); };
  const addDivider = () => update(next => { next.push({ type: 'separator' }); });
  const toggleOpen = (i) => { if (readOnly) return; setOpenIndex(openIndex === i ? -1 : i); setPickerOpen(false); setIconQuery(''); };
  const switchMode = (m) => {
    if (m === mode || !canSwitch) return;
    setMode(m); setItems(clone(baselineFor(m))); setOpenIndex(-1); setPickerOpen(false); setJustSaved(false); setConfirmReset(false);
  };

  // The Default menu, on the admin row. null removes it (reset to theme default).
  const writeDefault = async (nextItems) => {
    if (!adminRow?.id) throw new Error('no admin row');
    const others = getUserMenus(adminRow).filter(m => m.id !== DEFAULT_USER_MENU_ID);
    const user_menus = nextItems === null
      ? others
      : [{ id: DEFAULT_USER_MENU_ID, name: DEFAULT_USER_MENU_NAME, items: sanitizeMenuItems(nextItems) }, ...others];
    await apiUpdate({ data: { id: adminRow.id, user_menus }, config: { format: { app, type: adminType } } });
    setAdminRow({ ...adminRow, user_menus });
    const saved = nextItems === null ? null : sanitizeMenuItems(nextItems);
    publishLiveMenu(saved);
    setDefaultSaved(saved);
    return saved;
  };
  // This pattern's own menu, in its theme. null removes it (back to the Default menu).
  const writeOwn = async (nextItems) => {
    const row = patternRow || value;
    const nextTheme = themeWithOwnMenu(row?.theme, nextItems);
    await apiUpdate({ data: { id: row.id, theme: nextTheme }, config: { format: { app, type: row.type } } });
    setPatternRow({ ...row, theme: nextTheme });
    const saved = nextItems === null ? null : sanitizeMenuItems(nextItems);
    publishLivePatternMenu(row.id, saved);
    setOwnSaved(saved);
    return saved;
  };

  const run = async (fn) => {
    if (!apiUpdate) return;
    setSaving(true);
    setError('');
    try {
      await fn();
      setOpenIndex(-1);
      setJustSaved(true);
    } catch (e) {
      console.error('<UserMenuEditor:save>', e);
      setError('Could not save the user menu.');
    } finally {
      setSaving(false);
    }
  };

  const save = () => run(async () => {
    if (mode === 'own') {
      const saved = await writeOwn(items);
      setItems(clone(saved));
      return;
    }
    // Back on the Default menu: drop this pattern's own menu, and save the
    // Default menu's links too if they changed (and the user may).
    if (savedMode === 'own') await writeOwn(null);
    let dSaved = defaultSaved;
    if (linksChanged && canEditDefault) dSaved = await writeDefault(items);
    setItems(clone(dSaved ?? themeItems));
  });
  const resetDefault = () => run(async () => {
    await writeDefault(null);
    setItems(clone(themeItems));
  });

  const discard = () => { setMode(savedMode); setItems(clone(baselineFor(savedMode))); setOpenIndex(-1); setPickerOpen(false); };

  const iconNames = React.useMemo(() => Object.keys(theme?.Icons || {}).sort(), [theme?.Icons]);
  const iconMatches = React.useMemo(() => {
    const q = iconQuery.trim().toLowerCase();
    return (q ? iconNames.filter(n => n.toLowerCase().includes(q)) : iconNames).slice(0, 160);
  }, [iconNames, iconQuery]);

  // Preview: what one viewer sees (userMenu.jsx order: links, Profile, …, Logout).
  const viewerGroups = viewer ? [viewer] : [];
  const visible = sanitizeMenuItems(items.filter(it =>
    it?.type === 'separator' || !it?.groups?.length || it.groups.some(g => viewerGroups.includes(g))
  ));
  const hiddenCount = sanitizeMenuItems(items).filter(it => it.type !== 'separator').length
    - visible.filter(it => it.type !== 'separator').length;

  // Who the Default menu reaches (boot-time count, adjusted for this pattern's draft).
  const ownOthers = userMenuUsage.own.filter(p => p.id !== `${value?.id}`);
  const usingDefault = Math.max(0, userMenuUsage.total - ownOthers.length - (mode === 'own' ? 1 : 0));
  const scopeLabel = mode === 'own'
    ? `own menu · only ${patternName}`
    : `${DEFAULT_USER_MENU_NAME} · used by ${usingDefault} of ${userMenuUsage.total} patterns`;
  const subtitle = `${patternName} uses ${savedMode === 'own' ? 'its own menu' : `the ${DEFAULT_USER_MENU_NAME}`}`;

  if (mode === 'default' && !adminRow && !loading && !error) {
    return (
      <div className={t.wrapper}>
        <Header t={t} Icon={Icon} subtitle={subtitle} scopeLabel={scopeLabel} />
        <div className={t.notice}>
          <Icon icon="InfoCircle" className={t.noticeIcon} />
          <span>This site has no admin pattern row yet, so the Default menu can't be saved. Open the admin site list once (it creates the row), then come back.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={t.wrapper}>
      <Header
        t={t}
        Icon={Icon}
        subtitle={subtitle}
        scopeLabel={scopeLabel}
        actions={
          <>
            {justSaved && !dirty && <span className={t.savedNote}>saved</span>}
            {dirty && <span className={t.dirtyNote}><span className={t.dirtyDot} />unsaved</span>}
            {dirty && <button type="button" className={t.discardBtn} disabled={saving} onClick={discard}>discard</button>}
            {dirty && (
              <button
                type="button"
                className={t.saveBtn}
                disabled={saving || (!readOnly && incomplete)}
                title={!readOnly && incomplete ? 'Every link needs a label and a link' : undefined}
                onClick={save}
              >{saving ? 'saving…' : 'save'}</button>
            )}
          </>
        }
      />

      {error && <div className={t.error}>{error}</div>}

      {loading ? <div className={t.loading}>Loading…</div> : (
        <>
          <div className={t.modeRow}>
            <span className={t.modeLabel}>menu for this pattern</span>
            <div className={t.segmented}>
              <button type="button" disabled={!canSwitch} className={mode === 'default' ? t.segmentActive : t.segment} onClick={() => switchMode('default')}>{DEFAULT_USER_MENU_NAME}</button>
              <button type="button" disabled={!canSwitch} className={mode === 'own' ? t.segmentActive : t.segment} onClick={() => switchMode('own')}>own menu</button>
            </div>
          </div>

          {mode === 'own' && (
            <div className={t.notice}>
              <Icon icon="InfoCircle" className={t.noticeIcon} />
              <span>
                {savedMode === 'own'
                  ? <>Only <b>{patternName}</b> shows these links; it ignores the {DEFAULT_USER_MENU_NAME}.</>
                  : <>Saving gives <b>{patternName}</b> its own links, starting from a copy of the {DEFAULT_USER_MENU_NAME}. Other patterns keep the {DEFAULT_USER_MENU_NAME}.</>}
              </span>
            </div>
          )}
          {mode === 'default' && savedMode === 'own' && (
            <div className={t.notice}>
              <Icon icon="InfoCircle" className={t.noticeIcon} />
              <span>Saving removes <b>{patternName}</b>'s own links ({ownSaved?.filter(it => it.type !== 'separator').length || 0}), and it shows the {DEFAULT_USER_MENU_NAME} below.</span>
            </div>
          )}
          {mode === 'default' && (
            <div className={t.notice}>
              <Icon icon="InfoCircle" className={t.noticeIcon} />
              <span>
                {defaultSaved === null
                  ? <>These links come from the <b>{themeName}</b> theme. Change anything and save to make it this site's {DEFAULT_USER_MENU_NAME}. </>
                  : <>Shared: changes here reach every pattern that uses the {DEFAULT_USER_MENU_NAME} ({usingDefault} of {userMenuUsage.total}). </>}
                {readOnly && <>Only people who can edit the admin pattern can change it. </>}
                {ownOthers.length > 0 && (
                  <details className={t.ownList}>
                    <summary className={t.ownListSummary}>{ownOthers.length} other pattern{ownOthers.length === 1 ? ' has its' : 's have their'} own menu and ignore{ownOthers.length === 1 ? 's' : ''} it</summary>
                    <span className={t.ownListNames}>{ownOthers.map(p => p.name).join(' · ')}</span>
                  </details>
                )}
              </span>
            </div>
          )}

          <div className={t.grid}>
            <div className={t.listCol}>
              <div className={t.card}>
                <div className={t.cardHeader}>
                  <span className={t.cardTitle}>links</span>
                  <span className={t.count}>{linkCount}</span>
                  <span className={t.spacer} />
                  {!readOnly && (
                    <>
                      <button type="button" className={t.ghostBtn} onClick={addDivider}>
                        <Icon icon="Minus" className={t.ghostBtnIcon} />divider
                      </button>
                      <button type="button" className={t.addBtn} onClick={addLink}>
                        <Icon icon="Plus" className={t.addBtnIcon} />add link
                      </button>
                    </>
                  )}
                </div>

                {!items.length && <div className={t.empty}>No links of its own. Only the items below show.</div>}

                <ol className={t.list}>
                  {items.map((it, i) => {
                    const dropProps = {
                      onDragOver: (e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); },
                      onDragLeave: () => setDragOver(-1),
                      onDrop: (e) => { e.preventDefault(); setDragOver(-1); if (dragFrom.current !== null) move(dragFrom.current, i); dragFrom.current = null; },
                    };
                    const grip = (
                      <span
                        className={t.grip}
                        draggable
                        title="drag to reorder"
                        onClick={(e) => e.stopPropagation()}
                        onDragStart={(e) => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(i)); } catch { /* some browsers refuse */ } }}
                      >
                        <Icon icon="Reorder" className={t.gripIcon} />
                      </span>
                    );
                    if (it?.type === 'separator') {
                      return (
                        <li key={i} className={`${t.dividerRow} ${dragOver === i ? t.rowDragOver : ''}`} {...dropProps}>
                          {grip}
                          <span className={t.dividerLine} />
                          <span className={t.dividerLabel}>divider</span>
                          <button type="button" className={t.dividerRemove} aria-label="remove divider" onClick={() => remove(i)}>
                            <Icon icon="XMark" className={t.dividerRemoveIcon} />
                          </button>
                        </li>
                      );
                    }
                    const open = openIndex === i;
                    const restricted = it._restricted ?? (it.groups || []).length > 0;
                    return (
                      <li key={i} className={`${open ? t.rowOpen : t.row} ${dragOver === i ? t.rowDragOver : ''}`} {...dropProps}>
                        <div className={t.rowHead} onClick={() => toggleOpen(i)}>
                          {grip}
                          <span className={t.rowIconTile}><Icon icon={it.icon || 'PageRound'} className={t.rowIcon} /></span>
                          <span className={t.rowText}>
                            <span className={it.name ? t.rowName : t.rowNamePlaceholder}>{it.name || 'untitled link'}</span>
                            <span className={t.rowPath}>{it.path || 'no link yet'}{isExternal(it.path) ? ' ↗' : ''}</span>
                          </span>
                          {(it.groups || []).length ? (
                            <span className={t.audienceChip} title={it.groups.join(', ')}>
                              <Icon icon="Lock" className={t.audienceChipIcon} />
                              <span className={t.audienceChipText}>{it.groups.length === 1 ? it.groups[0] : `${it.groups.length} groups`}</span>
                            </span>
                          ) : <span className={t.audienceAll}>everyone</span>}
                          <Icon icon={open ? 'CaretDown' : 'ArrowRight'} className={t.chevron} />
                        </div>

                        {open && (
                          <div className={t.editor}>
                            <div className={t.fields}>
                              <label className={t.label}>label</label>
                              <input className={t.input} value={it.name || ''} autoFocus={!it.name} onChange={(e) => setField(i, 'name', e.target.value)} />

                              <label className={t.label}>link</label>
                              <div>
                                <input className={t.pathInput} value={it.path || ''} placeholder="/page-path or https://…" onChange={(e) => setField(i, 'path', e.target.value)} />
                                <p className={t.help}>{isExternal(it.path) ? 'A full URL, to another site.' : 'A path on this site, like /data or /list.'}</p>
                              </div>

                              <label className={t.label}>icon</label>
                              <div>
                                <button type="button" className={pickerOpen ? t.iconBtnOpen : t.iconBtn} onClick={() => setPickerOpen(!pickerOpen)}>
                                  <span className={t.iconBtnTile}><Icon icon={it.icon || 'PageRound'} className={t.iconBtnIcon} /></span>
                                  <span className={t.iconBtnName}>{it.icon || 'PageRound'}</span>
                                  <Icon icon="CaretDown" className={t.iconBtnCaret} />
                                </button>
                                {pickerOpen && (
                                  <div className={t.picker}>
                                    <div className={t.pickerSearch}>
                                      <Icon icon="Search" className={t.pickerSearchIcon} />
                                      <input className={t.pickerSearchInput} placeholder="search icons…" value={iconQuery} autoFocus onChange={(e) => setIconQuery(e.target.value)} />
                                    </div>
                                    <div className={t.pickerGrid}>
                                      {iconMatches.map(name => (
                                        <button
                                          key={name}
                                          type="button"
                                          title={name}
                                          className={name === it.icon ? t.pickerItemActive : t.pickerItem}
                                          onClick={() => { setField(i, 'icon', name); setPickerOpen(false); setIconQuery(''); }}
                                        >
                                          <Icon icon={name} className={t.pickerItemIcon} />
                                        </button>
                                      ))}
                                      {!iconMatches.length && <div className={t.pickerEmpty}>No icons match.</div>}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <label className={t.label}>who sees it</label>
                              <div className={t.audienceWrap}>
                                <div className={t.segmented}>
                                  <button type="button" className={!restricted ? t.segmentActive : t.segment} onClick={() => setRestricted(i, false)}>everyone signed in</button>
                                  <button type="button" className={restricted ? t.segmentActive : t.segment} onClick={() => setRestricted(i, true)}>only some groups</button>
                                </div>
                                {restricted && (
                                  <>
                                    <div className={t.groupSelect}>
                                      <MultiSelect
                                        value={it.groups || []}
                                        options={allGroups.map(g => ({ label: g, value: g }))}
                                        placeholder="search groups…"
                                        searchable
                                        onChange={(v) => setLinkGroups(i, v)}
                                      />
                                    </div>
                                    <p className={t.help}>{(it.groups || []).length
                                      ? 'Shown to members of any selected group.'
                                      : 'No group picked yet, so everyone signed in still sees it.'}</p>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className={t.editorFooter}>
                              <button type="button" className={t.removeBtn} onClick={() => remove(i)}>
                                <Icon icon="TrashCan" className={t.removeBtnIcon} />remove link
                              </button>
                              <span className={t.spacer} />
                              <button type="button" className={t.moveBtn} disabled={i === 0} onClick={() => move(i, i - 1)}>up</button>
                              <button type="button" className={t.moveBtn} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>down</button>
                              <button type="button" className={t.doneBtn} onClick={() => toggleOpen(i)}>done</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>

                <div className={t.builtins}>
                  <div className={t.builtinsHead}>
                    <Icon icon="Lock" className={t.builtinsHeadIcon} />
                    <span className={t.builtinsTitle}>always included</span>
                  </div>
                  <ul className={t.builtinsList}>
                    {[
                      ['User', 'Profile', 'everyone'],
                      ['Group', 'View As User…', 'view-as permission'],
                      ['Refresh', 'Sync status & actions', 'when sync is on'],
                      ['Logout', 'Logout', 'everyone'],
                    ].map(([icon, name, note]) => (
                      <li key={name} className={t.builtinRow}>
                        <span className={t.builtinIconWrap}><Icon icon={icon} className={t.builtinIcon} /></span>
                        <span className={t.builtinName}>{name}</span>
                        <span className={t.builtinNote}>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className={t.footerLinks}>
                {mode === 'default' && savedMode === 'default' && defaultSaved !== null && canEditDefault && (confirmReset ? (
                  <span className={t.confirmRow}>
                    <span className={t.confirmLabel}>Remove the site's {DEFAULT_USER_MENU_NAME} and use the theme's links on every pattern without its own menu?</span>
                    <button type="button" className={t.confirmYes} disabled={saving} onClick={() => { setConfirmReset(false); resetDefault(); }}>reset</button>
                    <button type="button" className={t.confirmNo} onClick={() => setConfirmReset(false)}>cancel</button>
                  </span>
                ) : (
                  <button type="button" className={t.resetBtn} disabled={saving} onClick={() => setConfirmReset(true)}>
                    reset to theme default
                  </button>
                ))}
                <span className={t.footerNote}>{scopeLabel}</span>
              </div>
            </div>

            <div className={t.previewCol}>
              <div className={t.previewCard}>
                <div className={t.previewHeader}>
                  <span className={t.previewTitle}>preview as</span>
                  <span className={t.spacer} />
                  <div className={t.viewerSelect}>
                    <MultiSelect
                      value={viewer || ANY_VIEWER}
                      options={[{ label: 'anyone signed in', value: ANY_VIEWER }, ...allGroups.map(g => ({ label: g, value: g }))]}
                      placeholder="search groups…"
                      singleSelectOnly
                      searchable
                      onChange={(v) => setViewer(v && v !== ANY_VIEWER && !Array.isArray(v) ? v : '')}
                    />
                  </div>
                </div>
                <div className={t.previewBody}>
                  <div className={t.previewMenu}>
                    {visible.map((it, i) => it.type === 'separator'
                      ? <div key={i} className={t.previewSep} />
                      : (
                        <div key={i} className={t.previewItem}>
                          <Icon icon={it.icon || 'PageRound'} className={t.previewItemIcon} />
                          <span className={t.previewItemName}>{it.name}</span>
                          {isExternal(it.path) && <Icon icon="ArrowUpRight" className={t.previewItemIcon} />}
                        </div>
                      ))}
                    <div className={t.previewItem}><Icon icon="User" className={t.previewItemIcon} /><span className={t.previewItemName}>Profile</span></div>
                    <div className={t.previewSep} />
                    <div className={t.previewItem}><Icon icon="Logout" className={t.previewItemIcon} /><span className={t.previewItemName}>Logout</span></div>
                  </div>
                  <p className={t.previewNote}>
                    {hiddenCount
                      ? `${hiddenCount} ${hiddenCount === 1 ? 'link is' : 'links are'} hidden from this viewer.`
                      : 'This viewer sees every link.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Header({ t, Icon, subtitle, scopeLabel, actions = null }) {
  return (
    <div className={t.header}>
      <div className={t.headerTitleWrap}>
        <div className={t.headerTitleRow}>
          <h1 className={t.headerTitle}>User Menu</h1>
        </div>
        <p className={t.headerSubtitle}>{subtitle}</p>
      </div>
      <div className={t.headerActions}>
        <span className={t.scopePill}><Icon icon="Pages" className={t.scopePillIcon} />{scopeLabel}</span>
        {actions}
      </div>
    </div>
  );
}
