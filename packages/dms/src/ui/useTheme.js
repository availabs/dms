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

  return [
    mergedDefault,
    ...overrideStyles.slice(1).map(s => cloneDeep(s)),
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
  const merged = mergeTheme(
    baseTheme,
    pattern?.theme || {}
  );

  // Inject any fonts declared on the theme into <head>. Idempotent across
  // calls (deduped per font key) and SSR-safe (no-op when document is
  // undefined). Living here means every pattern that calls getPatternTheme
  // gets font loading for free without each pattern's siteConfig.jsx having
  // to repeat the wiring. Enable diagnostic logging by setting
  // `window.__DMS_DEBUG_FONTS__ = true` in the console, then refreshing.
  loadThemeFonts(merged?.fonts, { selectedTheme: patternSelection, themes });

  return merged;
}

/* ---------- Theme font loading ----------------------------------------------
   A theme may declare a `fonts` array; entries take one of these shapes:

     // External stylesheet — Google Fonts / a hosted theme CSS file.
     // Injected as `@import url(href);` inside a <style> tag (not a <link>
     // tag — Chromium sometimes drops dynamically-inserted <link rel="stylesheet">
     // requests when the insertion happens after first paint).
     { type: 'google', href: 'https://fonts.googleapis.com/css2?family=…' }
     { type: 'css',    href: '/themes/foo/_shared.css' }

     // Self-hosted webfont — injects an @font-face rule.
     { type: 'face',   family: 'IBM Plex Sans', weight: 400, style: 'normal',
                       display: 'swap',
                       sources: [
                         { url: '/themes/foo/fonts/IBMPlexSans-Regular.woff2', format: 'woff2' },
                       ] }
     // Legacy single-source form:
     { type: 'face',   family: '...', src: 'url.woff2', format: 'woff2' }

     // Tailwind 4 @theme registration. The project loads
     // @tailwindcss/browser@4 at the bottom of index.html, which scans for
     // <style type="text/tailwindcss"> blocks and processes their directives.
     // This is the canonical Tailwind 4 way to register font families:
     // declaring `--font-X` in @theme generates the matching `.font-X`
     // utility class and (for sans) sets the body default via
     // --default-font-family. Use this instead of literal class overrides.
     { type: 'tailwind', id: 'brand-tw-theme', content: `
        @theme {
          --font-sans: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
          --font-serif: "Newsreader", ui-serif, Georgia, serif;
          --font-mono: "IBM Plex Mono", ui-monospace, monospace;
          --default-font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
        }
     ` }

     // Raw CSS — for anything that doesn't fit @theme. Useful as a
     // belt-and-braces pin of :root CSS variables in case the build-time
     // Tailwind bundle shadows the runtime @theme on first paint.
     { type: 'style',  id: 'brand-font-stacks', content: `
        :root, :host { --font-sans: "IBM Plex Sans", ui-sans-serif, sans-serif; }
        html, body { font-family: var(--font-sans); }
     ` }

   The loader injects a <style>@import url(…);</style> for google/css entries,
   an @font-face <style> for face entries, a <style type="text/tailwindcss">
   for tailwind entries, and a raw <style> for style entries. Each entry is
   added to document.head at most once across the lifetime of the page;
   subsequent theme resolutions short-circuit. SSR-safe (no-op without document).
*/

const _loadedFontKeys = typeof Set !== 'undefined' ? new Set() : null;

function fontKey(font) {
  if (!font || typeof font !== 'object') return '';
  if (font.type === 'google' || font.type === 'css') return `${font.type}:${font.href}`;
  if (font.type === 'face') return `face:${font.family}:${font.weight ?? 400}:${font.style ?? 'normal'}`;
  if (font.type === 'style') return `style:${font.id || (font.content || '').slice(0, 64)}`;
  if (font.type === 'tailwind') return `tw:${font.id || (font.content || '').slice(0, 64)}`;
  return JSON.stringify(font);
}

