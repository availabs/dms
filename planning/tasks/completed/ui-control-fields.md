# UI controls — fields: Input / Textarea / Select / MultiSelect at 32px, ink focus

**Initiatives:** [dms_tessera_default_theme](../../../../../planning/initiatives/dms_tessera_default_theme.md) · **Status:** done · **Created by:** shaunak.sangdod@gmail.com · **Edited by:** ssangdod@albany.edu

Part of [ui-control-consistency-audit.md](./ui-control-consistency-audit.md), the hub. Owner 2026-10-14: other UI
elements must look the same before [ui-raw-html-to-ui-components.md](../current/ui-raw-html-to-ui-components.md); run in
parallel agents ("go ahead, run multiple agents to parallel work on next steps").

## Objective

Spec ui-controls.html batch 2 (owner 10/13: "we can try 32px"): Input / Textarea / MultiSelect triggers / Select → 32px fields with ink focus in the default theme; project themes frozen in `_legacy/ui.js`; className overrides → named styles, then lock.

Rules: only the default theme changes; project themes keep their look via `src/themes/_legacy/ui.js` (verify
with the HEAD-baseline pixel diff on MNY / TNY v2 / landbank); no className looks (activeStyle only); mirror
real changes into `design_system_v6/scripts/`.

## Progress

### 2026-10-14 — inventory (agent C, before changing anything)

Spec (`controls.py`): `FIELD` = h-8 px-2.5 rounded-md border rule-strong panel t-proseSM ink, placeholder
pencil, `focus:border-ink` (no ring), disabled well/pencil; `TEXTAREA` = px-2.5 py-2 same tokens;
`SELECT_T` = h-8 trigger, open = ink border; `TAG` (MultiSelect chips) = h-6 px-1.5 rounded well t-proseXS.

