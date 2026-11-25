// The theme merge, on its own: lodash only, no default theme, so code that builds on a theme (an app's legacy
// layers, a plugin built separately) can bundle it without pulling in the library. useTheme.js re-exports it.
import { merge, cloneDeep, has, isPlainObject } from 'lodash-es'


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
 *
 * Respects a `_replace` array on either base.styles[0] or override.styles[0]:
 * keys listed there are replaced wholesale from the override rather than
 * deep-merged. Useful for sub-objects that are exhaustive sets (e.g.
 * `pages.sectionArray.styles[0].sizes` — a theme that switches from a 6-col
 * to a 12-col grid wants its new sizes to be the *only* keys, not merged
 * with the codebase's old "1/3" / "1/2" / "2/3" entries).
 */
function mergeComponentStyles(baseStyles, overrideStyles) {
  const base0 = baseStyles[0] || {};
  const override0 = overrideStyles[0] || {};
  const replaceKeys = new Set([
    ...(base0._replace || []),
    ...(override0._replace || []),
  ]);

  const mergedDefault = merge(cloneDeep(base0), cloneDeep(override0));

  for (const key of replaceKeys) {
    if (has(override0, key)) {
      mergedDefault[key] = cloneDeep(override0[key]);
    }
  }

  if (replaceKeys.size > 0) {
    mergedDefault._replace = [...replaceKeys];
  }

  // Non-default styles are matched by NAME, not index, so unrelated styles
  // at the same array position never cross-contaminate (the original bug
  // this function existed to fix). An override style replaces a base style
  // of the same name; every base-only named style (one the override array
  // doesn't mention at all) is preserved as-is. Previously this took the
  // override's tail wholesale, so any site theme that redeclares this
  // component's styles array — even just its own 'default' — silently wiped
  // out every named style the dms package itself ships at that component key
  // (e.g. MultiSelect's 'accent' chip variant), and `activeStyle: '<name>'`
  // no-op'd back to styles[0] with no error (found 2026-09-17).
  //
  // The override's styles keep their authored positions and the base-only
  // styles are appended after them. Several pickers store a style's INDEX
  // (the page Settings sidenav style, every `*.theme` editor's
  // `options.activeStyle`), and those indices were authored against the site
  // theme's own array. Placing base-only styles first shifted every one of
  // them (e.g. TransportNY's `compact` sidenav moved from 1 to 2, so pages
  // storing 1 got the library's `admin` rail). Base-only styles are picked
  // by name, so their position doesn't matter.
  const overrideRest = overrideStyles.slice(1).map(s => cloneDeep(s));
  const overrideNames = new Set(overrideRest.map(s => s?.name).filter(Boolean));
  const baseRest = baseStyles.slice(1)
    .filter(s => !overrideNames.has(s?.name))
    .map(s => cloneDeep(s));

  return [
    mergedDefault,
    ...overrideRest,
    ...baseRest,
  ];
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

    // `fonts` (the loadThemeFonts injection list — <link>/<style> descriptors,
    // see ui/useTheme.js's loadThemeFonts) is additive, not positional: a
    // plain lodash array-merge combines base[i] with override[i] by INDEX,
    // which silently corrupts or drops entries whenever the two themes'
    // fonts arrays differ in length or ordering (e.g. the base default
    // theme's CSS-token stylesheet landing at whatever index a project's
    // own theme happens to also populate). Concatenate instead — every
    // entry an ancestor theme wants injected still gets injected.
    // loadThemeFonts's own per-id DOM dedup makes a repeated id harmless.
    if (Array.isArray(base[key]) && Array.isArray(override[key]) && key === 'fonts') {
      result[key] = [...base[key], ...override[key]];
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
