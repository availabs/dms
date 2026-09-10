# MapEditor: Layers panel "..." menu button not opening (layer delete unreachable)

## Objective

User report: in the MapEditor's Layers panel, clicking the "..." (three-dot) button next to a
layer row does nothing — no dropdown opens, so the "Remove" action (and "zoom-to-fit"/"duplicate")
can never be reached. Reported as "layer is not deleting from the symbology," but the delete logic
itself was never actually exercised — the menu that exposes it never opened.

## Root cause

`MenuDots` (`packages/dms/src/patterns/mapeditor/MapEditor/components/icons.jsx:15-19`) is a plain
functional component that only destructures `className` and renders a bare `<svg>` — it never
spreads `{...props}` and can't accept a `ref` (no `React.forwardRef`):

```jsx
export const MenuDots = ({className='fill-slate-800'}) => (
  <svg width="20" height="20" viewBox="0 0 24 24" className={className}>
    <path .../>
  </svg>
)
```

`Popup.jsx` (`packages/dms/src/ui/components/Popup.jsx:161-171`) opens its dropdown via
`React.cloneElement(button, { ref: buttonRef, onClick: (e) => { button.props.onClick?.(e); toggle(); } })`
— it injects `onClick`/`ref` as props onto whatever element it's given. `NavigableMenu` passes its
`children` straight through as that `button` (`ui/components/navigableMenu/index.jsx:300-308`).

`LayerPanel.jsx`'s `LayerMenu` (used by every "..." trigger in the Layers panel, `LayerRow` at
line 103-106) passed the raw `<MenuDots .../>` element as `NavigableMenu`'s `children`, with
nothing to receive the injected `onClick`. Since `MenuDots` ignores props it doesn't destructure,
the injected `onClick` was silently dropped — the rendered `<svg>` DOM node had no `onclick`
handler at all, so clicking it never called `toggle()` and the popup never opened.

`LayerInfo` in the same file (line 47-59) does NOT have this bug — it wraps its `MenuDots` (or
similar) button in `<Button type="plain" className="p-0">{button}</Button>` before handing it to
`Popup`, so the injected `onClick`/`ref` land on `Button`'s own element, which does forward them.

### Where this regressed

- `0fe8bdd4` "menu restructure" (headlessUI → NavigableMenu)
- `ba1ea949` "Fix for map editor layer menus not opening" — fixed `LayerInfo`'s button (wrapped in
  `<Button>`) but did not apply the same fix to `LayerMenu`'s `MenuDots` button, leaving this
  exact bug in the three-dot menu specifically.

### The delete logic itself was already correct

Once the popup opens, `Remove`'s handler is a valid Immer mutation on the single source-of-truth
`state.symbology`:

```jsx
// LayerPanel.jsx, LayerMenu's config
{
  name: <span className='text-red-400'>Remove</span>,
  onClick: () => {
    setState(draft => {
      delete draft.symbology.layers[layer.id]
      Object.values(draft.symbology.layers)
        .sort((a, b) => a.order - b.order)
        .forEach((l, i) => l.order = i)
    })
  }
}
```

`setState` is `MapEditor/index.jsx`'s `useImmer` setter; this was never the bug — users simply
couldn't reach it.

## Fix

`packages/dms/src/patterns/mapeditor/MapEditor/components/LayerManager/LayerPanel.jsx` — `LayerMenu`
now wraps its `button` prop in `<Button type="plain" className="p-0">`, matching `LayerInfo`'s
already-working pattern:

```jsx
export function LayerMenu({layer, button}) {
  const { state, setState  } = React.useContext(SymbologyContext);
  const { UI } = React.useContext(ThemeContext) || {};
  const { NavigableMenu, Button } = UI || {};

  return (
    <NavigableMenu showTitle={false} config={[...]}>
      <Button type="plain" className="p-0">{button}</Button>
    </NavigableMenu>
  )
}
```

This is the ONLY change. `LayerMenu` is shared by every "..." trigger in the mapeditor pattern, so
this one fix also covers:
- `LayerManager/LegendPanel.jsx:531-534` (legend panel's own layer row menu)
- `LayerEditor/index.jsx:49-53` (layer editor's menu)

Verified via `npx eslint` on the touched file — no new errors, only pre-existing
`react/prop-types`/`no-unused-vars` style-convention findings already present before this change.

## Known related, NOT fixed (out of scope)

`patterns/page/components/sections/components/ComponentRegistry/map_dama/MapManager/MapManager.jsx`
has its own separate `SymbologyMenu` component (line 68) with the same `button={<MenuDots .../>}`
call shape (line 405-406) and may have the identical bug independently — **not investigated or
touched**, per the standing project rule that `map_dama` is a separate copy from `map`/`mapeditor`
and fixes there must be applied (or explicitly declined) separately, never silently carried over.

## Testing checklist

- [ ] Live: open a MapEditor page, click the "..." next to a layer row in the Layers panel —
      dropdown should open showing zoom-to-fit / duplicate / Remove.
- [ ] Click Remove — layer should disappear from both the list and the map, `order` should
      re-sequence for the remaining layers.
- [ ] Same check in the Legend panel's own layer row menu and in the Layer Editor's menu (both
      reuse `LayerMenu`).