| Component | Theme key | Today (default theme) | Users |
|---|---|---|---|
| `UI.Input` | `input.input` (flat, `Input.theme.js`) | 42px (`px-3 py-2.5 text-sm`), cobalt focus border + ring | 53 call sites; 5 pass `className` (below) |
| `Input`'s `Textarea` export / `ConfirmInput` | `input.textarea` / `input.input` | same, cobalt | columnTypes/textarea, FieldSet (page settings pane `ConfirmInput`) |
| `UI.Textarea` (`Textarea.jsx`) | `textarea` — **not registered in `ui/defaultTheme.js`**; local Catalyst default (zinc, `sm:after:focus-within:ring-blue-500`) | renders the hardcoded Catalyst look on the default theme | datasets metadata `RenderField` |
| `UI.Select` | → `MultiSelect` single | `inputWrapper` min-h-9, cobalt focus ring | 12 |
| `UI.MultiSelect` | `multiselect.styles[0]` + named `plain` / `accent` / `addAccess` / `permissions` / `input` | min-h-9 `pl-3 py-1.5`; `focus-within` cobalt ring; `selectedValueIcon` cobalt; `singleClearWrapper` hardcoded zinc / red-600; chips rounded-full mono; `'input'` style copies the 42px Input padding + cobalt | 31 (+12 via Select); `'input'` used by datasets metadata column type |
| `UI.Label` | `label` | used only as a **section tag chip** (`section_components.jsx`, mnyHeader), not a field label | 3 — out of scope here (a tag/pill, agent D's area) |

Input `className` overrides (each replaces the whole theme class): `editSite.jsx:551` / `:923` and
`themes/list.jsx:105` (`searchInput` — a bare input inside a styled search box), `authGroups.jsx:80`
(`headerInput`, compact header filter), `authUsers.jsx:29` (passes its caller's `className`, same header
filter). All admin / auth → always the default theme.

Theme shapes in project themes: `input` is a `styles[]` map in MNY / landbank / avail_site v1–v10, and a FLAT
object in TNY v2 / fusion / tessera / tessera_v6 / wcdb. The library `input` is flat, and `ConfirmInput`, the
`Textarea` export and `FieldSet` read `theme.input` flat. Converting the library to `styles[]` (needed for
named Input styles) would hide every flat theme's keys unless `withLegacyUi` normalises them.

Plan (this session): restyle the library defaults to the spec, freeze the old values in `_legacy/ui.js`
(`input` flat keys; `textarea` whole; `multiselect` styles[0] keys + the `'input'` style whole), register
`textarea` in `ui/defaultTheme.js`. **Input lock (className → activeStyle) = listed only** — needs the shape
decision above (open question 1).

### 2026-10-14 — done (agent C, uncommitted, library `design-wip`)

- `Input.theme.js`: `input` → spec FIELD (`h-8 px-2.5 t-proseSM`, `focus:border-ink`, no ring, disabled well /
  pencil, aria-invalid brick); `textarea` → same tokens, `px-2.5 py-2`.
- `Textarea.theme.js` (new) + `Textarea.jsx`: UI.Textarea's theme moved out of the component and **registered as
  `textarea` in `ui/defaultTheme.js`** (it had never been registered, so the default theme rendered a hardcoded
  Catalyst zinc / blue-ring look). v6 = same as the Input textarea.
- `MultiSelect.theme.js` styles[0]: trigger `min-h-8 pl-2.5 py-1` (h-6 tags + py-1 = 32px), `t-proseSM`,
  `focus-within:border-ink` (no ring); chips → spec TAG (`h-6 px-1.5 rounded bg-well t-proseXS`); check icon
  ink; single-select text t-proseSM; clear × pencil → brick (was hardcoded zinc / red-600); menu rows
  t-proseSM. `'input'` style = the same 32px trigger (kept as a name; Select-beside-input now matches by default).
  `'accent'` (cobalt auth group chips) untouched — open in the hub.
- `_legacy/ui.js`: new `input` (flat), `textarea` (whole Catalyst object) and `multiselect` (styles[0] changed
  keys + `'input'` style whole) freezes, values taken verbatim from HEAD.
- `metadataComp.theme.js` (datasets, Edit only): `advancedToggle(Open)` `px-2.5 py-2.5` → `size-8` (it was sized
  to match the 42px fields); `_legacy/datasets.js` already freezes it for project themes.
- Verified: default theme fields measured 32px on admin overview / user menu, datasets metadata / settings /
  create, auth add-user modal; MultiSelect triggers 32px; focus border = ink (light rgb(24,26,31), dark
  rgb(237,237,231)), no box-shadow. MNY / TNY v2 / landbank pixel-identical to HEAD on page edit drawer
  (settings), datasets metadata, settings, create. Build OK; eslint = HEAD on all touched files.
- Mockups: nothing to mirror — live now matches FIELD / TAG / ICON_TOOL as already drawn.

## Open questions

1. **Input lock (className → activeStyle) — done 2026-10-14, see below.** 5 `className` overrides (editSite ×2 /
   themes list `searchInput`: a bare input inside a styled search box; authGroups / authUsers header filter
   `headerInput`). Named Input styles need the library `input` theme in `styles[]` shape, but TNY v2 / fusion /
   tessera / wcdb register a FLAT `input`, and `ConfirmInput`, Input's `Textarea` export and `FieldSet` read
   `theme.input` flat. Options: (a) convert the library to `styles[]` and have `withLegacyUi` wrap a flat theme
   `input` into `styles[0]`, and switch the three flat readers to `getComponentTheme`; (b) keep flat and let Input
   pick named looks from a `styles` sub-array only when present. Recommend (a). Same applies to `textarea`.
2. `UI.Label` is only used as a section **tag chip** (`section_components.jsx`, mnyHeader) — it's a pill/tag,
   not a field label; left for the pills work.
3. Page edit drawer's own inputs (settings pane title 27px, textarea 61px) are page-pattern theme keys
   (`editPanes`), not UI.Input — not changed here.
4. The admin site-list / themes search boxes and the auth header filters keep their own `className` looks
   (20px bare input inside a 32px box; 26px header filter) until the lock lands.

### 2026-10-14 — owner decision on open question 1

Owner: "agent c should go ahead" — do the Input / Textarea lock as recommended (a): library `input` and
`textarea` → `styles[]` with named styles; `withLegacyUi` wraps a theme's flat `input` / `textarea` into
`styles[0]` (TNY v2, fusion, tessera, wcdb); ConfirmInput / Input's Textarea export / FieldSet read via
`getComponentTheme`; the 5 className usages → named styles reproducing their current default-theme look; then
lock Input.jsx / Textarea.jsx (look = theme only).

### 2026-10-14 — Input / Textarea locked (agent C, uncommitted)

- **Shape:** library `input` (`Input.theme.js`) and `textarea` (`Textarea.theme.js`) are `{options, styles[]}`.
  `input` styles: `default` (the v6 field), `inline` (empty — ConfirmInput + the textarea column type's editor),
  `bare` (= the old `searchInput` className, exact string), `headerFilter` (= the old auth `headerInput`, exact).
- **Locked:** `Input.jsx` (Input, its `Textarea` export, `ConfirmInput`) and `Textarea.jsx` read
  `{...styles[0], ...getComponentTheme(theme, key, activeStyle)}`; a `className` prop is destructured and dropped.
  ConfirmInput defaults to `activeStyle='inline'`; TextareaEdit passes `fieldStyle || 'inline'`.
- **`withLegacyUi`:** `FLAT_TO_STYLES` wraps a theme's flat `input` / `textarea` into styles[0] (TNY v2, fusion,
  tessera, tessera_v6, wcdb have a flat `input`); a flat `input` also becomes the theme's `inline` style.
  `_legacy/ui.js` `input` = styles [default (pre-v6 42px / cobalt), inline (the library's full pre-lock flat
  object — what ConfirmInput / Textarea export read on a styles[]-shaped theme), bare, headerFilter (empty → the
  theme's own default)]; `textarea` = styles [default (the old Catalyst look)].
- **Callers swapped:** editSite site + tenant search, themes list search → `activeStyle='bare'`; auth Groups /
  Users header filters → `activeStyle='headerFilter'`. Dead keys removed: `searchInput` (editSite.theme.js,
  themes/list.theme.js), `headerInput` (auth defaultTheme.js, authGroups MANAGE_DEFAULTS). wcdb's
  `auth.theme.js` `headerInput` is left (dead already: manage pages render via getAdminTheme = library default).
- **Found a second className channel:** a dataCard style's `editField` was forwarded to Input / Textarea as
  `className` (QA's `qa_body` / `qa_rail` / `qa_form`). Now: dataCard styles name a field style with
  `editFieldStyle` (Card.jsx passes `fieldStyle`; text.jsx / textarea.jsx pass it as `activeStyle`); QA registers
  `qa_edit_field` / `qa_form_field` input styles via `QA_STYLES.input`. `editField` stays as Card's own frame
  class on its wrapper. `withQaTheme`'s components pass now starts from `out[key]` (only `input` is in both
  QA lists) so the added styles survive; `qa.theme.js` reads `inputTheme.styles[0].inputContainer`.
- **Verified:** class-resolution check (Vite SSR, real withLegacyUi + mergeTheme) on all 21 registered project
  themes — Input default, ConfirmInput / Textarea-export (`inline`) and UI.Textarea resolve exactly as HEAD's
  code did; QA edit / form fields on default, MNY, TNY v2, wcdb resolve to the old EDIT_FIELD / FORM_FIELD
  strings. The 5 swapped inputs live: class string, container, size, font identical to :5198. Default fields
  still 32px / ink focus. MNY / TNY / landbank page-edit drawer + datasets metadata / settings / create
  pixel-identical to HEAD. Build OK; eslint = HEAD except the new deliberate `className` / `_activeStyle`
  absorb destructures (no-unused-vars, same pattern as the files' existing `label` / `rounded`).
- **Risk noted:** a theme saved in the DB through the admin theme editor (not a registered code theme) with a
  flat `input` doesn't go through withLegacyUi; its flat keys would be ignored. None seen locally; can't check prod.

### 2026-10-15 — closed

All done and committed (library `ffc7566f`). Open question 1 answered and implemented (Input / Textarea
locked); 2 (UI.Label as a tag chip) and 3 (page drawer inputs) moved to
[ui-raw-html-to-ui-components.md](../current/ui-raw-html-to-ui-components.md); 4 resolved by the lock (`bare` /
`headerFilter` styles).