function buildFontNode(font) {
  if (font.type === 'google' || font.type === 'css') {
    // Use @import inside a <style> block rather than a <link> tag. Both
    // work in principle, but Chromium (incl. headless) sometimes drops
    // dynamically-inserted <link rel="stylesheet"> requests when the
    // insertion happens after first paint. @import-in-style always fires
    // the fetch immediately. (This is also the pattern the project's
    // index.html uses for the in-page Oswald font.)
    const style = document.createElement('style');
    style.dataset.dmsThemeFont = font.type;
    style.textContent = `@import url(${JSON.stringify(font.href)});`;
    return style;
  }
  if (font.type === 'tailwind') {
    // Tailwind 4 runtime config — the project loads @tailwindcss/browser@4
    // which scans for <style type="text/tailwindcss"> blocks and processes
    // their directives (including @theme). Use this entry type to add
    // brand font tokens the proper Tailwind way: `@theme { --font-sans: …; }`
    // makes Tailwind generate .font-sans / .font-serif / .font-mono utilities
    // pointing at the brand families, and sets the body default via
    // --default-font-family. Strictly additive to existing @theme blocks.
    const style = document.createElement('style');
    style.type = 'text/tailwindcss';
    style.dataset.dmsThemeFont = 'tailwind';
    if (font.id) style.id = font.id;
    style.textContent = font.content;
    return style;
  }
  if (font.type === 'face') {
    const sources = font.sources
      || (font.src ? [{ url: font.src, format: font.format }] : []);
    if (!sources.length) return null;
    const srcStr = sources
      .map(s => `url(${JSON.stringify(s.url)})${s.format ? ` format(${JSON.stringify(s.format)})` : ''}`)
      .join(', ');
    const style = document.createElement('style');
    style.dataset.dmsThemeFont = 'face';
    style.textContent =
      `@font-face { ` +
      `font-family: ${JSON.stringify(font.family)}; ` +
      (font.weight != null ? `font-weight: ${font.weight}; ` : '') +
      (font.style ? `font-style: ${font.style}; ` : '') +
      `font-display: ${font.display || 'swap'}; ` +
      `src: ${srcStr}; ` +
      `}`;
    return style;
  }
  if (font.type === 'style' && font.content) {
    const style = document.createElement('style');
    style.dataset.dmsThemeFont = 'style';
    if (font.id) style.id = font.id;
    style.textContent = font.content;
    return style;
  }
  return null;
}

export function loadThemeFonts(fonts, ctx = {}) {
  const debug = (...m) => {
    if (typeof window !== 'undefined' && window.__DMS_DEBUG_FONTS__) {
      console.log('[dms.fonts]', ...m);
    }
  };
  debug('called', { selectedTheme: ctx.selectedTheme, hasFonts: Array.isArray(fonts), length: fonts?.length });
  if (typeof document === 'undefined' || !document?.head) { debug('no document/head — bailing (SSR?)'); return; }
  if (!Array.isArray(fonts) || !fonts.length) { debug('no fonts on this theme — bailing'); return; }
  for (const font of fonts) {
    const key = fontKey(font);
    if (!key) { debug('skip — could not key', font); continue; }
    if (_loadedFontKeys.has(key)) { debug('skip — already loaded', key); continue; }
    const node = buildFontNode(font);
    if (!node) { debug('skip — could not build node for', font); continue; }
    _loadedFontKeys.add(key);
    document.head.appendChild(node);
    debug('appended', key);
  }
}

export const getComponentTheme = (theme, compType, activeStyle) => {
  const componentTheme = get(theme, compType, {})
  const finalActiveStyle = activeStyle || activeStyle === 0 ?  activeStyle : (componentTheme.options?.activeStyle || 0)

  if (!componentTheme?.styles) return componentTheme || {}

  const style = componentTheme.styles[finalActiveStyle] || componentTheme.styles.find(s => s?.name === finalActiveStyle)
  if (!style) return componentTheme.styles[0] || {}

  // Non-default styles inherit missing keys from default (styles[0])
  if (finalActiveStyle !== 0) {
    const defaultStyle = componentTheme.styles[0] || {}
    return { ...defaultStyle, ...style }
  }
  return style
}
