import React from 'react'
import { ThemeContext } from '../../../ui/useTheme'
import { createSiteTheme } from './createSite.theme'

export default function SiteTemplatePicker({ siteTemplates = [], selectedTemplateId, onSelect }) {
  const { theme } = React.useContext(ThemeContext)
  const t = { ...createSiteTheme, ...(theme?.admin?.createSite || {}) }

  if (!siteTemplates.length) return null;

  return (
    <div className={t.templateSection}>
      <label className={t.templateLabel}>Site Template</label>
      <div className={t.templateGrid}>
        {siteTemplates.map(tmpl => (
          <div
            key={tmpl.id}
            className={selectedTemplateId === tmpl.id ? t.templateCardSelected : t.templateCard}
            onClick={() => onSelect(tmpl.id)}
          >
            <div className={t.templateCardName}>{tmpl.name}</div>
            <div className={t.templateCardDesc}>{tmpl.description}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
