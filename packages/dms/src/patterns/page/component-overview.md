# Pages Pattern: Component Developer Guide

This guide explains how components work in the DMS pages pattern and how to create new ones.

## Architecture Overview

Components are the content blocks that make up page sections. The system has four layers:

```
Section (section.jsx)
  └─ Component Wrapper (components/index.jsx)
       └─ DataWrapper (dataWrapper/index.jsx)  ← only if useDataSource: true
            └─ Your Component (ComponentRegistry/YourComponent/)
```

**Key files:**

| File | Role |
|------|------|
| `components/sections/section.jsx` | Section container. Creates `ComponentContext`, resolves component from registry, renders edit/view shells |
| `components/sections/components/index.jsx` | Component wrapper. Routes to DataWrapper or directly to your component based on `useDataSource` |
| `components/sections/components/dataWrapper/index.jsx` | DataWrapper. Handles data fetching, pagination, CRUD, filtering for data-driven components |
| `components/sections/components/ComponentRegistry/index.jsx` | Registry. Maps component names to their definition objects |
| `context.js` | Defines `CMSContext`, `PageContext`, `ComponentContext` |

## How It Works

### 1. Section resolves the component

When a section renders, it reads `value.element['element-type']` (e.g. `"Spreadsheet"`, `"Graph"`, `"lexical"`) and looks it up in `RegisteredComponents`:

```js
// section.jsx:28
const component = RegisteredComponents[get(value, ["element", "element-type"], "lexical")];
```

The section creates a `ComponentContext.Provider` with:
- `state` / `setState` — component state managed via `useImmer`, initialized from saved data via `convertOldState()`
- `apiLoad` / `apiUpdate` — data API functions from `PageContext`
- `controls` — the component's `controls` config object
- `isActive` / `activeStyle` — activation state for interactive components

### 2. Component wrapper decides the rendering path

The wrapper (`components/index.jsx`) checks `component.useDataSource`:

- **`useDataSource: true`** — Routes through `DataWrapper.EditComp` / `DataWrapper.ViewComp`. The DataWrapper handles all data fetching, then renders your component's `EditComp`/`ViewComp` inside itself.
- **`useDataSource: false` (or absent)** — Renders your `EditComp`/`ViewComp` directly.

Both paths also render `<Controls />` (data source selector) and `<RenderFilters />` (filter UI).

### 3. DataWrapper manages data lifecycle

For data-driven components, the DataWrapper (`dataWrapper/index.jsx`) provides:

- **Data fetching** — Calls `getData()` when columns, filters, or data source change
- **Pagination** — Manages `currentPage`, infinite scroll, page-change fetching
- **CRUD operations** — `updateItem()`, `addItem()`, `removeItem()` for DMS data sources
- **Local filtering** — Client-side filtering after data is loaded
- **Downloads** — Excel export via `writeXlsxFile`

The DataWrapper reads state from `ComponentContext` and renders your component as:
```jsx
<Comp isEdit={isEdit} {...componentProps} />
```

Where `componentProps` includes CRUD handlers for Spreadsheet/Card components.

### 4. Your component renders using ComponentContext

Your component accesses data and state through `ComponentContext`:

```jsx
const { state, setState, apiLoad, apiUpdate, controls } = useContext(ComponentContext);
// state.columns  — column definitions with user settings
// state.data     — current page of row data
// state.display  — display/UI settings
// state.sourceInfo — data source metadata
```

## Component Definition Object

Every component exports a definition object. Here's the full shape:

```js
export default {
    // --- Required ---
    name: 'MyComponent',           // Display name
    EditComp: MyEditComponent,     // React component for edit mode
    ViewComp: MyViewComponent,     // React component for view mode

    // --- Data source (set these if your component displays data) ---
    useDataSource: true,           // Wrap with DataWrapper (default: falsy)
    fullDataLoad: false,           // true: load all rows; false: paginated
    useGetDataOnPageChange: true,  // Fetch new data on page change
    useInfiniteScroll: false,      // Enable infinite scroll
    showPagination: true,          // Show pagination controls
    keepOriginalValues: false,     // Preserve raw values alongside formatted

    // --- Optional ---
    type: 'MyComponent',          // Category identifier
    variables: [],                 // Formula variable definitions
    themeKey: 'myComponent',       // Key to look up theme styles
    defaultState: { ... },         // Initial state shape (see below)
    controls: { ... },             // Admin UI controls (see below)
}
```

