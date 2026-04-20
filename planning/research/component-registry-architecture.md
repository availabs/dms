# Component Registry Architecture — Fast Refresh Refactor Plan

## Status: DRAFT — awaiting review (2026-04-19)

## Problem

Phase 5 of the Vite HMR / Fast Refresh fixes targets the `{ EditComp, ViewComp }` object-wrapped default-export pattern (~34 files). Every file that matches this shape causes a full page reload on edit instead of component-level HMR.

### The pattern

Two levels of the pattern exist across the codebase:

**Level 1 — "simple"** (`ui/columnTypes/*.jsx`, 10 files)

```jsx
// text.jsx
const Edit = (props) => <input {...} />
const View = ({value}) => <div>{value}</div>

export default {
    EditComp: Edit,
    ViewComp: View,
}
```

Consumed at `ui/columnTypes/index.jsx` which assembles them into a dictionary keyed by type (`text`, `number`, `select`, …).

**Level 2 — "rich"** (`patterns/page/components/sections/components/ComponentRegistry/*`, ~15 files)

```jsx
// Card.jsx
const Card = ({ ... }) => <div>…</div>

export default {
    name: 'Card',
    type: 'card',
    useDataSource: true,
    useDataWrapper: true,
    themeKey: 'dataCard',
    defaultState: { … },
    controls: { columns: […], more: […], inHeader: { … } },
    EditComp: Card,
    ViewComp: Card,
}
```

Consumed via the registry at `patterns/page/components/sections/componentRegistry.js`, which exports `registerComponents()` / `getRegisteredComponents()`.

**Level 3 — "external"** (user-space)

Downstream sites register additional components with the same Level-2 shape, either via a theme `pageComponents: { … }` key or an imperative `registerComponents({ … })` call:

```jsx
// src/themes/avail/components/Message.jsx
const Edit = (props) => <div>…</div>
const View = (props) => <div>…</div>

export default {
    name: 'Message',
    EditComp: Edit,
    ViewComp: View,
    defaultState: { display: { message: 'Hello, World!' } },
    controls: { default: [ { type: 'input', key: 'message', … } ] },
}
```

### Why Fast Refresh breaks

`@vitejs/plugin-react` statically analyzes each module and treats a file as a Fast-Refresh boundary **only if every export is a React component**. An `export default { EditComp: …, ViewComp: … }` is an *object literal*, not a component. The plugin cannot peer inside the object to find the components, so the whole module is marked non-refreshable; edits fall back to a full reload that propagates up the importer chain.

The same logic applies to object exports that carry metadata alongside components.

### Consumption surface

- **62 call sites** use `.EditComp` / `.ViewComp` member access (`columnTypes.text.EditComp`, `Component.ViewComp`, etc.)
- **`registerComponents()`** is part of the **public API** (`packages/dms/src/index.js` re-exports it). External consumers — notably `src/themes/avail/theme.js` and `src/themes/transportny/theme.js` — pass objects of the Level-2 shape in.

Anything we do needs to preserve the consumer contract or provide a clean migration path.

---

## Design goals

1. **Fast-Refresh-clean component files.** Editing a `<Card>` or `<View>` should hot-replace, not reload.
2. **Preserve the public API.** `registerComponents({ name: { EditComp, ViewComp, … } })` must continue to work unchanged — external apps and themes shouldn't be forced to change.
3. **Preserve the 62 internal consumption sites.** No mass rewrite to a new shape like `<Comp mode="edit" />`.
4. **Low churn.** Prefer mechanical, per-file splits over a framework-wide rewrite.
5. **Scale to external consumers.** Provide a path for themes/apps that want the same HMR benefit for their own components, without making it mandatory.

---

## Proposed architecture

**Split each component file into two files**: a pure-component file (Fast-Refresh-clean) and a small config/manifest file that combines the component refs with metadata. The registry consumes the config files.

### Before

```
ui/columnTypes/
├── text.jsx              ← exports default { EditComp, ViewComp }
└── index.jsx             ← imports text, wraps in map

patterns/…/ComponentRegistry/
├── Card.jsx              ← exports default { name, type, …, EditComp, ViewComp }
└── index.jsx             ← imports Card, puts into map
```

### After

```
ui/columnTypes/
├── text.jsx              ← exports { TextEdit, TextView }  — named components only
└── index.jsx             ← builds { text: { EditComp: TextEdit, ViewComp: TextView } }
                            (unchanged consumer contract)

patterns/…/ComponentRegistry/
├── Card.jsx              ← exports { CardEdit, CardView }  — named components only
├── Card.config.js        ← combines refs with metadata, exports default
└── index.jsx             ← imports Card.config (and siblings), puts into map
```

