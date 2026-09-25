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
  const overrideRest = overrideStyles.slice(1).map(s => cloneDeep(s));
  const overrideNames = new Set(overrideRest.map(s => s?.name).filter(Boolean));
  const baseRest = baseStyles.slice(1)
    .filter(s => !overrideNames.has(s?.name))
    .map(s => cloneDeep(s));

  return [
    mergedDefault,
    ...baseRest,
    ...overrideRest,
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

// `defaultTheme ⊕ themes[selection]` — the expensive half of getPatternTheme
// (mergeTheme deep-clones at every level), and identical for every pattern
// that selects the same theme. Route building calls getPatternTheme once per
// pattern against ONE theme registry object (MitigateNY: 110 patterns, ~3
// themes), so cache per registry object + selection. The cached object is
// never handed out: getPatternTheme's own final mergeTheme clones it, and the
// layout options are cloned before they're written onto a pattern. A new
// registry object (every pattern2routes run builds one) starts a fresh cache.
// See planning/tasks/current/boot-chain-fewer-serial-hops.md.
const baseThemeCache = new WeakMap()
function getBaseTheme(themes, selection) {
  const perRegistry = themes && typeof themes === 'object'
    ? (baseThemeCache.get(themes) || baseThemeCache.set(themes, new Map()).get(themes))
    : null
  let entry = perRegistry?.get(selection)
  if (!entry) {
    const base = mergeTheme(defaultTheme, themes?.[selection] || {})
    const layoutOptions = base?.layout?.options
    delete base?.layout?.options
    entry = { base, layoutOptions }
    perRegistry?.set(selection, entry)
  }
  return entry
}

export const getPatternTheme = (themes, pattern, ssrCollect) => {
  let patternSelection = (
    pattern?.theme?.selectedTheme || //current Theme Setting
    pattern?.theme?.settings?.theme?.theme || //old Theme setting pre v0.
    'default'
  )

  const { base: baseTheme, layoutOptions } = getBaseTheme(themes, patternSelection)

  if (!pattern?.theme?.layout?.options) {
    set(pattern, 'theme.layout.options', cloneDeep(layoutOptions))
  }
  const merged = mergeTheme(
    baseTheme,
    pattern?.theme || {}
  );

  // Inject any fonts declared on the theme into <head>. Idempotent across
  // calls (deduped per font key). Living here means every pattern that
  // calls getPatternTheme gets font loading for free without each pattern's
  // siteConfig.jsx having to repeat the wiring. Enable diagnostic logging by
  // setting `window.__DMS_DEBUG_FONTS__ = true` in the console, then
  // refreshing.
  //
  // `ssrCollect` (optional, only meaningful server-side): an array threaded
  // in from SSR route building (see render/ssr2/handler.jsx) that this
  // collects font HTML strings into instead of no-op'ing when there's no
  // `document` — see loadThemeFonts below.
  loadThemeFonts(merged?.fonts, { selectedTheme: patternSelection, themes, ssrCollect });

  return merged;
}

/**
 * Theme for the admin surfaces — the admin pattern (Sites/Themes/Pattern
 * Editor) and the auth pattern's manage pages (Users/Groups/Profile).
 *
 * These always render the library default (tessera_v6) — the same look for
 * every project. The only per-project input is the `admin` key of the theme
 * the site's auth pattern selects (the same way the login pages read that
 * theme's `auth` key), plus the auth pattern's own `theme.admin` overrides.
 * The rest of that theme is never applied here, so adding an `admin` key to a
 * theme can't change anything outside admin.
 *
 *   admin.logo  — merged over the default logo. Without one, the logo is
 *                 blanked to an "Admin" title.
 *   admin.*     — any other key merges into the default `theme.admin`
 *                 per-page overrides (patternEditor, editSite, ...).
 *
 * See planning/tasks/current/admin-theme-per-project.md.
 */
export const getAdminTheme = (themes, authPattern, ssrCollect) => {
  const theme = getPatternTheme(themes, { theme: { selectedTheme: 'default' } }, ssrCollect);
  // same selection precedence as getPatternTheme
  const name = authPattern?.theme?.selectedTheme || authPattern?.theme?.settings?.theme?.theme;
  const { logo, ...adminOverrides } = mergeTheme(
    (name && themes?.[name]?.admin) || {},
    authPattern?.theme?.admin || {},
  );
  delete adminOverrides._replace;
  if (Object.keys(adminOverrides).length) theme.admin = mergeTheme(theme.admin, adminOverrides);
  theme.logo = logo
    ? mergeTheme(theme.logo, logo)
    : { ...theme.logo, img: '', logoAltImg: '', title: 'Admin' };
  return theme;
};

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

   Client-side, the loader injects a <style>@import url(…);</style> for
   google/css entries, an @font-face <style> for face entries, a
   <style type="text/tailwindcss"> for tailwind entries, and a raw <style>
   for style entries — each added to document.head at most once across the
   lifetime of the page; subsequent theme resolutions short-circuit.

   Server-side (no `document`), the exact same content is instead collected
   as HTML strings into an `ssrCollect` array threaded in from SSR route
   building (see render/ssr2/handler.jsx), so SSR can embed the theme's real
   CSS/fonts directly in the initial response instead of leaving the browser
   to inject it after hydration (previously a several-hundred-ms flash of
   unstyled content — see planning/tasks/current/ssr-runtime-theme-css-fouc.md
   in the dms submodule). Every injected node (DOM or string) also carries a
   `data-dms-font-key` attribute so the client can seed its own dedup set
   from whatever SSR already rendered, instead of re-appending duplicates on
   hydration.
*/

const _loadedFontKeys = typeof Set !== 'undefined' ? new Set() : null;
let _seededFromSSR = false;

function fontKey(font) {
  if (!font || typeof font !== 'object') return '';
  if (font.type === 'google' || font.type === 'css') return `${font.type}:${font.href}`;
  if (font.type === 'face') return `face:${font.family}:${font.weight ?? 400}:${font.style ?? 'normal'}`;
  if (font.type === 'style') return `style:${font.id || (font.content || '').slice(0, 64)}`;
  if (font.type === 'tailwind') return `tw:${font.id || (font.content || '').slice(0, 64)}`;
  return JSON.stringify(font);
}

// Shared shape for both renderers below — one place that knows how to turn
// a font entry into a <style> tag's attributes + content, so the DOM and
// HTML-string builders can never drift from each other.
function fontNodeSpec(font) {
  if (font.type === 'google' || font.type === 'css') {
    // Use @import inside a <style> block rather than a <link> tag. Both
    // work in principle, but Chromium (incl. headless) sometimes drops
    // dynamically-inserted <link rel="stylesheet"> requests when the
    // insertion happens after first paint. @import-in-style always fires
    // the fetch immediately. (This is also the pattern the project's
    // index.html uses for the in-page Oswald font.)
    return { dataType: font.type, content: `@import url(${JSON.stringify(font.href)});` };
  }
  if (font.type === 'tailwind') {
    // Tailwind 4 runtime config — the project loads @tailwindcss/browser@4
    // which scans for <style type="text/tailwindcss"> blocks and processes
    // their directives (including @theme). Use this entry type to add
    // brand font tokens the proper Tailwind way: `@theme { --font-sans: …; }`
    // makes Tailwind generate .font-sans / .font-serif / .font-mono utilities
    // pointing at the brand families, and sets the body default via
    // --default-font-family. Strictly additive to existing @theme blocks.
    return { dataType: 'tailwind', styleType: 'text/tailwindcss', id: font.id, content: font.content };
  }
  if (font.type === 'face') {
    const sources = font.sources
      || (font.src ? [{ url: font.src, format: font.format }] : []);
    if (!sources.length) return null;
    const srcStr = sources
      .map(s => `url(${JSON.stringify(s.url)})${s.format ? ` format(${JSON.stringify(s.format)})` : ''}`)
      .join(', ');
    return {
      dataType: 'face',
      content:
        `@font-face { ` +
        `font-family: ${JSON.stringify(font.family)}; ` +
        (font.weight != null ? `font-weight: ${font.weight}; ` : '') +
        (font.style ? `font-style: ${font.style}; ` : '') +
        `font-display: ${font.display || 'swap'}; ` +
        `src: ${srcStr}; ` +
        `}`,
    };
  }
  if (font.type === 'style' && font.content) {
    return { dataType: 'style', id: font.id, content: font.content };
  }
  return null;
}

function buildFontNode(font, key) {
  const spec = fontNodeSpec(font);
  if (!spec) return null;
  const style = document.createElement('style');
  if (spec.styleType) style.type = spec.styleType;
  style.dataset.dmsThemeFont = spec.dataType;
  style.dataset.dmsFontKey = key;
  if (spec.id) style.id = spec.id;
  style.textContent = spec.content;
  return style;
}

// Escape any literal "</style" in CSS content so it can't prematurely close
// the wrapping <style> tag when embedded as a string into SSR HTML.
function escapeStyleContent(s) {
  return String(s).replace(/<\/(style)/gi, '<\\/$1');
}

function buildFontHtml(font, key) {
  const spec = fontNodeSpec(font);
  if (!spec) return '';
  const attrs = [`data-dms-theme-font="${spec.dataType}"`, `data-dms-font-key="${key.replace(/"/g, '&quot;')}"`];
  if (spec.styleType) attrs.push(`type="${spec.styleType}"`);
  if (spec.id) attrs.push(`id="${spec.id}"`);
  return `<style ${attrs.join(' ')}>${escapeStyleContent(spec.content)}</style>`;
}

// Client-only: before the first real font load, adopt whatever
// `data-dms-font-key`s SSR already rendered into <head> so hydration
// doesn't re-append duplicates of content that's already there.
function seedLoadedFontKeysFromSSR() {
  if (_seededFromSSR || typeof document === 'undefined' || !document?.head) return;
  _seededFromSSR = true;
  document.head.querySelectorAll('[data-dms-font-key]').forEach((node) => {
    _loadedFontKeys.add(node.getAttribute('data-dms-font-key'));
  });
}

export function loadThemeFonts(fonts, ctx = {}) {
  const debug = (...m) => {
    if (typeof window !== 'undefined' && window.__DMS_DEBUG_FONTS__) {
      console.log('[dms.fonts]', ...m);
    }
  };
  debug('called', { selectedTheme: ctx.selectedTheme, hasFonts: Array.isArray(fonts), length: fonts?.length });
  if (!Array.isArray(fonts) || !fonts.length) { debug('no fonts on this theme — bailing'); return; }

  // Check for an explicit SSR collector FIRST, before looking at `document`.
  // render/ssr2/handler.jsx stubs a real (linkedom) `document` globally so
  // other components (Lexical) can call document.createElement during
  // renderToString — so `typeof document === 'undefined'` is NOT a reliable
  // SSR signal here. Appending to that stub's head would silently vanish
  // (renderToString serializes the React tree, not the stubbed document),
  // which is exactly the bug this branch ordering avoids. Whoever's driving
  // SSR route building opts in explicitly by passing `ctx.ssrCollect`.
  if (Array.isArray(ctx.ssrCollect)) {
    // Dedup is scoped to this one collection pass (a fresh `ssrCollect`
    // array per host route-build), not the module-level `_loadedFontKeys`
    // — that one's for a real page's client-side lifetime.
    const seen = ctx.ssrCollect._seen || (ctx.ssrCollect._seen = new Set());
    for (const font of fonts) {
      const key = fontKey(font);
      if (!key || seen.has(key)) { debug('skip (ssr) — no key or already collected', key); continue; }
      const html = buildFontHtml(font, key);
      if (!html) { debug('skip (ssr) — could not build html for', font); continue; }
      seen.add(key);
      ctx.ssrCollect.push(html);
      debug('collected (ssr)', key);
    }
    return;
  }

  if (typeof document === 'undefined' || !document?.head) {
    debug('no document/head and no ctx.ssrCollect — bailing (SSR without a collector?)');
    return;
  }

  seedLoadedFontKeysFromSSR();
  for (const font of fonts) {
    const key = fontKey(font);
    if (!key) { debug('skip — could not key', font); continue; }
    if (_loadedFontKeys.has(key)) { debug('skip — already loaded', key); continue; }
    const node = buildFontNode(font, key);
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
