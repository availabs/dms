import React, { useContext, useEffect, useState } from 'react'
import { set } from 'lodash-es'
import { PageContext, CMSContext } from '../../../context'
import { ThemeContext, getComponentTheme } from '../../../../../ui/useTheme'
import { getPageAuthPermissions } from '../../../pages/_utils'
import { FilterSettings } from './settingsPane'
import { editPanesTheme } from './editPanes.theme'

// The page's filters (item.filters — named page variables every section can use). Its own drawer
// pane since 2026-10-08 (was a field at the bottom of Settings). Needs edit-page-params.
// v3 (`pages.editPanes.filtersWrap` set): one-line rows — key · where the value comes from · current
// value — that expand one at a time; '' → the pre-v3 FilterSettings grid.

const valueText = (v) => Array.isArray(v) ? v.join(', ') : (v ?? '')

function FilterRow({ t, filter, filters, current, open, onToggle, onUpdate, onRemove }) {
  const { UI } = useContext(ThemeContext);
  const { Icon, Switch, Select, Button, Input, FieldLabel } = UI;
  const derived = !!filter.derivedFrom;
  const chip = derived
    ? <span className={t.filterChip}><Icon icon='ArrowRight' className={t.icon} />{filter.derivedFrom}</span>
    : filter.useSearchParams
      ? <span className={t.filterChip}><Icon icon='Link' className={t.icon} />url</span>
      : <span className={t.filterChip}>fixed</span>;
  const sources = [{ label: '— not derived —', value: '' },
    ...filters.filter(f => f.searchKey && f.searchKey !== filter.searchKey && !f.derivedFrom).map(f => ({ label: f.searchKey, value: f.searchKey }))];
  return (
    <div className={t.filterRow}>
      <div className={t.filterSummaryCell}>
        <Button activeStyle='bare' onClick={onToggle} aria-expanded={open}>
          <span className={t.filterSummary}>
            <span className={t.filterKey}>{filter.searchKey || '(no key)'}</span>{chip}
            <span className={t.filterValue}>{valueText(current ?? filter.values)}</span>
            <Icon icon='ChevronDown' className={`${t.sectChevron} ${open ? 'rotate-180' : ''}`} />
          </span>
        </Button>
      </div>
      {open ? (
        <div className={t.filterBody}>
          <FieldLabel text='key'>
            <Input activeStyle='mono' value={filter.searchKey || ''} onChange={e => onUpdate('searchKey', e.target.value)} />
          </FieldLabel>
          {derived ? (
            <>
              <div className={t.grid2}>
                <div className={t.field}><FieldLabel text='derived from' />
                  <Select value={filter.derivedFrom || undefined} placeholder='— not derived —' options={sources} onChange={v => onUpdate('derivedFrom', v || undefined)} />
                </div>
                <div className={t.field}><FieldLabel text='derive' />
                  <Select value={filter.derive || ''} options={[{ label: 'year of YYYYMM', value: 'yyyy' }]} onChange={v => onUpdate('derive', v || undefined)} />
                </div>
              </div>
              <FieldLabel text={`fallback while ${filter.derivedFrom} is unset`}>
                <Input value={valueText(filter.values)} onChange={e => onUpdate('values', e.target.value)} />
              </FieldLabel>
              <p className={t.hint}>Follows <span className={t.code}>{filter.derivedFrom}</span>. Keep it out of the URL — a derived value there is re-emitted stale.</p>
            </>
          ) : (
            <>
              <FieldLabel text='default value'>
                <Input value={valueText(filter.values)} onChange={e => onUpdate('values', e.target.value)} />
              </FieldLabel>
              <div className={t.line}>
                <span className={t.lineLabel}><span className={t.lineText}>Read from URL</span><span className={t.lineHint}>?{filter.searchKey || 'key'}= overrides the default</span></span>
                <Switch size='small' enabled={!!filter.useSearchParams} setEnabled={e => onUpdate('useSearchParams', e)} />
              </div>
              <div className={t.field}><FieldLabel text='derived from' />
                <Select value={filter.derivedFrom || undefined} placeholder='— not derived —' options={sources} onChange={v => onUpdate('derivedFrom', v || undefined)} />
              </div>
            </>
          )}
          <div className={t.filterRemoveWrap}>
            <Button activeStyle='linkMetaDanger' onClick={onRemove}><Icon icon='Trash' className={t.icon} />remove filter</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FiltersPaneV3({ t, value, stateValue, onChange }) {
  const { UI } = useContext(ThemeContext);
  const { pageState } = useContext(PageContext) || {};
  const { Icon, Switch, Button, Input } = UI;
  const [filters, setFilters] = useState(typeof value === 'string' ? JSON.parse(value) : (value || []));
  const [openIdx, setOpenIdx] = useState(-1);
  const [adding, setAdding] = useState(null);
  const commit = (next) => { setFilters(next); onChange(next) };
  const autoVars = (pageState?.filters || []).filter(f => f.auto);

  return (
    <div className={t.filtersWrap}>
      <p className={t.intro}>Named values every section on this page can use (a section’s Filters → “use page filters”).</p>
      {filters.length ? (
        <div className={t.filterList}>
          {filters.map((f, i) => (
            <FilterRow key={f.id || i} t={t} filter={f} filters={filters}
                       current={(stateValue || []).find(sf => sf.searchKey === f.searchKey)?.values}
                       open={openIdx === i} onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
                       onUpdate={(k, v) => commit(filters.map((x, j) => j === i ? { ...x, [k]: v } : x))}
                       onRemove={() => { commit(filters.filter((_, j) => j !== i)); setOpenIdx(-1) }} />
          ))}
        </div>
      ) : <div className={t.filterEmpty}>No page filters yet.</div>}

      {adding ? (
        <div className={t.filterAddForm}>
          <div className={t.grid2}>
            <Input activeStyle='mono' aria-label='Filter key' placeholder='key' value={adding.searchKey || ''} onChange={e => setAdding({ ...adding, searchKey: e.target.value })} />
            <Input aria-label='Default value' placeholder='default value' value={adding.values || ''} onChange={e => setAdding({ ...adding, values: e.target.value })} />
          </div>
          <div className={t.line}>
            <span className={t.lineLabel}><span className={t.lineText}>Read from URL</span></span>
            <Switch size='small' enabled={!!adding.useSearchParams} setEnabled={e => setAdding({ ...adding, useSearchParams: e })} />
          </div>
          <div className={`${t.line} justify-end`}>
            <Button activeStyle='action' onClick={() => setAdding(null)}>Cancel</Button>
            <Button activeStyle='primary' disabled={!adding.searchKey}
                    onClick={() => { commit([...filters, { id: crypto.randomUUID(), ...adding }]); setAdding(null) }}>Add filter</Button>
          </div>
        </div>
      ) : (
        <div className={t.filterAddWrap}>
          <Button activeStyle='linkProse' onClick={() => setAdding({})}><Icon icon='Plus' className={t.icon} />add filter</Button>
        </div>
      )}

      {filters.length ? (
        <div className={t.filterClearWrap}>
          <Button activeStyle='linkMetaDanger' onClick={() => { commit([]); setOpenIdx(-1) }}>remove all filters</Button>
        </div>
      ) : null}

      {autoVars.length ? (
        <div className={t.autoVars}>
          <div className={t.autoVarsTitle}>Auto-registered variables</div>
          <div className={t.lineHint}>Owned by a section on this page (e.g. a shareable map). Read-only.</div>
          {autoVars.map((f, i) => (
            <div key={`auto_var_${f.searchKey || i}`} className={t.autoVarRow}>
              <span className={`${t.code} truncate`}>{f.searchKey}</span>
              <span className='truncate'>{valueText(f.values)}</span>
              <span>{f.useSearchParams ? 'URL' : ''}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function FiltersPane() {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...editPanesTheme, ...getComponentTheme(themeFromContext, 'pages.editPanes') };
  const { isUserAuthed } = useContext(CMSContext) || {};
  const { item, pageState, apiUpdate } = useContext(PageContext) || {};
  const pageAuthPermissions = getPageAuthPermissions(pageState?.authPermissions);
  const [itemId, setItemId] = useState(item?.id);
  useEffect(() => { setItemId(item?.id) }, [item?.id]);
  if (!isUserAuthed(['edit-page-params'], pageAuthPermissions)) return null;
  const onChange = (filters) => {
    const newItem = { id: item.id };
    set(newItem, 'filters', filters);
    apiUpdate({ data: newItem });
  };
  if (!t.filtersWrap) return (
    <div className='flex flex-col p-2 w-full'>
      <FilterSettings key={itemId} value={item?.filters || []} stateValue={pageState?.filters || []} onChange={onChange} />
    </div>
  );
  return <FiltersPaneV3 key={itemId} t={t} value={item?.filters || []} stateValue={pageState?.filters || []} onChange={onChange} />
}
