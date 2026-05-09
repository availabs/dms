# Pattern-level setting: preload page section data — COMPLETED 2026-05-06

## Objective

Make the page-pattern data pre-load (`preloadPageSections`) opt-in per pattern. Default to OFF — patterns without the new setting do not preload. Add a toggle in the pattern editor's Overview pane (page patterns only) so authors can turn preloading on for a specific pattern.

## Scope

In:
- New `preload_data` boolean attribute on the `pattern` admin format
- Switch field in the Overview pane (`patternEditor/default/settings.jsx`), shown only for `page` patterns
- Page-pattern `siteConfig.jsx` only registers a `preload` function when `pattern.preload_data === true`; otherwise the loader skips the preload step entirely
- Existing patterns (no `preload_data` field) behave as if the setting is off

Out:
- Per-page preload toggles (the "Always Fetch Data" / `display.readyToLoad` toggle on individual sections is unchanged — still respected when preload is on)
- Per-component preload tuning (the `COMPONENT_PRELOAD_CONFIG` map in `preloadSectionData.js` stays as-is)
- Migration script — historical patterns simply lack the field, which `=== true` already treats as "off"

## Current State

- Preload entrypoint: `src/dms/packages/dms/src/render/dmsPageFactory.jsx:35-37` — the loader unconditionally calls `dmsConfig.preload(...)` whenever the pattern's siteConfig exposes one.
- Page pattern siteConfig: `src/dms/packages/dms/src/patterns/page/siteConfig.jsx:97-101` — always returns a `preload` function that calls `preloadPageSections(...)`. There is no pattern-level gate.
- Preload implementation: `src/dms/packages/dms/src/api/preloadSectionData.js` — `preloadPageSections` walks `data`, finds the page item, and pre-fetches dataWrapper sections. Each section already has its own gate (`state.display.readyToLoad`), but the pattern-level loop runs regardless.
- Pattern admin format: `src/dms/packages/dms/src/patterns/admin/admin.format.js:41-124` — `pattern` format with attributes `pattern_type`, `name`, `base_url`, `subdomain`, `html_title`, `filters`, `authPermissions`, `config`, `description`, `categories`, `theme`. No `preload_data` yet.
- Overview pane: `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` — `PatternSettingsEditor` with `tmpValue` (immer) saved via `apiUpdate({data: tmpValue})`. Page-pattern-specific UI today is the `DmsEnvConfig` sub-block, gated on `['datasets','forms','page','mapeditor'].includes(value.pattern_type)`.
- Pattern record flows into `pagesConfig` via `pattern2routes` (`render/spa/utils/index.js:200-224`) as `pattern: { ...pattern, filters: resolvedFilters }`, so any new field on the pattern row reaches `siteConfig.jsx` for free.
- FieldSet `Switch` field shape (see `patterns/datasets/components/MetadataComp/components/Metadata.jsx:57-61`):
  ```js
  { label: '...', type: 'Switch', enabled: <bool>, size: 'small',
    setEnabled: e => ..., className: 'self-center', customTheme }
  ```

## Proposed Changes

### 1. Add `preload_data` to the pattern format

`src/dms/packages/dms/src/patterns/admin/admin.format.js` — add a new attribute on the `pattern` format. Place after `html_title`:

```js
{ key: "preload_data",
  type: "boolean",
  required: false,
  default: false,
},
```

(No `default: true` — historical rows that never had the field stay falsy when read, which is what we want.)

### 2. Surface the toggle in the Overview pane (page patterns only)

`src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` — add a small page-pattern-specific block that mirrors how `DmsEnvConfig` is structured. Render it only when `value.pattern_type === 'page'`.

Two viable layouts:

- **Preferred:** add a `PagePatternSettings` sub-component (like `DmsEnvConfig`) below the main Pattern Settings card, conditionally rendered when `pattern_type === 'page'`. It owns its own FieldSet with one `Switch` and a Save button, and updates `tmpValue.preload_data`. Saves via `apiUpdate({ data: tmpValue })`. This keeps page-only options out of the universal pattern settings card and leaves room for future page-pattern toggles.
- **Alternative:** inline the Switch in the existing Pattern Settings FieldSet, gated by `pattern_type === 'page'` via a conditional spread (`...(value.pattern_type === 'page' ? [{...switch}] : [])`). Less code but mixes concerns.

Go with the preferred sub-component shape.

```jsx
function PagePatternSettings({ value, onChange, apiUpdate }) {
  const { UI } = React.useContext(ThemeContext);
  const { FieldSet } = UI;

  return (
    <div className='flex flex-col gap-1 p-4 border rounded-md'>
      <span className='font-semibold text-lg'>Page Pattern Settings</span>
      <p className='text-sm text-gray-500 mb-2'>
        Pre-load section data on page navigation (server-side / loader phase).
        When off, sections fetch their data after mount.
      </p>
      <FieldSet
        className='grid grid-cols-12 gap-1 border rounded p-4'
        components={[
          {
            label: 'Preload Data',
            type: 'Switch',
            enabled: !!value.preload_data,
            size: 'small',
            setEnabled: e => onChange(draft => { draft.preload_data = !!e }),
            className: 'self-center',
            customTheme: { field: 'pb-2 col-span-9' },
          },
          { type: 'Spacer', customTheme: { field: 'col-span-2' } },
          {
            type: 'Button',
            children: <span>Save</span>,
            disabled: !!(value.preload_data) === !!(originalPreload),
            onClick: () => apiUpdate({ data: value }),
            customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
          },
        ]}
      />
    </div>
  );
}
```

