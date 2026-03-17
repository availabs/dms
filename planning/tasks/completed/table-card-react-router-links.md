# Table & Card: Use React Router Links for Internal Navigation — DONE

## Objective

Replace `<a href>` tags with React Router `<Link to>` for internal navigation links in the Table (Spreadsheet) and Card components. Currently all links — internal and external — render as plain `<a>` tags, causing full page reloads on internal navigation instead of client-side transitions.

## Background

Both TableCell and Card have configurable link rendering. Column attributes can set:
- `isLink` — render the cell/field as a link
- `isLinkExternal` — open in new tab
- `linkText` — custom display text
- `location` — base URL (if omitted, uses the cell value)
- `searchParams` — append query params (`none`, `id`, `value`, `rawValue`)

The existing code already had a TODO acknowledging the issue:
```javascript
// TableCell.jsx line 60
// todo make this conditional for isLinkExternal, and render Link if not.
```

## Changes Applied

### TableCell.jsx

- [x] Added `import {Link} from "react-router"`
- [x] Replaced single `<a>` return with `isLinkExternal` conditional:
  - External: `<a href={url} target="_blank" rel="noopener noreferrer">`
  - Internal: `<Link to={url}>`
- [x] Removed old TODO comment (resolved)

### Card.jsx

- [x] Added `import {Link} from "react-router"`
- [x] Split the `<a>` wrapper into `isLinkExternal` conditional:
  - External: `<a href={url} target="_blank" rel="noopener noreferrer">`
  - Internal: `<Link to={url}>`
- [x] Also added `rel="noopener noreferrer"` to external links (security best practice)

## Testing Checklist

- [ ] Table internal link navigates without page reload
- [ ] Table external link opens in new tab
- [ ] Card internal link navigates without page reload
- [ ] Card external link opens in new tab
- [ ] Links with `searchParams` (id, value, rawValue) produce correct URLs
- [ ] Links without explicit `location` (using cell value as URL) work correctly
- [ ] No regressions in edit mode link configuration UI