### `defaultState`

The initial state structure for new instances. For data-driven components:

```js
defaultState: {
    dataRequest: {},              // Filter/sort/group configuration (built automatically)
    columns: [],                  // Column definitions (populated from data source)
    data: [],                     // Row data (populated by DataWrapper)
    display: {                    // UI settings (your custom defaults go here)
        pageSize: 50,
        // ... component-specific display options
    },
    sourceInfo: { columns: [] }   // Data source metadata (populated automatically)
}
```

### `controls`

Controls define the admin UI that appears in the section settings menu. There are four control groups:

```js
controls: {
    // Per-column settings (stored in state.columns[i])
    columns: [
        { type: 'toggle', label: 'Show', key: 'show' },
        { type: 'toggle', label: 'Filter', key: 'filters',
          trueValue: [{ type: 'internal', operation: 'filter', values: [] }] },
        { type: 'toggle', label: 'Group', key: 'group' },
        { type: 'select', label: 'Fn', key: 'fn',
          options: [
              { label: 'fn', value: ' ' },
              { label: 'sum', value: 'sum' },
              { label: 'count', value: 'count' },
              { label: 'avg', value: 'avg' },
          ]},
    ],

    // Global display settings (stored in state.display)
    more: [
        { type: 'toggle', label: 'Allow Download', key: 'allowDownload' },
        { type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize' },
        { type: 'select', label: 'Filter Relation', key: 'filterRelation',
          options: [{ label: 'and', value: 'and' }, { label: 'or', value: 'or' }] },
    ],

    // Per-column header settings (stored in state.columns[i], shown in column header menus)
    inHeader: [
        { type: 'select', label: 'Sort', key: 'sort',
          options: [
              { label: 'Not Sorted', value: '' },
              { label: 'A->Z', value: 'asc nulls last' },
              { label: 'Z->A', value: 'desc nulls last' },
          ]},
        { type: 'select', label: 'Format', key: 'formatFn',
          options: [
              { label: 'No Format', value: ' ' },
              { label: 'Comma Separated', value: 'comma' },
              { label: 'Abbreviated', value: 'abbreviate' },
          ]},
    ],

    // Custom panel (a named React component)
    appearance: { name: 'Appearance', type: AppearanceControlsComponent },
    // or with a Comp property:
    actions: { name: 'Actions', Comp: ActionControlsComponent },
}
```

**Control types:** `toggle`, `select`, `input` (with `inputType`), `colorpicker`, `filter`, or a React component function.

Controls can have:
- `displayCdn: ({display, attribute, isEdit}) => boolean` — conditional visibility
- `onChange: ({key, value, attribute, state, columnIdx}) => void` — custom side effects (mutates state via Immer)
- `isBatchUpdatable: true` — enables batch editing across selected columns
- `dataFetch: true` — triggers data refetch on change

### NavigableMenu Control Types Reference

Controls are rendered in the section settings menu via `NavigableMenu`. The following built-in control types are available:

#### `toggle`

A Switch component for boolean values.

```js
{ type: 'toggle', label: 'Show', key: 'show' }
// With custom true value:
{ type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{...}] }
```

**Props passed:** `enabled`, `setEnabled`

#### `select`

A dropdown select for choosing from predefined options.

```js
{
    type: 'select',
    label: 'Sort',
    key: 'sort',
    options: [
        { label: 'Not Sorted', value: '' },
        { label: 'A->Z', value: 'asc nulls last' },
        { label: 'Z->A', value: 'desc nulls last' },
    ]
}
```

**Props passed:** `value`, `onChange`, `options`

#### `input`

A text or number input field.

```js
{ type: 'input', inputType: 'text', label: 'Link Text', key: 'linkText' }
{ type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize' }
```