For the disabled-state on Save, the simplest path is to lift the comparison into the parent (since `tmpValue` is already there) and pass an `isDirty` boolean in. Or: skip the disabled gate entirely in this sub-card and rely on the main card's Save (since both edit `tmpValue` they share state). Pick one when implementing — the html_title Save flow already saves the entire `tmpValue`, so a single Save button on the main card already covers this field.

**Simplest variant:** drop the per-card Save; let the Switch update `tmpValue.preload_data` and rely on the main Pattern Settings card's existing Save button to persist it (since it already saves the whole `tmpValue`). The sub-card becomes purely a labeled toggle.

Mount in `PatternSettingsEditor`'s JSX between the main settings card and the Danger Zone:

```jsx
{value.pattern_type === 'page' && (
  <PagePatternSettings value={tmpValue} onChange={setTmpValue} />
)}
```

### 3. Gate the preload function in the page pattern siteConfig

`src/dms/packages/dms/src/patterns/page/siteConfig.jsx` — only attach `preload` when the pattern opts in:

```js
const preloadEnabled = pattern?.preload_data === true;

return {
  siteType,
  format: format,
  ...(preloadEnabled && {
    preload: (falcor, data, request, params) => {
      const raw = params?.['*'] || '';
      const slug = raw.startsWith('edit/') ? raw.slice('edit/'.length) : raw;
      return preloadPageSections(falcor, data, request.url, patternFilters, slug);
    },
  }),
  ...
};
```

The `dmsPageFactory` loader's `if (dmsConfig.preload)` check (`render/dmsPageFactory.jsx:35`) already short-circuits cleanly when the field is absent, so no loader changes are needed.

Use strict `=== true` (not truthy) so future non-boolean values like the string `"false"` from a misformatted save don't accidentally enable preload.

### 4. Default behavior

- New patterns: `preload_data` defaults to `false` (format `default: false`); the toggle in the editor reflects that.
- Historical patterns: field absent → strict `=== true` check fails → preload off. No migration needed.
- Once turned on and saved: pattern row gets `preload_data: true`, next loader run sees it and calls `preloadPageSections`.

## Files Requiring Changes

- [x] `src/dms/packages/dms/src/patterns/admin/admin.format.js` — added `preload_data` boolean attribute (after `html_title`, before `filters`) with `default: false`.
- [x] `src/dms/packages/dms/src/patterns/admin/pages/patternEditor/default/settings.jsx` — added `PagePatternSettings` sub-component (Switch wired to `tmpValue.preload_data`), rendered conditionally for `pattern_type === 'page'` between the main settings card and the Danger Zone. No new Save button — the existing main-card Save persists the whole `tmpValue`.
- [x] `src/dms/packages/dms/src/patterns/page/siteConfig.jsx` — added `const preloadEnabled = pattern?.preload_data === true;` and changed the returned config to spread `...(preloadEnabled && { preload: ... })` so the `preload` key is omitted when disabled. The `dmsPageFactory` loader's existing `if (dmsConfig.preload)` check then short-circuits.
- [x] `src/dms/packages/dms/src/render/dmsPageFactory.jsx` — un-commented the `data = await dmsConfig.preload(...)` line inside `if (dmsConfig.preload)`. It had been commented out (pre-existing debugging artifact unrelated to this task) so preload never ran regardless of the gate. Found while testing wcdb_main with the toggle on and seeing no `[preload]` logs.

Build: `npm run build` passes.

## Testing Checklist

- [x] Toggle ON in pattern Overview, save, reload — pattern row persisted `preload_data: true` (verified via CLI `dms raw get`); preload runs (after the unrelated `dmsPageFactory.jsx:36` un-comment).
- [ ] Existing pattern (no `preload_data` field): navigate to a page with a Card/Spreadsheet/Graph — section data fetches client-side after mount; loader does not call `preloadPageSections` (verify via `[preload]` console logs in dev — should be silent).
- [ ] Toggle OFF, save, reload — loader is silent again; sections fetch client-side.
- [ ] Switch state survives reload (toggle reflects persisted `pattern.preload_data`).
- [ ] Toggle is hidden for non-page patterns (`datasets`, `forms`, `auth`, `mapeditor`, `admin`).
- [ ] New pattern created via "Duplicate" or fresh creation: `preload_data` is unset/false; toggle starts OFF.
- [ ] Section-level "Always Fetch Data" (`display.readyToLoad`) still gates per-section preload when pattern preload is ON (no behavior change at section level).

## Open Questions

- **SSR.** SSR currently exercises the same loader path as SPA. Once the toggle is opt-in, SSR'd pages on patterns with preload off will ship without preloaded section data — same as before this feature was introduced (when preload defaulted on, SSR'd everything). Confirm with the SSR Phase 1 owner whether any deployed site relies on the old default-on behavior; if so, flip the default for those sites' patterns post-deploy via the CLI.
- **Naming.** `preload_data` was chosen for clarity; alternatives are `preload`, `preload_sections`, `preload_section_data`. Stick with `preload_data` unless a stakeholder prefers otherwise — easy to rename now, harder once data is written.
- **Future extensions.** This task creates a `PagePatternSettings` block; it can absorb future page-only toggles (e.g., `enable_search`, `enable_pdf_export`) without re-architecture.
