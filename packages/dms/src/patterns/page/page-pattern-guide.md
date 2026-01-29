# Page Pattern Guide

This guide explains the page pattern in the DMS (Data Management System) library. The page pattern is a complete content management system for creating, editing, and publishing pages with dynamic content, hierarchical organization, and role-based access control.

## Table of Contents

1. [Overview](#overview)
2. [File Structure](#file-structure)
3. [Core Architecture](#core-architecture)
4. [Routing System](#routing-system)
5. [Context System](#context-system)
6. [Page Format & Data Model](#page-format--data-model)
7. [Section System](#section-system)
8. [Component Registry](#component-registry)
9. [Data Management](#data-management)
10. [Authorization & Permissions](#authorization--permissions)
11. [Theme System](#theme-system)
12. [Edit Mode & Workflows](#edit-mode--workflows)
13. [Utilities & Hooks](#utilities--hooks)

---

## Overview

The page pattern provides:

- **Page CRUD operations** - Create, read, update, delete pages
- **Hierarchical organization** - Pages with parent/child relationships
- **Section-based content** - Pages composed of reorderable sections
- **Multiple component types** - Rich text, graphs, spreadsheets, etc.
- **Role-based permissions** - Granular access control per page/section
- **Draft/publish workflow** - Edit drafts before publishing
- **Data source integration** - Connect sections to external data
- **Search and filtering** - Built-in search and filter capabilities
- **Theming** - Customizable appearance per page/section

---

## File Structure

```
patterns/page/
├── siteConfig.jsx              # Pattern entry point - route configuration
├── page.format.js              # Data format definitions
├── auth.js                     # Authorization utilities
├── context.js                  # React contexts (CMSContext, PageContext, ComponentContext)
├── defaultTheme.js             # Default theme configuration
│
├── components/
│   ├── userMenu.jsx            # User menu component
│   ├── search/                 # Search functionality
│   │   ├── index.jsx           # Search button
│   │   └── SearchPage.jsx      # Full search page
│   ├── saveAsPDF/              # PDF export utilities
│   └── sections/               # Section rendering system
│       ├── section.jsx         # Individual section component
│       ├── sectionArray.jsx    # Section list container
│       ├── sectionGroup.jsx    # Section grouping (header/content/footer)
│       ├── sectionMenu.jsx     # Section context menu
│       ├── useDataSource.js    # Data source hook
│       └── components/
│           ├── index.jsx       # Component wrapper
│           ├── ComponentRegistry/  # All registered components
│           │   ├── lexical/    # Rich text editor
│           │   ├── graph/      # Charts/graphs
│           │   ├── spreadsheet/# Data tables
│           │   ├── Card.jsx
│           │   ├── header.jsx
│           │   └── footer.jsx
│           └── dataWrapper/    # Data management wrapper
│
└── pages/
    ├── view.jsx                # Public page view
    ├── error.jsx               # Error page
    ├── edit/                   # Page editing
    │   ├── index.jsx           # Edit container
    │   ├── editFunctions.jsx   # Edit operations
    │   └── editPane/           # Edit control panels
    │       ├── settingsPane.jsx
    │       ├── pagesPane.jsx
    │       ├── historyPane.jsx
    │       └── permissionsPane.jsx
    ├── manager/                # Admin management
    │   ├── pages.jsx
    │   ├── design.jsx
    │   └── template/           # Template management
    └── _utils/                 # Utility functions
```

---

## Core Architecture

### Entry Point: siteConfig.jsx

The `siteConfig.jsx` file is the pattern's entry point. It exports a function that receives app configuration and returns a React Router-compatible route configuration.

```javascript
// Pattern signature
export default function pagePattern({ app, type, themes, API_HOST, ...config }) {
  return {
    path: '/*',
    element: <PageRouteWrapper />,
    children: [
      { path: 'edit/*', element: <PageEdit /> },
      { path: '/*', element: <PageView /> }
    ]
  }
}
```

**Key responsibilities:**
1. Initialize contexts with app state
2. Configure format definitions
3. Set up routing with permission checks
4. Merge theme configuration

### Data Flow Overview

```
App Configuration
       ↓
siteConfig.jsx (route setup)
       ↓
CMSContext (global state)
       ↓
PageContext (page state)
       ↓
ComponentContext (section state)
       ↓
Rendered Components
```

---

## Routing System

### Route Structure

The pattern defines two primary routes:

| Route | Component | Action | Purpose |
|-------|-----------|--------|---------|
| `/*` | PageView | view | Public page display |
| `edit/*` | PageEdit | edit | Page editing interface |

### Permission-Based Routing

Each route specifies required permissions:

```javascript
// View route
{ path: '/*', reqPermissions: ['view-page'] }

// Edit route
{ path: 'edit/*', reqPermissions: [
  'create-page',
  'edit-page',
  'edit-page-layout',
  'edit-page-params',
  'edit-page-permissions',
  'publish-page'
]}
```

### URL Structure

Pages use URL slugs for routing:
- `/my-page` - View page with slug "my-page"
- `/parent/child` - Nested page structure
- `/edit/my-page` - Edit page with slug "my-page"

---

## Context System

Three React contexts manage state throughout the pattern:

### CMSContext

Global application state shared across all pages.

```javascript
CMSContext = {
  app,                  // Application identifier
  type,                 // Content type
  siteType,             // Site configuration type
  API_HOST,             // API endpoint
  baseUrl,              // Base URL for routing
  pgEnv,                // Database environment
  user,                 // Current user object
  falcor,               // Falcor data client
  authPermissions,      // User's permissions
  isUserAuthed,         // Auth check function
  patternFilters,       // Global filter configuration
  datasetPatterns,      // Dataset pattern definitions
  damaBaseUrl,          // DAMA API base URL
  Menu                  // Navigation menu component
}
```

### PageContext

State for the current page being viewed/edited.

```javascript
PageContext = {
  item,                     // Current page data
  pageState,                // Page state with merged filters
  setPageState,             // State update function
  updatePageStateFilters,   // Filter update function
  dataItems,                // All pages in the site
  apiLoad,                  // Data loading function
  apiUpdate,                // Data update function
  updateAttribute,          // Single attribute updater
  editPane,                 // Edit pane state {open, index}
  setEditPane,              // Edit pane state setter
  format,                   // Page format definition
  busy,                     // Loading state
  baseUrl                   // Page base URL
}
```

### ComponentContext

State for individual section components.

```javascript
ComponentContext = {
  state,          // Component data state
  setState,       // State updater
  apiLoad,        // Data loader
  apiUpdate,      // Data updater
  controls,       // Component control configuration
  isActive,       // Active state boolean
  activeStyle     // Active state styling
}
```

---

## Page Format & Data Model

### Page Format (cmsPageFormat)

Defines the data structure for pages:

```javascript
cmsPageFormat = {
  app: "dms-site",
  type: "docs-page",
  registerFormats: [cmsSection, pageEdit],
  attributes: [
    // Metadata
    { key: "title", type: "text" },
    { key: "index", type: "number" },
    { key: "parent", type: "text" },
    { key: "url_slug", type: "text" },
    { key: "published", type: "text", default: "draft" },

    // Layout
    { key: "sidebar", type: "text", default: "show" },
    { key: "header", type: "text", default: "above" },
    { key: "footer", type: "text", default: "none" },
    { key: "full_width", type: "text", default: "show" },

    // Content
    { key: "sections", type: "dms-format", format: "cmsSection[]" },
    { key: "draft_sections", type: "dms-format", format: "cmsSection[]" },
    { key: "section_groups", type: "text" },
    { key: "draft_section_groups", type: "text" },

    // Permissions & History
    { key: "authPermissions", type: "text" },
    { key: "history", type: "text" },
    { key: "has_changes", type: "text", default: "false" },

    // Templates
    { key: "template_id", type: "text" },
    { key: "generated-pages", type: "text" }
  ]
}
```

### Section Format (cmsSection)

Defines the data structure for sections within a page:

```javascript
cmsSection = {
  attributes: [
    { key: "title", type: "text" },
    { key: "level", type: "number", default: 1 },
    { key: "tags", type: "text" },
    { key: "description", type: "text" },
    { key: "helpText", type: "text" },
    { key: "authPermissions", type: "text" },
    { key: "element", type: "text" },      // Component data
    { key: "parent", type: "text" },
    { key: "url_slug", type: "text" },
    { key: "is_draft", type: "boolean", default: true }
  ]
}
```

### Element Structure

Each section's `element` contains the component configuration:

```javascript
element = {
  "element-type": "lexical",  // Component type
  "element-data": "{...}"     // Stringified JSON data
}
```

---

## Section System

### Section Groups

Pages organize sections into groups by position:

| Position | Purpose | Typical Content |
|----------|---------|-----------------|
| `top` | Header area | Site header, navigation |
| `content` | Main content | Article content, data displays |
| `bottom` | Footer area | Footer, related links |

```javascript
section_groups = [
  { name: "Header", position: "top", theme: {...} },
  { name: "Main Content", position: "content", theme: {...} },
  { name: "Footer", position: "bottom", theme: {...} }
]
```

### Section Rendering Hierarchy

```
Page
  └── SectionGroup (position: top/content/bottom)
        └── SectionArray (list of sections)
              └── Section (individual section)
                    └── Component (lexical/graph/spreadsheet/etc.)
```

### Section Component (section.jsx)

Renders individual sections with:

**SectionView:**
- Section header (title, level, tags, description)
- Help text (collapsible)
- Registered component in view mode
- Optional edit icons when in edit context

**SectionEdit:**
- Section metadata editor
- Component in edit mode
- Add/remove/reorder controls
- Section menu for settings

### SectionArray Component (sectionArray.jsx)

Manages a list of sections:
- Renders all sections in a group
- Provides add/remove controls in edit mode
- Handles section reordering
- Manages edit state for individual sections

### SectionGroup Component (sectionGroup.jsx)

Groups sections by position:
- Applies group-level theming
- Manages layout for the position
- Optional sidebar navigation
- Renders SectionArray with filtered sections

---

## Component Registry

### Registered Components

The pattern includes these built-in components:

| Type | Purpose | Features |
|------|---------|----------|
| `lexical` | Rich text editor | Full formatting, tables, images |
| `Graph` | Data visualization | Various chart types |
| `Spreadsheet` | Data tables | Sorting, filtering, pagination |
| `Card` | Card display | Configurable card layouts |
| `Header: Default Header` | Page header | Title, navigation |
| `Header: MNY Data` | Data-driven header | Dynamic content |
| `Footer: MNY Footer` | Page footer | Links, branding |
| `Filter` | Filter UI | Interactive filters |
| `Upload` | File upload | File management |
| `Validate` | Data validation | Validation rules |

### Component Interface

Each component must implement:

```javascript
{
  name: "Component Name",

  // Initial state
  defaultState: { ... },

  // Component configuration
  controls: { ... },

  // Whether component uses external data
  useDataSource: false,

  // Edit mode component
  EditComp: ({ value, onChange, ...props }) => <Editor />,

  // View mode component
  ViewComp: ({ value, ...props }) => <Display />,

  // Optional: Data loading function
  getData: async (falcor, pgEnv, viewId) => data,

  // Optional: Keep original values when data changes
  keepOriginalValues: false,

  // Optional: Load full data set
  fullDataLoad: false
}
```

### Component Wrapper (components/index.jsx)

Wraps components with:
- Data refresh controls
- Filter rendering
- State management
- Context provision

```javascript
// Edit mode
<EditComp>
  <Controls />
  <RenderFilters />
  <ComponentEditor />
</EditComp>

// View mode
<ViewComp>
  <RenderFilters />
  <ComponentViewer />
</ViewComp>
```

### Adding Custom Components

Register new components in `ComponentRegistry/index.jsx`:

```javascript
const registeredComponents = {
  'lexical': lexicalConfig,
  'Graph': graphConfig,
  'MyCustomComponent': {
    name: 'My Custom Component',
    defaultState: { content: '' },
    EditComp: MyEditComponent,
    ViewComp: MyViewComponent
  }
}
```

---

## Data Management

The page pattern supports two types of data sources that components can connect to: **external DAMA sources** (via `pgEnv`) and **internal DMS datasets** (via `datasetPatterns`). These are configured at the site level and passed through CMSContext.

### Data Source Configuration

#### pgEnv (External DAMA Sources)

`pgEnv` is a string identifier for the external DAMA database environment.

**Origin:** Passed as `pgEnvs` array prop to `DmsSite` component, then `pgEnvs[0]` is used.

```javascript
// In App.jsx
<DmsSite
  pgEnvs={['hazmit_dama']}  // Array of available environments
  ...
/>

// In dmsSiteFactory.jsx - passed to pattern configs
pgEnv: pgEnvs?.[0] || ''  // First environment used as default
```

**Structure:** A simple string identifying the database environment.

```javascript
pgEnv = 'hazmit_dama'  // or 'production', 'staging', etc.
```

**Usage in Falcor queries:**

```javascript
// Fetching sources
["dama", pgEnv, "sources", "length"]
["dama", pgEnv, "sources", "byIndex", { from: 0, to: len - 1 }, attributes]

// Fetching views for a source
["dama", pgEnv, "sources", "byId", source_id, "views", "length"]
["dama", pgEnv, "viewsbyId", view_id, "data", "length"]

// Alternative UDA path format (in useDataSource.js)
["uda", pgEnv, "sources", "length"]
["uda", pgEnv, "sources", "byIndex", range, srcAttributes]
```

**Files using pgEnv:**
| File | Purpose |
|------|---------|
| `siteConfig.jsx:48,88` | Receives and passes to CMSContext |
| `useDataSource.js:81,107,126` | Builds external source environment config |
| `dataWrapper/index.jsx:109,356,515,738` | Data loading operations |
| `componentsIndexTable.jsx:336,353,364` | Component index data loading |
| `SourceSelect.jsx:8,13,16,21,27` | Template source selection |
| `ViewsSelect.jsx:21,25,28,34,40` | Template view selection |
| `ViewInfo.jsx:10,30,33,37,56,67` | View information display |
| `template/pages.jsx:117,146,153,156,167,176,182` | Template page management |
| `UploadComponent.jsx:35,42` | File upload context |

#### damaBaseUrl (External Source Links)

`damaBaseUrl` is a string URL path used for creating frontend links to DAMA source detail pages.

**Origin:** Passed as optional `damaBaseUrl` prop to `DmsSite` component.

```javascript
// In App.jsx (optional)
<DmsSite
  damaBaseUrl="/datasources"  // Frontend route for DAMA source pages
  ...
/>

// In dmsSiteFactory.jsx - passed to pattern configs
damaBaseUrl,
```

**Structure:** A simple string URL path (or undefined).

```javascript
damaBaseUrl = '/datasources'  // Frontend route prefix
```

**Usage in Attribution.jsx:**

```javascript
const { damaBaseUrl } = React.useContext(CMSContext) || {}

// Creates links to source detail pages
// External DAMA sources: ${damaBaseUrl}/source/${source_id}
// Internal DMS sources: /forms/source/${source_id}
<Link to={`${isDms ? `/forms` : damaBaseUrl}/source/${source_id}`}>
```

**Files using damaBaseUrl:**
| File | Purpose |
|------|---------|
| `siteConfig.jsx:42,90` | Receives and passes to CMSContext |
| `Attribution.jsx:13,24` | Creates links to source detail pages |

**Relationship to pgEnv:**
- `pgEnv` is the **backend identifier** for Falcor data queries
- `damaBaseUrl` is the **frontend path** for UI navigation links
- Both relate to external DAMA sources and could be combined into a single datasource configuration

#### datasetPatterns (Internal DMS Datasets)

`datasetPatterns` is an array of pattern objects representing internal DMS datasets (forms and datasets pattern types).

**Origin:** Derived in `dmsSiteFactory.jsx` from all patterns with type 'forms' or 'datasets'.

```javascript
// In dmsSiteFactory.jsx
datasetPatterns: patterns.filter(p => ['forms', 'datasets'].includes(p.pattern_type))
```

**Structure:** Array of pattern objects.

```javascript
datasetPatterns = [
  {
    id: 123,
    pattern_type: 'datasets',      // or 'forms'
    doc_type: 'my-dataset',        // Used to build source key
    base_url: '/datasets/my-data',
    subdomain: '*',
    authPermissions: '{}',
    config: { ... },               // Pattern configuration
    // ... other pattern fields
  },
  // ... more patterns
]
```

**Key properties used:**
- `doc_type`: Combined with `app` to create internal source keys like `${app}+${doc_type}`
- `pattern_type`: Must be 'forms' or 'datasets' to be included

**Usage in useDataSource.js:**

```javascript
// Building internal source environments
const envs = useMemo(() => ({
  // External source (from pgEnv)
  ...(sourceTypes.includes("external") && {
    [pgEnv]: {
      label: "external",
      srcAttributes: ["name", "metadata"],
      viewAttributes: ["version", "_modified_timestamp"],
    },
  }),

  // Internal sources (from datasetPatterns)
  ...(sourceTypes.includes("internal") &&
    datasetPatterns?.length && {
      ...datasetPatterns.reduce((acc, pattern) => {
        acc[`${app}+${pattern.doc_type}`] = {
          label: "managed",
          isDms: true,
          srcAttributes: ["app", "name", "doc_type", "config", "default_columns"],
          viewAttributes: ["name", "updated_at"],
        };
        return acc;
      }, {}),
    }),
}), [app, datasetPatterns?.length, pgEnv, sourceTypes]);
```

**Files using datasetPatterns:**
| File | Purpose |
|------|---------|
| `siteConfig.jsx:46,89` | Receives and passes to CMSContext |
| `useDataSource.js:81,114-126` | Builds internal source environment config |

### useDataSource Hook

Manages data source connections using both `pgEnv` and `datasetPatterns`.

```javascript
const {
  sources,        // Available data sources (combined list)
  views,          // Views for selected source
  activeSource,   // Currently selected source ID
  activeView,     // Currently selected view ID
  onSourceChange, // Source selection handler
  onViewChange    // View selection handler
} = useDataSource({ state, setState, sourceTypes: ["external", "internal"] })
```

**Source types:**
- `"external"`: DAMA sources accessed via `pgEnv`
- `"internal"`: DMS datasets defined by `datasetPatterns`

**Returned sources format:**

```javascript
sources = [
  // Built-in page/section sources
  { key: `${app}+${type}`, label: `${type} (pages)` },
  { key: `${app}+${type}+sections`, label: `${type} (sections)` },

  // External + internal sources from envs
  { key: source_id, label: `${name} (external)` },      // from pgEnv
  { key: source_id, label: `${name} (managed)` },       // from datasetPatterns
]
```

### DataWrapper Component

Provides data management UI:

```javascript
<DataWrapper>
  <Controls />        // Toolbar buttons
  <Filters />         // Dynamic filter UI
  <Pagination />      // Page navigation
  <DataDisplay />     // Data visualization
</DataWrapper>
```

**Features:**
- Column visibility toggling
- Search and filtering
- Export (CSV, JSON)
- Grouping and aggregation

### Page Filters

Filters can be configured per page and propagate to components:

```javascript
pageState.filters = [
  {
    searchKey: "county",
    useSearchParams: true,    // Reflects in URL
    values: ["NY", "CA"],     // Selected values
    dataType: "string",
    display_name: "County"
  }
]
```

**Filter flow:**
1. User selects filter value
2. `updatePageStateFilters()` updates state
3. URL updates if `useSearchParams: true`
4. Components receive filtered data

---

## Authorization & Permissions

### Permission Model

Permissions are checked at multiple levels:

1. **Route level:** Required permissions per route
2. **Page level:** `authPermissions` on page
3. **Section level:** `authPermissions` on section

### Permission Structure

```javascript
authPermissions = {
  groups: ['admin', 'editor'],  // Allowed groups
  users: ['user123']            // Allowed users
}
```

### auth.js Functions

```javascript
// Check if user has required permissions
isUserAuthed(requiredPermissions, userPermissions)

// Returns true if:
// - No permissions required
// - User groups intersect with allowed groups
// - User ID in allowed users
// - Wildcard '*' grants full access
```

### Permission Inheritance

Sections inherit page permissions but can override:

```javascript
// Page allows editors
page.authPermissions = { groups: ['editor'] }

// Section restricts to admins only
section.authPermissions = { groups: ['admin'] }
```

---

## Theme System

### Theme Structure

```javascript
theme = {
  sectionGroup: {
    wrapper: 'className',
    header: 'className',
    content: 'className'
  },
  sectionArray: {
    wrapper: 'className',
    item: 'className'
  },
  section: {
    wrapper: 'className',
    title: 'className',
    content: 'className',
    helpText: 'className'
  },
  userMenu: { ... },
  searchButton: { ... },
  searchPallet: { ... }
}
```

### Theme Merging

Themes merge at multiple levels:

1. Default theme (defaultTheme.js)
2. Site theme (from config)
3. Page theme (page.theme)
4. Section group theme (group.theme)

```javascript
// Theme resolution
const fullTheme = merge(defaultTheme, siteTheme, pageTheme)
```

### Component Theming

Components receive scoped theme:

```javascript
const theme = getComponentTheme(fullTheme, 'pages.section')
// Returns just the section theme object
```

---

## Edit Mode & Workflows

### Edit Page Structure

```
PageEdit
  ├── PageControls (toolbar)
  │   ├── Settings button
  │   ├── Sections button
  │   ├── Pages button
  │   ├── History button
  │   ├── Permissions button
  │   ├── Grid toggle
  │   └── Publish button
  │
  ├── EditPane (side panel)
  │   ├── SettingsPane
  │   ├── SectionGroupsPane
  │   ├── PagesPane
  │   ├── HistoryPane
  │   └── PermissionsPane
  │
  └── Page Layout
      └── SectionGroups (using draft_sections)
```

### Draft/Publish Workflow

1. **Editing:** Changes saved to `draft_sections` and `draft_section_groups`
2. **has_changes:** Flag indicates unpublished changes
3. **Publish:** Copies draft to live `sections` and `section_groups`
4. **History:** Records all changes with timestamps

```javascript
// Update draft
updateAttribute('draft_sections', newSections)
updateAttribute('has_changes', 'true')

// Publish
updateAttribute('sections', draftSections)
updateAttribute('section_groups', draftSectionGroups)
updateAttribute('has_changes', 'false')
updateAttribute('history', [...history, { action: 'publish', date: Date.now() }])
```

### Edit Pane Panels

| Panel | Purpose | Key Actions |
|-------|---------|-------------|
| Settings | Page metadata | Title, slug, parent, layout options |
| Sections | Content organization | Add/remove groups, reorder sections |
| Pages | Site navigation | View page tree, navigate to pages |
| History | Change tracking | View edit history, rollback |
| Permissions | Access control | Set page/section permissions |

### Edit Functions (editFunctions.jsx)

Common edit operations:

```javascript
// Add new section
addSection(sectionGroup, position, type)

// Remove section
removeSection(sectionId)

// Reorder sections
reorderSections(fromIndex, toIndex)

// Update section content
updateSection(sectionId, updates)

// Duplicate section
duplicateSection(sectionId)
```

---

## Utilities & Hooks

### Navigation Utilities (_utils/index.js)

```javascript
// Build navigation menu from pages
dataItemsNav(dataItems, baseUrl) → menuItems[]

// Build child navigation
getChildNav(parentId, dataItems) → childItems[]

// Build in-page heading navigation
getInPageNav(sections) → headingNav[]
```

### State Utilities

```javascript
// Merge page filters with pattern filters
mergeFilters(pageFilters, patternFilters) → mergedFilters

// Update filters from URL search params
updatePageStateFiltersOnSearchParamChange(searchParams, pageState)

// Initialize navigation with search params
initNavigateUsingSearchParams(navigate, filters)
```

### Data Utilities

```javascript
// Convert filters to URL params
convertToUrlParams(filters) → '?county=NY&year=2023'

// Convert data to DMS form format
json2DmsForm(data) → FormData

// Generate URL slug from title
getUrlSlug(title) → 'my-page-title'
```

### Legacy Support

```javascript
// Add section groups to old pages without them
sectionsEditBackill(page) → pageWithSectionGroups

// Convert old element data format
convertOldState(oldState) → newState
```

---

## Key Relationships

### File Dependencies

```
siteConfig.jsx
  ├── page.format.js
  ├── context.js
  ├── auth.js
  ├── defaultTheme.js
  │
  ├── pages/view.jsx
  │   └── components/sections/
  │       ├── sectionGroup.jsx
  │       ├── sectionArray.jsx
  │       └── section.jsx
  │           └── components/ComponentRegistry/
  │
  └── pages/edit/index.jsx
      ├── editFunctions.jsx
      └── editPane/
```

### Context Flow

```
CMSContext (app, user, permissions)
     ↓
PageContext (page data, update functions)
     ↓
ComponentContext (section state)
     ↓
Component (renders content)
```

### Data Flow

```
API → Falcor → CMSContext → PageContext → Sections → Components
                                ↓
                          updateAttribute
                                ↓
                            apiUpdate
                                ↓
                              API
```

---

## Summary

The page pattern is a comprehensive content management system that provides:

- **Flexible routing** with permission-based access control
- **Hierarchical pages** with parent/child relationships
- **Section-based content** with multiple component types
- **Draft/publish workflow** for content management
- **Data integration** through Falcor and DMS datasets
- **Theming system** for customizable appearance
- **Edit interface** with control panels for all settings

The pattern uses React contexts for state management, a component registry for extensibility, and a layered permission system for access control. All functionality flows from the `siteConfig.jsx` entry point through the context hierarchy to individual components.
