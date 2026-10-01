import React from 'react'
import { ThemeContext, getComponentTheme } from '../useTheme.js'
import Icon from './Icon'
import { themeToggleTheme } from './ThemeToggle.theme'

const STORAGE_KEY = 'dms-color-scheme'

// Picks dark or light: the viewer's saved choice ("dark"/"light") wins; else
// the theme's `defaultColorScheme` ('light' | 'dark') when it sets one; else the
// OS preference. Writes it to <html data-theme> and returns whether it's dark.
// dmsSiteFactory.jsx calls this once before the first render (no theme known
// yet), and each pattern route calls it again with its theme's default (see
// render/spa/utils/PatternColorScheme.jsx).
export function applySavedColorScheme (defaultColorScheme) {
  if (typeof document === 'undefined') return false
  let stored
  try { stored = window.localStorage.getItem(STORAGE_KEY) } catch (e) { /* noop */ }
  const prefersDark = stored ? stored === 'dark'
    : ['light', 'dark'].includes(defaultColorScheme) ? defaultColorScheme === 'dark'
    : !!window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
  if (prefersDark) document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  return prefersDark
}

export default function ThemeToggleComp(props) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {}
  const theme = { ...themeToggleTheme, ...getComponentTheme(themeFromContext, 'themeToggle', props.activeStyle) }
  const [isDark, setIsDark] = React.useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'
  )

  // The pattern route already applied the scheme (PatternColorScheme's layout
  // effect runs before this); just pick it up, e.g. after SSR hydration.
  React.useEffect(() => {
    setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
  }, [])

  const toggle = () => {
    const next = !isDark
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    try { window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light') } catch (e) { /* noop */ }
    setIsDark(next)
  }

  return (
    <button type="button" onClick={toggle} aria-label="Toggle dark mode" className={theme.button}>
      <Icon icon={isDark ? 'Sun' : 'Moon'} className={theme.icon} />
    </button>
  )
}