**Props passed:** `value`, `onChange`, `type` (from `inputType`)

#### `colorpicker`

A color picker with preset colors and optional full picker.

```js
{
    type: 'colorpicker',
    label: 'Background',
    key: 'bgColor',
    colors: ['#FFFFFF', '#F3F8F9', '#FCF6EC', 'rgba(0,0,0,0)'],  // optional preset colors
    showColorPicker: false  // whether to show full HSV picker (default: false)
}
```

**Props passed:** `value`, `onChange`, `colors`, `showColorPicker`

#### `filter`

A text filter input for searching/filtering.

```js
{ type: 'filter', label: 'filter', placeHolder: 'search...', key: 'localFilter' }
```

#### `link`

A navigation link.

```js
{ type: 'link', name: 'Go to Settings', path: '/settings', icon: 'Settings' }
```

#### `separator`

A visual separator line between menu items.

```js
{ type: 'separator' }
```

#### Custom Function

A render function for custom UI. Receives the menu item as argument.

```js
{
    type: ({attribute, setAttribute, value, setValue, setState}) => (
        <div className="flex gap-2">
            <button onClick={() => setValue('option1')}>Option 1</button>
            <button onClick={() => setValue('option2')}>Option 2</button>
        </div>
    ),
    label: 'Custom Control',
    key: 'myCustomSetting'
}
```

**Function arguments for column controls:**
- `attribute` — the column object
- `setAttribute` — function to replace the entire column object
- `value` — current value of `attribute[key]`
- `setValue` — function to update just this key's value
- `setState` — immer setState for direct state mutation

**Function arguments for `more` controls:**
- `value` — current value of `state.display[key]`
- `setValue` — function to update just this key's value

### Control Groups and Data Flow

| Control Group | Storage Location | When Shown | Description |
|--------------|------------------|------------|-------------|
| `columns` | `state.columns[i]` | `useDataSource` components in edit mode | Per-column settings in Columns menu |
| `inHeader` | `state.columns[i]` | `useDataSource` components | Per-column settings in header dropdowns |
| `more` | `state.display` | `useDataSource` components in edit mode | Global settings in More menu |
| Custom groups | `state.display` | Always (edit mode) | Custom named menu items |

**Important:** The `columns`, `inHeader`, and `more` control groups only appear for components with `useDataSource: true`. For simple components (without data source), use custom control groups with an `items` array for declarative controls.

### Nested Submenu Pattern (Preferred)

Controls are rendered as **nested submenus** in the NavigableMenu, similar to how `Layout > Width` or `Layout > Rowspan` work. This provides a consistent, navigable UI:

```
Section Settings
├── Appearance          ← Custom control group
│   ├── Style: Default  ← Shows current value, click to open submenu
│   │   ├── ✓ Default Text    ← Options with checkmark on selected
│   │   ├── Inline Guidance
│   │   ├── Annotation Card
│   │   └── ...
│   └── Background      ← Only shown when displayCdn returns true
│       └── [Color Picker]
└── Layout
    ├── Width: 1
    └── ...
```

**How control types render as submenus:**

| Control Type | Parent Item | Submenu Items |
|-------------|-------------|---------------|
| `select` | Label + current value | List of options with checkmark on selected |
| `colorpicker` | Label | Color picker component |
| `input` | Label + current value | Input field |
| `toggle` | Label + switch | (no submenu, toggle inline) |

### Example: Declarative Controls for Simple Component (Recommended)

For components without `useDataSource`, create a custom control group with an `items` array. Controls are rendered as nested submenus:

