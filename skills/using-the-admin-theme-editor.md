# Using (and extending) the admin theme editor

DMS ships an **in-product theme editor**: a generated control list on the left, a live component
preview on the right, and a Save that writes the theme back to the database. It is the fastest way to
tune a theme token — change a value, see it immediately, no rebuild and no page reload.

It is also almost entirely undiscovered, because nothing documented where it lives or how the two
panes get their content. This is that.

## 1. Open it

```
<adminPath>/theme/<theme_id>/<component?>
```

For the npmrdsv5 dev site that is:

```
http://www.localhost:5173/list/theme/47f862e5-3e7b-4dff-a80a-28e57c127359/graph
```

- **`<adminPath>`** is `VITE_DMS_BASE_URL` (`.env`), passed to `DmsSite` as `adminPath` in
  `src/App.jsx`. It is `/list` here, not `/admin`.
- **`<theme_id>` is NOT the theme row's `id`.** It is the `theme_id` *field stored inside* the theme
  row. A theme row (`type = '{name}:theme'`) has exactly three fields — `name`, `theme` (the whole
  theme as a JSON string) and `theme_id`. For themes created through the UI, `theme_id` is
  `nameToSlug(name)` (`list.jsx`); older ones carry a UUID. The npmrdsv5 theme row is `id = 1677773`
  with `theme_id = 47f862e5-…`, and **only the UUID works in the URL.**
- **`<component?>`** is optional, and is a lowercased value from `compOptions` in
  `patterns/admin/pages/themes/editTheme.jsx` (`graph`, `button`, `card`, `topnav`, …). It selects
  what the *preview* renders, independently of which setting group the left pane shows.

**Don't derive the URL — get it from `/list/themes`.** That page maps each of the site's
`theme_refs` to `${baseUrl}/theme/${v.theme_id}` (`list.jsx:58-59`) and links it correctly. Deriving
it from the row id is the one mistake that costs real time.

Access is gated: you need to be an `{app} Admin` or pass `isUserAuthed` (`editTheme.jsx`), otherwise
you get "You do not have permission to manage themes."

## 2. What the two panes are

| Pane | Comes from | Add to it by |
|---|---|---|
| Left — setting groups + controls | `ui/themeSettings.js`, which calls each component's `*Settings(theme)` export | editing that component's `*.theme.{js,jsx}` |
| Right — live preview | `ui/docs.js`, keyed by the `compOptions` value | adding a `Foo.docs.js` and registering it |

The setting-group dropdown lists the **keys of `themeSettings`** (`layout`, `sidenav`, `button`,
`avlGraph`, …). The preview dropdown lists `compOptions`. They are separate lists — you can be
editing `avlGraph` tokens while previewing `Button`, which is usually not what you want.

Save writes the **entire** theme back as one JSON string on the theme row (242KB for NYSDOT), via
`apiUpdate` on the site's `theme_refs`. Reset re-merges `defaultTheme` with the stored theme.

## 3. Recipe — expose a component's tokens for editing

A `*Settings(theme)` export returns an array of groups; each group has a `label` and `controls`, and
each control has a `label`, a `type`, and a **`path`** which is a lodash path into the *whole theme*.

The cheapest useful pattern is to generate one control per token on the active style, so new tokens
appear automatically. `SideNav.theme.jsx:126-133` is the original; `graph_new/theme.js` is a fuller
example with the filters you actually need:

```js
export const avlGraphSettings = theme => {
    const activeStyle = theme?.avlGraph?.options?.activeStyle || 0;
    const style = theme?.avlGraph?.styles?.[activeStyle] || {};
    return [
        { label: "Graph Styles", type: 'inline', controls: [ /* the style picker */ ] },
        { label: "Graph Tokens",
            type: 'inline',
            controls: Object.keys(style)
                .filter(k => k !== "name" && typeof style[k] === "string")
                .map(k => ({
                    label: k,
                    type: 'Textarea',
                    path: `avlGraph.styles[${ activeStyle }].${ k }`
                }))
        }
    ];
}
```

