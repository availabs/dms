import React from "react"
import defaultTheme from "./defaultTheme"
import { get, set, merge, cloneDeep, has, isPlainObject } from 'lodash-es'
export { registerWidget } from './widgets'

// Re-export ThemeContext from separate file to allow imports that don't trigger defaultTheme chain
export { ThemeContext } from './themeContext';

/**
 * Merge two theme objects, respecting `_replace` declarations.
 *
 * At any level in the theme tree, a `_replace` array can list sibling keys
 * that should be replaced wholesale (not deep-merged) when the override
 * provides a value for them. This lets theme authors mark array fields
 * (like widget menus) as replace-not-merge right where they're defined.
 */
export function mergeTheme(base, override) {
  if (!override || !isPlainObject(override)) return cloneDeep(base);
  if (!base || !isPlainObject(base)) return cloneDeep(override);

  const replaceKeys = new Set([
    ...(base._replace || []),
    ...(override._replace || []),
  ]);

  const result = merge(cloneDeep(base), cloneDeep(override));

  for (const key of replaceKeys) {
    if (has(override, key)) {
      result[key] = cloneDeep(override[key]);
    }
  }

  for (const key of Object.keys(result)) {
    if (key === '_replace') continue;
    if (replaceKeys.has(key)) continue;
    if (isPlainObject(result[key]) && isPlainObject(base[key]) && isPlainObject(override[key])) {
      result[key] = mergeTheme(base[key], override[key]);
    }
  }

  if (replaceKeys.size > 0) {
    result._replace = [...replaceKeys];
  }

  return result;
}

export const getPatternTheme = (themes, pattern) => {
  let patternSelection = (
    pattern?.theme?.selectedTheme || //current Theme Setting
    pattern?.theme?.settings?.theme?.theme || //old Theme setting pre v0.
    'default'
  )

  let baseTheme = mergeTheme(
    defaultTheme,
    themes?.[patternSelection] || {},
  )

  if (!pattern?.theme?.layout?.options) {
    set(pattern, 'theme.layout.options', cloneDeep(baseTheme?.layout?.options))
  }
  delete  baseTheme?.layout?.options
  return mergeTheme(
    baseTheme,
    pattern?.theme || {}
  );
}

export const getComponentTheme = (theme, compType, activeStyle) => {
  const componentTheme = get(theme, compType, {})
  const finalActiveStyle = activeStyle || activeStyle === 0 ?  activeStyle : componentTheme.options?.activeStyle || 0
  return componentTheme?.styles ?
    componentTheme.styles[finalActiveStyle] :
    componentTheme || {}
}
