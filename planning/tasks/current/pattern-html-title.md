# Pattern-configurable HTML page title — IMPLEMENTED (pending live test)

## Objective

Let each pattern configure the browser tab title (`document.title`) that's set while that pattern's routes are active. The title is configured in the Overview tab of the admin pattern editor. If unset, fall back to the pattern's `name`.

## Scope

In:
- New `html_title` attribute on the `pattern` admin format
- Overview-pane editor field for it (in `patternEditor/default/settings.jsx`)
- Setting `document.title` at pattern-route activation time, falling back to `pattern.name` when `html_title` is empty
- Restoring previous title on unmount (so navigation between patterns works cleanly)

Out:
- Per-page title overrides (page records already have `title` — that's a separate follow-up if we want pattern-title + " · " + page-title formatting)
- `<head>` meta tags (description, OG, etc.) — title only for now
- SSR title injection (see Open Questions)

## Current State

- `pattern` admin format lives at `src/dms/packages/dms/src/patterns/admin/admin.format.js` — keys today: `pattern_type`, `name`, `base_url`, `subdomain`, `filters`, `authPermissions`, `config`, `description`, `categories`, `theme`. No `html_title`.
- Overview pane = `PatternSettingsEditor` in `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx`. It uses `FieldSet` with `Input`s wired into a local `tmpValue` (immer) and saves via `apiUpdate({data:tmpValue})`.
- Pattern-to-route plumbing: `src/dms/packages/dms/src/render/spa/utils/index.js` (`pattern2routes`). Each pattern's `pattern_type` resolves a list of route configs via `patternTypes[pattern.pattern_type]`; each config function receives the full `pattern` object and returns route(s) consumed by `dmsPageFactory`.
- Nothing currently sets `document.title` anywhere in the package (`grep document.title` → 0 hits in `src/`).

## Proposed Changes

### 1. Add `html_title` to the pattern format

`src/dms/packages/dms/src/patterns/admin/admin.format.js` — add a new attribute on the `pattern` format, alongside `name`/`base_url`:

```js
{ key: "html_title",
  placeholder: 'Browser tab title (defaults to pattern name)',
  type: "text",
  required: false
},
```

### 2. Surface it in the Overview pane

`src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` — add an `Input` row in the Pattern Settings `FieldSet`, after Base Url, wired to `tmpValue.html_title`:

```jsx
{
  label: 'HTML Title',
  type: 'Input',
  placeholder: tmpValue.name || 'Browser tab title',
  value: tmpValue.html_title || '',
  onChange: e => setTmpValue(draft => { draft.html_title = e.target.value }),
  customTheme
},
```

Use the existing `customTheme` (col-span-9). Re-balance the surrounding `Spacer` so the grid still adds to 12 per row.

### 3. Apply the title at runtime

A small hook component that the SPA route tree mounts inside each pattern's tree. Two viable spots:

- **Preferred:** at the top of every pattern config in `pattern2routes` (`render/spa/utils/index.js`) — wrap the resolved route's `Component`/`element` with a `<PatternTitle title={pattern.html_title || pattern.name} />` that runs:
  ```js
  React.useEffect(() => {
    if (typeof document === 'undefined' || !title) return;
    const prev = document.title;
    document.title = title;
    return () => { document.title = prev; };
  }, [title]);
  ```
  Mount it as a sibling (returns `null`) inside whatever wrapper `dmsPageFactory` produces, so it's active for every nested route under that pattern.
- **Alternative:** add a `loader` on each pattern route that calls `document.title = ...` directly. Simpler, but loaders fire before route mount and there's no clean restore on unmount. Use the effect-component approach unless we hit a render-order issue.

Place the component in `src/dms/packages/dms/src/render/spa/utils/PatternTitle.jsx` (new file, component-only — Fast Refresh boundary clean per the package CLAUDE.md rules). Imported by `index.js` and slotted into each route in the `pattern2routes` `.map(config => ...)` loop.

### 4. Default behavior

If `html_title` is empty/whitespace, use `pattern.name`. If `name` is also empty, leave `document.title` untouched.

## Files Requiring Changes

- [x] `src/dms/packages/dms/src/patterns/admin/admin.format.js` — added `html_title` text attribute to the `pattern` format (after `subdomain`).
- [x] `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` — added `HTML Title` Input row in the Pattern Settings `FieldSet`, after Base Url. Placeholder shows the pattern name as the resolved fallback. Existing Spacer cols left unchanged (each Input row is `col-span-9`, leftover wraps; action row totals 12 already).
- [x] `src/dms/packages/dms/src/render/spa/utils/PatternTitle.jsx` — new component-only file. `useEffect` saves the previous `document.title`, sets the new title (after trimming), and restores on unmount. SSR-safe (`typeof document === 'undefined'` guard). Returns `null`.
- [x] `src/dms/packages/dms/src/render/spa/utils/index.js` — imports `React` and `PatternTitle`; in the `pattern2routes` loop, captures the route returned by `dmsPageFactory`, computes `titleValue = pattern.html_title.trim() || pattern.name || ''`, and wraps `route.Component` with a fragment that renders `<PatternTitle title={titleValue}/>` alongside the original component. Used `React.createElement` to keep the file as `.js` (no JSX).

Build: `npm run build` passes.

## Testing Checklist

- [ ] Create a pattern, leave `html_title` blank, navigate to it → tab title equals pattern `name`
- [ ] Set `html_title` on a pattern, navigate to it → tab title equals `html_title`
- [ ] Edit `html_title` and save → tab title updates on the next visit (no manual refresh required if already on the route)
- [ ] Navigate away to a different pattern with its own title → title switches
- [ ] Navigate to the admin / a pattern with no title configured → previous pattern's title is not stuck
- [ ] Subdomain-routed patterns honor the title field (admin pattern is shared across subdomains, regular patterns are filtered by `pattern2routes`)

## Open Questions

- **SSR.** The SSR pipeline (`render/ssr2/`) renders to string before the client mounts; `useEffect` doesn't run, so the SSR'd HTML will keep whatever `<title>` is in the template. If we want SSR'd titles, we need to expose the resolved title from the matched route into the HTML template. Out of scope for v1 — note in PR description and revisit if it matters.
- **Page-level override.** Pages already have `title`. Should the page title concatenate with the pattern title (`"My Page · My Pattern"`) when a page is active? Punt for now; this task is pattern-only.
