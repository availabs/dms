import React from "react"
import defaultTheme from "./defaultTheme"
import { get, set, merge, cloneDeep, has, isPlainObject } from 'lodash-es'
export { registerWidget } from './widgets'

// Re-export ThemeContext from separate file to allow imports that don't trigger defaultTheme chain
export { ThemeContext } from './themeContext';

/**
 * Detect whether an array looks like component styles
 * (array of objects where the first element has a `name` property).
 */
function isComponentStylesArray(arr) {
  return Array.isArray(arr) && arr.length > 0 &&
    arr[0] && typeof arr[0] === 'object' && 'name' in arr[0];
}

/**
 * Merge component styles arrays: deep-merge only the default style (index 0),
 * take all non-default styles wholesale from the override.
 *
 * This prevents cross-contamination when base and override have different
 * styles at the same array index (e.g., base has "Dark" at index 1 while
 * override has "Inline Guidance" at index 1).
 */
function mergeComponentStyles(baseStyles, overrideStyles) {
  const mergedDefault = merge(
    cloneDeep(baseStyles[0] || {}),
    cloneDeep(overrideStyles[0] || {})
  );
  return [mergedDefault, ...overrideStyles.slice(1).map(s => cloneDeep(s))];
}

/**
 * Merge two theme objects, respecting `_replace` declarations.
 *
 * At any level in the theme tree, a `_replace` array can list sibling keys
 * that should be replaced wholesale (not deep-merged) when the override
 * provides a value for them. This lets theme authors mark array fields
 * (like widget menus) as replace-not-merge right where they're defined.
 *
 * Component styles arrays (arrays of objects with `name` fields) get special
 * handling: only the default style (index 0) is deep-merged between base and
 * override; all non-default styles come wholesale from the override theme.
 * This prevents unrelated styles at the same index from contaminating each other.
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

    // Component styles arrays: merge default (index 0), take rest from override
    if (isComponentStylesArray(base[key]) && isComponentStylesArray(override[key])) {
      result[key] = mergeComponentStyles(base[key], override[key]);
      continue;
    }

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