```js
// Component definition with declarative controls
export default {
    name: 'Rich Text',
    EditComp: Edit,
    ViewComp: View,
    defaultState: {
        display: {
            isCard: '',
            bgColor: 'rgba(0,0,0,0)'
        }
    },
    controls: {
        appearance: {
            name: 'Appearance',
            items: [
                {
                    type: 'select',       // Renders as: Style: [current] → submenu with options
                    label: 'Style',
                    key: 'isCard',
                    options: [
                        { label: 'Default Text', value: '' },
                        { label: 'Annotation Card', value: 'Annotation' },
                        // ...more options
                    ],
                    onChange: ({key, value, state}) => {
                        // Side effect: reset bgColor when switching styles
                        if (value !== 'Annotation') {
                            state.display.bgColor = 'rgba(0,0,0,0)';
                        }
                    }
                },
                {
                    type: 'colorpicker',  // Renders as: Background → submenu with color picker
                    label: 'Background',
                    key: 'bgColor',
                    colors: ['#FFFFFF', '#F3F8F9', '#FCF6EC', 'rgba(0,0,0,0)'],
                    showColorPicker: false,
                    displayCdn: ({display}) => !!display?.isCard  // Only show when a style is selected
                }
            ]
        }
    }
}
```

The component reads settings from `ComponentContext.state.display` and syncs them back to `element-data`:

```jsx
const Edit = ({value, onChange}) => {
    const { state, setState } = useContext(ComponentContext);

    // Get settings from ComponentContext.state.display (managed by controls)
    const isCard = state?.display?.isCard || '';
    const bgColor = state?.display?.bgColor || 'rgba(0,0,0,0)';

    // Sync state.display changes to element-data
    useEffect(() => {
        const newData = { isCard, bgColor, /* ...other data */ };
        onChange(JSON.stringify(newData));
    }, [isCard, bgColor]);

    // Initialize state.display from saved element-data on mount
    useEffect(() => {
        const cachedData = value ? JSON.parse(value) : {};
        if (cachedData.isCard || cachedData.bgColor) {
            setState(draft => {
                if (!draft.display) draft.display = {};
                draft.display.isCard = cachedData.isCard || '';
                draft.display.bgColor = cachedData.bgColor || 'rgba(0,0,0,0)';
            });
        }
    }, []);

    return <div>...</div>;
}
```

### Example: Legacy Custom Control Group (Function-based)

For more complex custom UI that doesn't fit the submenu pattern, you can use a `type` function that renders a React component:

```js
// In component definition
controls: {
    appearance: {
        name: 'Appearance',
        type: AppearanceControls  // React component
    }
}

// AppearanceControls component
function AppearanceControls() {
    const { state, setState } = useContext(ComponentContext);

    return (
        <div className="p-2 flex flex-col gap-2">
            <label>Style</label>
            <Select
                value={state.display?.style || ''}
                options={[...]}
                onChange={e => setState(draft => {
                    if (!draft.display) draft.display = {};
                    draft.display.style = e.target.value;
                })}
            />
        </div>
    );
}
```

## Creating a New Component

### Pattern A: Simple (no data source)

For components that render static/self-managed content (like the rich text editor):

```
ComponentRegistry/
  MyWidget/
    index.jsx
```

```jsx
// ComponentRegistry/MyWidget/index.jsx
import React, { useState, useEffect } from 'react';

const Edit = ({ value, onChange }) => {
    // value is a JSON string stored in element-data
    const parsed = value ? JSON.parse(value) : { content: '' };

    return (
        <textarea
            value={parsed.content}
            onChange={e => onChange(JSON.stringify({ content: e.target.value }))}
        />
    );
};

const View = ({ value }) => {
    if (!value) return null;
    const parsed = typeof value === 'object' ? value['element-data'] : JSON.parse(value);
    return <div>{parsed?.content}</div>;
};

export default {
    name: 'My Widget',
    EditComp: Edit,
    ViewComp: View,
};
```

**Key points:**
- `EditComp` receives `value` (string) and `onChange` (function).
- `onChange` should be called with a JSON string.
- `ViewComp` receives `value` which may be a string or object with `element-data`.
- No `useDataSource` property means the DataWrapper is bypassed entirely.

### Pattern B: Data-driven (with data source)

For components that display data from a DMS or external data source:

```
ComponentRegistry/
  MyDataComponent/
    index.jsx
```

