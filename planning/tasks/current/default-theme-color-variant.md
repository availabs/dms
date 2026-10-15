# A second default theme with more colour

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** blocked:decision · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** shaunak.sangdod@gmail.com

**Deferred (owner 2026-10-14: "#7 is not for now").** Not started. It waits until the UI control work in
[ui-control-consistency-audit.md](../completed/ui-control-consistency-audit.md) is done (owner, 2026-10-13:
"once this is done, we can work on another default theme that has more colors in it. that can be a
separate task file").

## Objective

The library default (tessera v6) is deliberately quiet. It is ink-first, with no accent on controls
(primary = ink; ink marks the active chip, segment, tab and selected card), and cobalt stays only for
links, activity and the logo. Build a **second built-in default theme** that keeps the same
structure, the same shared control styles and the same rules, but carries more colour.

## Open questions (answer before any mockup)

1. **What gets colour?** For example:
   - the primary action;
   - the "chosen" state (active chip / segment / tab, the switch, the selected card);
   - nav active rows;
   - page and section header bands;
   - category and type pills;
   - charts;
   - empty-state and callout illustrations.
2. **Palette:**
   - one accent or several?
   - start from the logo's cobalt, or a new hue set?
   - status colours (go / amber / brick) stay as they are?
3. **How a site picks it:** a named theme in the theme picker next to the quiet default, or a mode
   of the same theme (e.g. `colorful: true`)?
4. **Dark mode:** the same token structure, so the colourful variant works in both themes.
5. **Scope:** all patterns (page, datasets, admin, auth), or site-facing pages only, with admin
   staying quiet?

## Approach (same process as the v6 port)

- **Tokens, not copies.** The control looks live in one place (`design_system_v6/scripts/controls.py`
  for the mockups, then the `UI.*` named styles and `_legacy/ui.js` in the library). A colourful
  variant should mostly be a token / named-style override, not a fork of every `.theme.js`. If it
  can't be, that's a sign the shared styles need another token.
- **Mockup-first, confirm before implementing.** Start with a variant of
  `design_system_v6/pages/ui-controls.html` plus 2–3 representative pages (catalog, source
  overview, page view). Owner reviews before any library edit.
- **Other themes don't change** (owner, 2026-10-13). Project themes keep their frozen `_legacy`
  values; the quiet default stays as approved.

## Files likely to change

- `src/themes/tessera/design_system_v6/scripts/controls.py` (variant tokens) + a variant spec page
- the library default theme registration (`packages/dms/src/ui/defaultTheme.js` and the pattern
  `defaultTheme.js` files): how a second built-in theme is offered
- `src/themes/index.js` (if it's registered like a project theme)

## Testing checklist

- [ ] Open questions answered by the owner
- [ ] Variant mockups reviewed (light + dark, 1440 + 390)
- [ ] Library: variant renders; the quiet default unchanged; MNY / TNY / landbank unchanged
      (HEAD-baseline pixel diff)
- [ ] `npm run build` clean; eslint on touched files vs HEAD