Control types in use across the theme files: `Textarea`, `Input`, `MultiSelect` (with `options`,
`singleSelectOnly`, `searchable`), `Button` (with an `onClick(e, setState)` for things like "Add
Style"), `List`, and `inline` as a group `type`. `ControlRenderer` reads `get(state, d.path)` and
writes `set(draft, d.path, e?.target?.value ?? e)` — so it accepts a DOM event (Input/Textarea) or a
bare value (MultiSelect).

**Three filters that are not optional:**

- **Only bind a `Textarea` to a string.** It writes back a string, so binding one to a nested object
  (`chartDefaults`) renders `[object Object]` and *saves that over the object*. Same for numbers and
  booleans.
- **Never expose a style's `name`.** Styles are selected by name in places — a section's
  `activeStyle` can be a string (`'reportInlineTitle'`), and `getComponentTheme` resolves a name
  before falling back to `styles[0]` — so renaming a style here silently detaches every section
  pointing at it.
- **Remember `styles[0]` is the inheritance base.** `getComponentTheme` fills a non-default style's
  missing keys from `styles[0]`, so editing style 0 changes every style that doesn't override that
  key.

## 4. Recipe — give a component a live preview

Add a `Foo.docs.js` next to the component and register it in `ui/docs.js` under the `compOptions`
value. The simplest shape (see `Icon.docs.jsx`) is an **array of prop objects**; `editTheme` resolves

```
componentDocs[comp][idx].props || componentDocs[comp][idx] || componentDocs[comp].props || componentDocs[comp]
```

so each array entry *is* the prop bag. A `doc_name` field labels the entry in the second dropdown.
`graph_new/Graph.docs.js` is the worked example — two fixtures covering the two legend kinds a graph
theme actually styles (a swatch legend and a colour ramp), with **static** `state.data`, since the
graph section reads rows off `state.data` and fetches nothing itself. No source, no dmsEnv, no
network.

**Gotchas:**

- **A component listed in `compOptions` with no `ui/docs.js` entry previews blank** — it falls back to
  `UI[component]` with no props. `Graph` sat like that until 2026-09-10.
- **`componentDocs` is lazy-loaded**, so the preview frame's first render has `undefined` props.
  Simple components shrug that off; a **section** component does not. `Graph` threw
  `Cannot destructure property 'pageState' of 'pageContext'` and, with no error boundary in that
  frame, took the *whole editor* down. Fixed by gating the renderer on the docs having loaded
  (`editTheme.jsx`) — but if you add a fixture for another section component, that gate is what keeps
  it safe, so don't remove it.
- A section component's prop bag needs `pageContext` at minimum:
  `{ pageState: { filters: [] }, setActionParam(){}, clearActionParam(){} }`, plus `state`,
  `setState`, and usually `isEdit: false`.

## 5. Verifying headlessly

The preview is `react-frame-component`, so it is a **same-origin `about:srcdoc` iframe** with the
Tailwind browser CDN loaded inside it. That means arbitrary Tailwind classes work in the preview, and
you can reach into the frame from Playwright:

```js
// via report_probe.mjs --eval (scripts/npmrds-reports/report_probe.mjs)
export default async (page) => {
  const out = [];
  for (const f of page.frames()) {
    out.push(await f.evaluate(() => ({
      url: location.href.slice(0, 40),
      avlGraph: document.querySelectorAll('svg.avl-graph').length,
      swatches: document.querySelectorAll('div.w-4.h-4.rounded').length,
    })).catch(() => null));
  }
  return out;
};
```

A working graph preview reports `avlGraph: 1` in the `about:srcdoc` frame. The parent frame reports
`avlGraph: 0` — the chart is only ever inside the iframe, so a probe that forgets to walk
`page.frames()` will report a false negative.

## 6. Known rough edges

- `ControlRenderer`'s `.map` in `editTheme.jsx` has no `key`, so the editor logs a React key warning
  on every render. Cosmetic.
- There is no error boundary around the preview, so a fixture that throws still blanks the editor.
- The setting-group dropdown defaults to `'layout'`, not to whatever component the URL selected.

## Related

- [`translating-design-system-to-dms-theme.md`](./translating-design-system-to-dms-theme.md) — writing
  the theme in the first place; the `options`/`styles` conventions this editor reads.
- [`designing-a-dms-design-system.md`](./designing-a-dms-design-system.md) — where the token values
  come from.
- `src/dms/packages/dms/CLAUDE.md` — the `*.theme.{js,jsx}` / `*.config.{js,jsx}` split and the
  Fast-Refresh rules a new `*.docs.js` has to respect (non-component exports go in `.js`).