```jsx
// ComponentRegistry/MyDataComponent/index.jsx
import React, { useContext } from 'react';
import { ComponentContext } from '../../../../../context';
import { ThemeContext } from '../../../../../../../ui/useTheme';

const MyDataComponent = ({ isEdit }) => {
    const { state, setState, controls } = useContext(ComponentContext);
    const { UI } = useContext(ThemeContext);

    // state.columns — array of column definitions
    // state.data — array of data rows
    // state.display — your display settings from defaultState + user config
    // state.sourceInfo — metadata about the data source

    const visibleColumns = state.columns.filter(col => col.show);

    return (
        <div>
            {state.data.map((row, i) => (
                <div key={row.id || i}>
                    {visibleColumns.map(col => (
                        <span key={col.name}>{row[col.name]}</span>
                    ))}
                </div>
            ))}
        </div>
    );
};

export default {
    name: 'My Data Component',
    type: 'MyDataComponent',
    useDataSource: true,
    fullDataLoad: false,         // paginated
    useGetDataOnPageChange: true,
    showPagination: true,
    defaultState: {
        dataRequest: {},
        columns: [],
        data: [],
        display: {
            pageSize: 25,
            // your custom display defaults:
            showLabels: true,
        },
        sourceInfo: { columns: [] },
    },
    controls: {
        columns: [
            { type: 'toggle', label: 'Show', key: 'show' },
            { type: 'toggle', label: 'Filter', key: 'filters',
              trueValue: [{ type: 'internal', operation: 'filter', values: [] }] },
        ],
        more: [
            { type: 'toggle', label: 'Show Labels', key: 'showLabels' },
            { type: 'input', inputType: 'number', label: 'Page Size', key: 'pageSize' },
        ],
    },
    EditComp: MyDataComponent,
    ViewComp: MyDataComponent,
};
```

**Key points:**
- Set `useDataSource: true` to get the DataWrapper.
- The DataWrapper populates `state.columns`, `state.data`, `state.sourceInfo` automatically.
- Your component reads from `ComponentContext` — you don't fetch data yourself.
- `fullDataLoad: true` loads all rows at once (use for graphs/visualizations). `false` loads page-by-page.
- The same React component can often serve both `EditComp` and `ViewComp`, using `isEdit` to toggle edit-specific UI.

### Pattern C: Data-driven with CRUD

If your component needs to create, update, or delete rows, it receives CRUD props from the DataWrapper. Currently this is enabled for components named `'Spreadsheet'` or `'Card'` via a check in the DataWrapper:

```js
// dataWrapper/index.jsx
const componentProps = ['Spreadsheet', 'Card'].includes(component.name) ? {
    newItem, setNewItem,
    updateItem, removeItem, addItem,
    currentPage, infiniteScrollFetchData: onPageChange,
    allowEdit
} : {}
```

To receive these props for a custom component, your component `name` would need to be added to that check, or you can implement CRUD directly using `apiUpdate` from `ComponentContext`.

### Step 3: Register the component

Add your component to the registry:

```jsx
// ComponentRegistry/index.jsx
import MyDataComponent from './MyDataComponent';

const ComponentRegistry = {
    // ... existing components
    "My Data Component": MyDataComponent,
};
```

The key you use here is what appears in the component type selector and what gets stored as `element-type`. You can use a namespaced format like `"Category: Component Name"` for organization (e.g. `"Header: Default Header"`).

### Step 4: External registration (optional)

Components can also be registered at runtime from outside the DMS library:

```js
import { registerComponents } from '@availabs/dms';

registerComponents({
    "My External Component": myComponentDefinition,
});
```

This calls `registerComponents()` in `section.jsx` which merges into the registry.

## State Shape Reference

### `state.columns[i]`

Each column object contains source metadata plus user-configured settings:

