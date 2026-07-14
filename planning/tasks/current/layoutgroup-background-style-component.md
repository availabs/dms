# LayoutGroup: optional `Background` component on a layoutGroup style

## Objective

Let a theme's `layoutGroup.styles[]` entry carry an optional React component under the
`Background` key, rendered inside `wrapper1` (before `wrapper2`), so a site theme can put a
live rendered backdrop — canvas animation, generated texture, media — behind a whole section
group without any custom section or page component. First consumer: the TransportNY landing
"hero_atlas" band, a three.js animation of NY's OSM road network behind the hero copy and
product panels.

## Why this is the right primitive

- `LayoutGroup` already reads decorative chrome from the style (`decorations: [classString]`
  rendered as spans). `Background` is the same idea one step up: a *component* instead of a
  class string, for backdrops that need their own lifecycle (WebGL context, resize observer).
- Authors opt in purely by choosing the group theme in the page editor — no library or page
  changes per use; the component lives in the site theme (author-empowerment: theme-level,
  not page-level custom code).

## Design

`ui/components/LayoutGroup.jsx`:

```jsx
const Background = layoutGrouptheme?.Background
...
<div className={wrapper1}>
  {outerChildren}
  {Background ? <Background /> : null}
  {decorations...}
  <div className={wrapper2}>...</div>
</div>
```

- The style's `wrapper1` is responsible for `relative`/`overflow-hidden`; the Background
  component positions itself (`absolute inset-0`) and marks itself `aria-hidden`.
- Stacking: content wrappers stay in flow after the absolute background → content paints
  above; styles can add `relative` to wrapper2 if they need an explicit stacking context.

## Backwards compatibility

- Purely additive: styles without a `Background` key render byte-identically (the key is
  `undefined`, branch skipped).
- Theme settings/editor: `Background` is a component value on a style object — same class of
  non-string style key as `decorations`; the theme editor doesn't round-trip site themes
  defined in code, so no serialization concern for code-defined themes.

## Files

- [x] `packages/dms/src/ui/components/LayoutGroup.jsx` — render `layoutGrouptheme?.Background`
- [x] `packages/dms/src/ui/components/LayoutGroup.theme.jsx` — document the key in a comment

## Testing

- [x] Landing page (transportny themev2 `hero_atlas` style with Background) renders the
      canvas behind hero content; pulses animate (2-frame pixel diff > 0).
- [x] Groups on unchanged styles (content/content_tint/hero/hero_dark) render as before
      (gallery + about pages eyeballed via screenshot).
