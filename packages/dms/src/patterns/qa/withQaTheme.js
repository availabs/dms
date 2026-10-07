import { get, set } from 'lodash-es'
import qaDefaultTheme from './defaultTheme'
import { LIBRARY_FLAT } from './qa.theme'

const MAP_KEYS = ['fills', 'dots']

// `theme` as QA pages render it: the theme's `qa` key (the library default merged with the site's
// own) put where the shared components read. QA pages are built from the same sections as any page
// (Card, Spreadsheet, bands, pills), and those read only their own keys, so this runs on QA pages
// only (pages/view.jsx) and no other page's style pickers list QA's styles.
// On QA pages `theme.qa` wins over the site's general keys: a site restyles QA through its `qa` key.
// - `qa.styles`: added to each component's `styles` (keyed by its theme path), replacing a
//   same-name style in the site's list.
// - `qa.text`: added to textSettings.
// - `qa.components`: over the site's own component themes (into each named style, when the site's
//   uses that shape); map keys (fills, dots) add up.
// - `qa.layout`: added to every layout style (the page chrome around QA's bands).
export const withQaTheme = (theme = {}) => {
  const qa = theme.qa || qaDefaultTheme
  const out = { ...theme }
  for (const [key, byName] of Object.entries(qa.styles || {})) {
    // `key` is a path ('pages.sectionArray'): copy each object along it, never edit the site's theme
    const [top, ...rest] = key.split('.')
    if (rest.length && out[top] === theme[top]) out[top] = { ...theme[top] }
    const component = get(theme, key)
    const own = Array.isArray(component?.styles) ? component.styles : []
    const added = Object.entries(byName).map(([name, st]) => ({ name, ...st }))
    const names = new Set(added.map(st => st.name))
    set(out, key, { ...component, styles: [...own.filter(st => !names.has(st?.name)), ...added] })
  }
  const textStyles = Array.isArray(theme.textSettings?.styles) ? theme.textSettings.styles : []
  if (textStyles.length) {
    out.textSettings = { ...theme.textSettings, styles: [{ ...textStyles[0], ...qa.text }, ...textStyles.slice(1)] }
  }
  for (const [key, flat] of Object.entries(qa.components || {})) {
    const over = (own) => {
      const merged = { ...own, ...flat }
      for (const mapKey of MAP_KEYS) {
        if (flat[mapKey] || own[mapKey]) merged[mapKey] = { ...(LIBRARY_FLAT[key]?.[mapKey] || {}), ...own[mapKey], ...flat[mapKey] }
      }
      return merged
    }
    const own = theme[key] || {}
    out[key] = over(own)
    // a site's component in the named-styles shape (`{ options, styles: [...] }`) is read through its
    // active style, so QA's keys go into every style too
    if (Array.isArray(own.styles)) out[key].styles = own.styles.map(st => ({ ...over(st), name: st?.name }))
  }
  if (qa.layout && Object.keys(qa.layout).length && Array.isArray(theme.layout?.styles)) {
    out.layout = { ...theme.layout, styles: theme.layout.styles.map(st => ({ ...st, ...qa.layout })) }
  }
  return out
}
