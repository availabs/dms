import React from 'react'
import { ThemeContext } from '../../../ui/useTheme'
import { createSiteTheme } from './createSite.theme'

// Radio cards for the site templates (theme.site_templates). Used by the New site page, TenantList's
// "Add tenant" modal and the multi-tenant sign-up page. `label={null}` hides the picker's own label when
// the caller renders a section label instead.
export default function SiteTemplatePicker({ siteTemplates = [], selectedTemplateId, onSelect, label = 'Site Template' }) {
  const { theme, UI } = React.useContext(ThemeContext)
  const t = { ...createSiteTheme, ...(theme?.admin?.createSite || {}) }

  if (!siteTemplates.length) return null;

  return (
    <div className={t.templateSection}>
      {label && <span className={t.templateLabel}>{label}</span>}
      <div role="radiogroup" aria-label={label || 'Site template'} className={t.templateGrid}>
        {siteTemplates.map(tmpl => {
          const selected = selectedTemplateId === tmpl.id;
          return (
            <UI.Button
              key={tmpl.id}
              role="radio"
              aria-checked={selected}
              activeStyle={selected ? 'optionCardOn' : 'optionCard'}
              onClick={() => onSelect(tmpl.id)}
            >
              <span className={selected ? t.templateRadioSelected : t.templateRadio} />
              <span className={t.templateCardBody}>
                <span className={t.templateCardName}>{tmpl.name}</span>
                <span className={t.templateCardDesc}>{tmpl.description}</span>
              </span>
            </UI.Button>
          );
        })}
      </div>
    </div>
  )
}