```js
{
    // From data source
    name: 'column_name',              // Database column name
    display_name: 'Column Name',      // Original display name
    type: 'text',                     // text | number | date | select | multiselect | formula

    // User-configured (via controls)
    show: true,                       // Visible in output
    customName: 'My Label',           // Override display name
    group: false,                     // Group by this column
    sort: 'asc nulls last',          // Sort direction
    fn: 'sum',                        // Aggregation: sum | avg | count | max | list
    excludeNA: false,                 // Exclude null values

    // Filters
    filters: [{
        type: 'internal',             // internal | external
        operation: 'filter',          // filter | exclude | > | >= | < | <= | like
        values: [],                   // Filter values
    }],

    // Display formatting
    formatFn: 'comma',                // comma | abbreviate | date | title | icon | color
    justify: 'left',                  // left | center | right
    headerFontStyle: 'textSM',       // Font style key
    valueFontStyle: 'textMD',        // Font style key

    // Editing
    editable: true,
    allowEditInView: false,
    options: [{ label, value }],       // For select/multiselect types
}
```

### `state.display`

Global display settings. Common properties:

```js
{
    pageSize: 50,
    totalLength: 0,                   // Set by DataWrapper after fetch
    filteredLength: 0,                // Set after local filtering
    usePagination: false,
    readyToLoad: false,               // Triggers data fetch in view mode
    allowDownload: false,
    allowEditInView: false,
    allowAdddNew: false,
    showAttribution: false,
    hideIfNull: false,                // Hide section if all data is null
    preventDuplicateFetch: false,
    filterRelation: 'and',            // and | or
    usePageFilters: false,            // Bind filters to URL search params
    // ... your custom properties
}
```

### `state.sourceInfo`

Populated when a data source and view are selected:

```js
{
    source_id: '123',
    view_id: '456',
    view_name: 'My View',
    app: 'app_name',
    type: 'doc_type',
    isDms: true,                      // true for DMS sources, false for external
    env: 'app+type',
    columns: [{ name, type, ... }],   // Original columns from the source
}
```

## Contexts Available

| Context | Access via | Provides |
|---------|-----------|----------|
| `ComponentContext` | `useContext(ComponentContext)` | `state`, `setState`, `apiLoad`, `apiUpdate`, `controls`, `isActive`, `activeStyle` |
| `PageContext` | `useContext(PageContext)` | `pageState`, `apiLoad`, `apiUpdate`, `item`, `editPageMode`, `format`, `baseUrl` |
| `CMSContext` | `useContext(CMSContext)` | `app`, `type`, `API_HOST`, `baseUrl`, `datasources`, `user`, `falcor` |
| `ThemeContext` | `useContext(ThemeContext)` | `theme` (style definitions), `UI` (component library: Table, Card, Graph, Icon, Button, Select, etc.) |

## Existing Components Reference

| Registry Key | `useDataSource` | `fullDataLoad` | Description |
|-------------|----------------|----------------|-------------|
| `lexical` | no | — | Rich text editor (Lexical). Default component type. |
| `Spreadsheet` | yes | no | Data table with pagination, inline editing, CRUD |
| `Card` | yes | no | Card/list layout with formatting controls |
| `Graph` | yes | yes | Charts (bar, line, etc.) via D3. Loads all data. |
| `Filter` | yes | — | Filter controls component |
| `Header: Default Header` | no | — | Page header |
| `Header: MNY Data` | yes | — | Data-driven header |
| `Footer: MNY Footer` | no | — | Page footer |
| `PDFGenerator` | — | — | PDF export |
| `Upload` | — | — | File upload |
| `Validate` | — | — | Data validation |
| `Table: Components Index` | — | — | Component listing table |

## Tips

- Use `useImmer` patterns when modifying state via `setState`. The `draft` parameter is a mutable Immer draft:
  ```js
  setState(draft => { draft.display.myOption = true; });
  ```
- Access theme UI components (`Table`, `Card`, `Graph`, `Icon`, `Button`, `Select`) from `ThemeContext` rather than importing them directly. This keeps components theme-agnostic.
- If your component only differs between edit and view mode in minor ways, use a single React component for both `EditComp` and `ViewComp` and branch on the `isEdit` prop.
- The `controls` system automatically generates admin UI. Prefer defining controls declaratively rather than building custom settings panels.
- Column `filters` with `type: 'internal'` are managed by the admin UI. Filters with `usePageFilters: true` bind to URL search parameters for cross-component filtering.