**Crucial property:** the `.jsx` files only export React components (named, PascalCase). They become clean Fast-Refresh boundaries. Metadata lives in `.config.js` files that change rarely; editing a `.config.js` triggers a reload, but that's acceptable because shape changes are infrequent during day-to-day development.

### Level 1 (`columnTypes/*`)

Most columnTypes only have `EditComp` and `ViewComp` — no other metadata. Don't need `.config.js`; the assembly can happen inline in the already-existing `columnTypes/index.jsx`:

```js
// columnTypes/text.jsx
export const TextEdit = ({ value, onChange, ... }) => (<input .../>)
export const TextView = ({ value, className }) => (<div className={className}>{value}</div>)

// columnTypes/index.jsx (already the "builder" file)
import * as Text from './text'
import * as Boolean_ from './boolean'
// …

export default {
    text: { EditComp: Text.TextEdit, ViewComp: Text.TextView },
    number: {
        EditComp: (p) => <Text.TextEdit {...p} type="number"/>,
        ViewComp: (p) => <Text.TextView {...p} type="number"/>,
    },
    boolean: { EditComp: Boolean_.BooleanEdit, ViewComp: Boolean_.BooleanView },
    // …
}
```

10 files changed. No consumer-side changes. `index.jsx` stays object-literal (it *is* the registry — a non-component boundary by design), but the per-type files become refreshable.

### Level 2 (`ComponentRegistry/*`)

Rich metadata — takes the full `.config.js` treatment:

```jsx
// ComponentRegistry/Card.jsx — pure component file
import React, { ... } from 'react'
// … imports for ComponentContext, ColorControls, etc …

export function Card({ isEdit, updateItem, addItem, ... }) {
    return <div>…</div>
}
```

```js
// ComponentRegistry/Card.config.js — metadata + mapping
import { Card } from './Card'

const fontStyleOptions = [ … ]  // was in Card.jsx, moves here since controls reference it

export default {
    name: 'Card',
    type: 'card',
    useDataSource: true,
    useDataWrapper: true,
    themeKey: 'dataCard',
    defaultState: { filters: { … }, display: { … }, columns: [], data: [] },
    controls: {
        columns: [ … ],
        more: [ …, { type: 'select', label: 'Style', options: fontStyleOptions } ],
        inHeader: [ … ],
    },
    EditComp: Card,
    ViewComp: Card,
}
```

```jsx
// ComponentRegistry/index.jsx — imports .config files
import Card from './Card.config'
import Header from './header.config'
// …

export default {
    lexical,
    Card,
    Spreadsheet,
    'Header: Default Header': Header,
    // …
}
```

~15 files become 15 component files + 15 config files. Consumer contract preserved.

**Cases where Edit ≠ View (e.g., Card uses a single component; Header has separate `Edit` and `View` definitions):**

```jsx
// header.jsx
export function HeaderEdit({ ... }) { … }
export function HeaderView({ ... }) { … }

// header.config.js
import { HeaderEdit, HeaderView } from './header'
export default {
    name: 'Header: Default',
    type: 'Header',
    variables: [ … ],
    defaultState: { … },
    EditComp: HeaderEdit,
    ViewComp: HeaderView,
}
```

### Level 3 (external registrations)

**Keep the existing contract.** Downstream themes and apps keep passing objects to `registerComponents()` or `theme.pageComponents`. Nothing breaks.

Optionally, expose a helper to let downstream opt into the split pattern for their own HMR benefit:

```js
// packages/dms/src/index.js
export { defineComponent, registerComponents } from './patterns/page/components/sections/componentRegistry'
```

```js
// componentRegistry.js — add helper (optional)
export function defineComponent(def) {
    // identity fn today; lets us add validation / shape normalization later
    return def
}
```

Users who want HMR-clean component files can refactor:

```jsx
// themes/avail/components/Message.jsx
export function MessageEdit(props) { … }
export function MessageView(props) { … }
```

```js
// themes/avail/components/Message.config.js
import { MessageEdit, MessageView } from './Message'
import { defineComponent } from '@availabs/dms'

export default defineComponent({
    name: 'Message',
    EditComp: MessageEdit,
    ViewComp: MessageView,
    defaultState: { display: { message: 'Hello, World!' } },
    controls: { default: [ { type: 'input', key: 'message', … } ] },
})
```

```js
// themes/avail/theme.js
import Message from './components/Message.config'
import AudioPlayer from './components/AudioPlayer.config'

const availTheme = {
    pageComponents: { Message, 'Audio Player': AudioPlayer },
    // …
}
```

