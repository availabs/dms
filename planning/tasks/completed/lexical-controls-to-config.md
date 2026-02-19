# Move Lexical Component Controls to Control Config

## Objective

Refactor the `lexical` (Rich Text) component so that its inline edit-mode controls are moved into the component's `controls` configuration object. This makes them appear in the section context menu (like other data-driven components) instead of being rendered directly in the component's edit output.

## Current Behavior

**File:** `patterns/page/components/sections/components/ComponentRegistry/richtext/index.jsx`

The `Edit` component currently renders three controls inline:

1. **Style selector** (lines 127-167) — A `<Select>` dropdown with options: Default Text, Inline Guidance, Dark Text, Annotation Card, Annotation Image Card, Handwritten, Sitemap. Stored as `isCard` in the component's JSON data.

2. **Background color picker** (lines 169-174) — A `<ColorPickerComp>` shown conditionally when a card style is selected. Stored as `bgColor` in the component's JSON data.

3. **Toolbar visibility** — The Lexical editor accepts a `hideControls` prop (see `ui/components/lexical/editor/editor.tsx:127`) that controls whether the `<ToolbarPlugin />` is rendered. This prop is **not currently configurable** — the toolbar always shows in edit mode.

### Current data shape

The component stores its data as a JSON string:
```json
{
  "bgColor": "rgba(0,0,0,0)",
  "text": { "root": { ... } },
  "isCard": "Annotation"
}
```

## Proposed Changes

### 1. Add `defaultState` and `controls` to the component definition

Add a `defaultState` object and a `controls` config to the export in `richtext/index.jsx`:

```js
export default {
    name: 'Rich Text',
    defaultState: {
        style: '',           // was `isCard`
        bgColor: 'rgba(0,0,0,0)',
        hideToolbar: false,  // new: controls Lexical hideControls prop
    },
    controls: {
        more: [
            {
                type: 'select', label: 'Style', key: 'style',
                options: [
                    { label: 'Default Text', value: '' },
                    { label: 'Inline Guidance', value: 'Inline Guidance' },
                    { label: 'Dark Text', value: 'Dark' },
                    { label: 'Annotation Card', value: 'Annotation' },
                    { label: 'Annotation Image Card', value: 'Annotation Image Card' },
                    { label: 'Handwritten (Caveat)', value: 'Handwritten_2' },
                    { label: 'Sitemap', value: 'sitemap' },
                ]
            },
            {
                type: 'color', label: 'Background Color', key: 'bgColor',
                displayCdn: ({ display }) => Boolean(display.style),
            },
            {
                type: 'toggle', label: 'Hide Toolbar', key: 'hideToolbar',
            },
        ]
    },
    EditComp: Edit,
    ViewComp: View,
}
```

> **Note:** The lexical component does not use `useDataSource`, so its controls won't go through the DataWrapper control path. Verify how `controls.more` is rendered for non-data-source components. The section menu (`sectionMenu.jsx` / `getSectionMenuItems`) reads `component.controls` from the registry. If the existing menu rendering only handles data-source components, this may need adjustment. Investigate `getSectionMenuItems` to confirm.

### 2. Move state into ComponentContext

Currently the Edit component manages `bgColor`, `isCard`, and `text` via local `useState`. These need to move into `ComponentContext.state` (the Immer state initialized in `section.jsx`):

- Read `style`, `bgColor`, `hideToolbar` from `state.display` (or a similar namespace in state)
- Update them via `setState(draft => { ... })`
- Remove the local `useState` calls for `bgColor` and `isCard`

The `text` value (the actual Lexical editor content) should remain as the primary `value`/`onChange` data, since that's the content payload.

### 3. Update Edit component

- Remove the inline `<Select>` for style
- Remove the inline `<ColorPickerComp>`
- Read style/bgColor/hideToolbar from `ComponentContext.state`
- Pass `hideControls={state.display?.hideToolbar}` (or equivalent) to `<Lexical.EditComp>`

### 4. Update View component

- Read style and bgColor from the persisted state
- Pass `hideControls` is not needed in view mode (toolbar is only shown when `editable=true`)
- Ensure backward compatibility: if old data format is encountered (JSON with `isCard`/`bgColor` at top level), handle it gracefully

### 5. Backward compatibility

Old data stores `isCard` and `bgColor` inside the JSON `element-data` string. New data should store these in the component state (which is also persisted in `element-data`). Add migration logic in the component or in `convertOldState` to handle both formats.

## Files Requiring Changes

| File | Change |
|------|--------|
| `ComponentRegistry/richtext/index.jsx` | Main refactor: remove inline controls, add `controls`/`defaultState`, read from context |
| `components/sections/section.jsx` or `sectionMenu.jsx` | Verify that controls render for non-data-source components; adjust if needed |
| `dataWrapper/utils/convertOldState.js` | Possibly add migration for old lexical data format |

## Testing Checklist

- [ ] New sections with Rich Text component show Style, Background Color, and Hide Toolbar in the section context menu
- [ ] Style selector works: changing style updates the Lexical editor theme correctly
- [ ] Background color picker appears only when a style is selected
- [ ] Background color applies correctly to the editor and view
- [ ] Hide Toolbar toggle hides/shows the Lexical toolbar in edit mode
- [ ] View mode renders correctly with all style variants
- [ ] Old pages with existing Rich Text sections still render correctly (backward compat)
- [ ] Saving and reloading a page preserves all three settings
- [ ] The `cardTypes` theme overrides still apply correctly per style selection
