import React, { useState } from 'react'
import { ThemeContext } from '../../../ui/useTheme'
import { nameToSlug } from '../../../utils/type-utils'
import { patternPickerTheme } from './AddPatternPicker.theme'

const NON_PAGE_OPTIONS = [
  { kind: 'datasets', label: 'Datasets', desc: 'Connect and manage data sources' },
  { kind: 'forms',    label: 'Forms',    desc: 'Collect user-submitted data' },
]
const AUTH_OPTION = { kind: 'auth', label: 'Auth', desc: 'Authentication and access control' }

function getDefaultName(card, pageTemplates) {
  if (card.kind === 'datasets') return 'Data'
  if (card.kind === 'forms')    return 'Forms'
  if (card.kind === 'auth')     return 'Auth'
  if (card.kind === 'page') {
    if (card.templateId === 'blank') return 'Pages'
    return pageTemplates.find(pt => pt.id === card.templateId)?.name ?? 'Pages'
  }
  return card.label ?? ''
}

export function AddPatternPicker({ authExists, onAdd }) {
  const { theme } = React.useContext(ThemeContext) || {}
  const t = { ...patternPickerTheme, ...(theme?.admin?.patternPicker || {}) }
  const pageTemplates = theme?.page_templates ?? []

  const [selected, setSelected] = useState(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [urlEdited, setUrlEdited] = useState(false)

  const nonPageOptions = authExists
    ? NON_PAGE_OPTIONS
    : [...NON_PAGE_OPTIONS, AUTH_OPTION]

  function select(card) {
    const defaultName = getDefaultName(card, pageTemplates)
    setSelected(card)
    setName(defaultName)
    setBaseUrl(nameToSlug(defaultName))
    setUrlEdited(false)
  }

  function handleNameChange(e) {
    const v = e.target.value
    setName(v)
    if (!urlEdited) setBaseUrl(nameToSlug(v))
  }

  function handleUrlChange(e) {
    setBaseUrl(e.target.value)
    setUrlEdited(true)
  }

  function handleAdd() {
    if (!selected || !name) return
    onAdd({
      pattern_type: selected.kind,
      name,
      base_url: baseUrl,
      templateId: selected.kind === 'page' ? selected.templateId : null,
    })
    setSelected(null)
    setName('')
    setBaseUrl('')
    setUrlEdited(false)
  }

  function isSelected(card) {
    if (!selected || card.kind !== selected.kind) return false
    if (card.kind === 'page') return card.templateId === selected.templateId
    return true
  }

  const confirmLabel = selected
    ? selected.kind === 'page'
      ? `${pageTemplates.find(pt => pt.id === selected.templateId)?.name ?? selected.templateId} — page pattern`
      : `${selected.label} pattern`
    : ''

  return (
    <div>
      <div className={t.grid}>
        {nonPageOptions.map(opt => (
          <div
            key={opt.kind}
            className={isSelected(opt) ? t.optCardSelected : t.optCard}
            onClick={() => select(opt)}
          >
            <div className={t.optName}>{opt.label}</div>
            <div className={t.optDesc}>{opt.desc}</div>
          </div>
        ))}

        {/* fill remaining cells so page templates start on a new row */}
        {Array.from({ length: (3 - (nonPageOptions.length % 3)) % 3 }).map((_, i) => (
          <div key={`spacer-${i}`} />
        ))}

        <div className={t.dividerRow}>
          <div className={t.dividerLine} />
          <div className={t.dividerLabel}>page templates</div>
          <div className={t.dividerLine} />
        </div>

        {pageTemplates.map(tmpl => {
          const card = { kind: 'page', templateId: tmpl.id, label: tmpl.name }
          const sel = isSelected(card)
          return (
            <div
              key={tmpl.id}
              className={sel ? t.optCardSelected : t.optCard}
              onClick={() => select(card)}
            >
              <span className={sel ? t.pageTagSelected : t.pageTag}>page</span>
              <div className={t.optName}>{tmpl.name}</div>
              <div className={t.optDesc}>{tmpl.description}</div>
            </div>
          )
        })}
      </div>

      {selected ? (
        <div className={t.confirmArea}>
          <div className={t.confirmLabel}>{confirmLabel}</div>
          <div className={t.confirmFields}>
            <div className={t.confirmField}>
              <div className={t.fieldLabel}>Name</div>
              <input
                className={t.fieldInput}
                value={name}
                onChange={handleNameChange}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                autoFocus
              />
            </div>
            <div className={t.urlField}>
              <div className={t.fieldLabel}>Base URL</div>
              <input
                className={t.fieldInput}
                value={baseUrl}
                onChange={handleUrlChange}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <button className={t.btnAdd} onClick={handleAdd} disabled={!name}>
              Add
            </button>
          </div>
        </div>
      ) : (
        <div className={t.emptyArea}>Select an option above to continue</div>
      )}
    </div>
  )
}