Migration is per-file and opt-in. Nothing is forced.

---

## Alternatives considered (and why not)

### Alt 1 — Rename files to `.js`

Stops Fast Refresh from analyzing them. Loses JSX syntax highlighting in editors that key off extensions; workable but strictly worse than the proposed split.

### Alt 2 — Single component per file, `<Comp mode="edit" />` contract change

Would require rewriting all 62 consumer call sites and breaking the public API. Rejected as a mass refactor disproportionate to the HMR benefit.

### Alt 3 — Keep object export, export components as named siblings

```jsx
export const Edit = (...) => …
export const View = (...) => …
export default { EditComp: Edit, ViewComp: View }
```

Doesn't solve the problem. Fast Refresh rejects files with *any* non-component export. The default-export object makes the file non-refreshable even if named components are present.

### Alt 4 — Mutable registry with runtime `defineComponent()` instead of file default exports

Replace all `export default { EditComp, ViewComp, ... }` with `defineComponent({ ... })` calls at module side-effect time. The function registers internally; the file need not export anything.

Problem: this is a larger architectural inversion (every consumer has to import through the registry, not via the file's own default export). Also side-effectful imports create order dependencies. Rejected.

---

## Implementation phasing

### Phase 5a — `columnTypes` (10 files, low risk)

- Rewrite `text.jsx`, `textarea.jsx`, `boolean.jsx`, `checkbox.jsx`, `radio.jsx`, `select.jsx`, `multiselect.jsx`, `array.jsx`, `dms-format.jsx`, `template.jsx` to export named components only.
- Rewrite `columnTypes/index.jsx` to assemble the dictionary from named imports. The inline `EditComp: (props) => <Text.EditComp .../>` wrappers in `index.jsx` update to reference the new named exports.
- Verify: grep for `columnTypes.foo.EditComp` consumers — shape unchanged, no call-site updates needed.

### Phase 5b — built-in `ComponentRegistry` (15 files, medium risk)

- For each: create `<Name>.config.js` with metadata + import of components; rewrite `<Name>.jsx` to export named components only.
- Update `ComponentRegistry/index.jsx` imports to pull from `.config.js` files.
- `lexical/index.jsx` follows the same treatment.
- Verify: component-type selector lists the same components; `use*` flags, `defaultState`, `controls`, `themeKey` all unchanged.

### Phase 5c — optional public `defineComponent` helper + docs update

- Add `defineComponent(def)` as an identity function exported from `@availabs/dms` (safe to add validation later).
- Update `patterns/page/component-overview.md` with guidance on the split pattern for external consumers.
- Leave existing external registrations (`themes/avail`, `themes/transportny`) untouched — they keep working; can migrate incrementally when touched.

### Phase 5d — optional migrate built-in template themes

- Apply the split to `src/themes/avail/components/*.jsx` and `src/themes/transportny/components/*.jsx` as a reference example for downstream sites.

---

## Risks & open questions

- **Two-file overhead.** ~15 Level-2 components become ~30 files. Mitigation: co-locate (same directory), consistent naming (`X.jsx` + `X.config.js`).
- **Circular references.** `controls` arrays occasionally embed inline components (e.g., `{type: ({value, setValue}) => (<ColorControls.../>), key: 'bgColor'}` in `Card.jsx`). These move with the metadata into `.config.js`. Verify no `.config.js` ends up holding JSX — if it does, rename to `.config.jsx` (still Fast-Refresh-clean because it's not on the hot path for component edits).
- **`themes/` in the template.** Whether to migrate `src/themes/avail` and `src/themes/transportny` as part of this task or leave them for a follow-up. Recommend follow-up; they're downstream of the library change and benefit from seeing the library pattern stabilize first.
- **Storybook / docs.** `docs.js` and the `docs` field in ComponentRegistry entries reference the config shape — verify no imports break after the split.
- **Registry key collisions.** Not a new concern, but worth noting: an external theme's `pageComponents` can override a built-in. The `.config.js` split doesn't change this behavior.

---

## Expected outcome

- All `.jsx` component files under `ui/columnTypes/` and `patterns/…/ComponentRegistry/` become Fast-Refresh boundaries.
- Editing a component (e.g., tweaking `<Card>` JSX) hot-replaces without losing page state.
- Editing a `.config.js` triggers a reload — acceptable, since shape/metadata changes are infrequent.
- Public API unchanged; external consumers unaffected.
- ~62 internal `.EditComp` / `.ViewComp` call sites unchanged.
