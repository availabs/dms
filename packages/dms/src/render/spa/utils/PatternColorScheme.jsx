import React from 'react'
import { applySavedColorScheme } from '../../../ui/components/ThemeToggle'
import { parseIfJSON } from '../../../patterns/page/pages/_utils'

// The theme-level `defaultColorScheme` ('light' | 'dark') for a pattern: the
// pattern's own theme override, else the theme it selects (same selection
// paths as getPatternTheme in ui/useTheme.js). Undefined = follow the OS.
export function getPatternColorScheme (themes, pattern) {
  const theme = parseIfJSON(pattern?.theme, pattern?.theme)
  const selection = theme?.selectedTheme || theme?.settings?.theme?.theme || 'default'
  const value = theme?.defaultColorScheme || themes?.[selection]?.defaultColorScheme
  return ['light', 'dark'].includes(value) ? value : undefined
}

// Applies the viewer's saved scheme, falling back to this pattern's theme
// default. A layout effect, so it lands before paint and before any
// ThemeToggle's mount effect reads it.
const useIsoLayoutEffect = typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export default function PatternColorScheme({ defaultColorScheme }) {
  useIsoLayoutEffect(() => {
    applySavedColorScheme(defaultColorScheme)
  }, [defaultColorScheme]);
  return null;
}
