# Section-level view gate checked a permission no pattern can grant (`view` vs `view-page`)

**Status: DONE (2026-09-16).** Topic: `patterns/page`

## Objective

Make a section's `authPermissions` view gate honour the permissions a pattern actually grants,
so `{groups:{public:[]}}` means what its own code comment says it means — "signed-in only" —
instead of "holders of `*` only".

## Symptom as reported

On the MitigateNY county Actions Dashboard (`/actions/dashboard`), the buttons at the top of
the page are meant to appear only for signed-in users. That much worked. But they appeared for
a user in the **AVAIL** group and not for a user in the **DHSES** group, and the reporter could
find no permissions settings on either section through the section Settings menu.

## Root cause

Two independent defects that compound.

### 1. The gate checks a permission string that isn't in any authorable vocabulary

`components/sections/section.jsx`'s section VIEW gate was:

```js
if (sectionHasAuth && !editPageMode && !isUserAuthed(['view'], sectionAuthPermissions)) return null;
```

A section's `authPermissions` is an **override merged onto the PATTERN's**
(`patterns/page/siteConfig.jsx`'s `CMSContext.isUserAuthed`: `[]` disables an inherited grant,
a non-empty array replaces it — the same contract `utils/auth.js`'s `mergeAuthPermissions`
documents). Pattern- and page-level permissions are written in the **page vocabulary** —
`view-page`, `edit-page`, `create-page`, `edit-page-permissions`, `publish-page`
(`page.format.js`'s page-level `permissionDomain`). **`view` is not in that list.**

So `isUserAuthed(['view'], …)` could only ever be satisfied by a `*` grant. Not by any concrete
permission an author can assign at pattern or page level.

### 2. The section-level permission domain had no `view` either

`page.format.js`'s **component** (section) `authPermissions.permissionDomain` offered only:

```js
[ {label: '*', value: '*'}, {label: 'Edit Section', value: 'edit'} ]
```

So even at the section level, an author could not grant the permission the view gate checks.
The only assignable value that satisfies it is the blanket `*` — which also hands over edit.

### The live data that produced the report

Pattern `2265530` (`MitigateNY_actions`), subdomain `*`:

```json
{"users":{"656":["*"]},
 "groups":{"public":["view-page"], "AVAIL":["*"], "DHSES":["view-page"]}}
```

The two button sections, `2416190` and `2416191` (both 1/6-width, sitting beside the 2/3-width
header section `2416189`), each carry:

```json
{"groups":{"public":[]}}
```

Merging the override onto the pattern deletes `public` and leaves
`{AVAIL:['*'], DHSES:['view-page'], users:{656:['*']}}`. Evaluated against `['view']`:

| identity | effective permissions | `'*'`? | in `['view']`? | result |
|---|---|---|---|---|
| logged out (public) | `[]` (grant deleted) | – | – | HIDDEN ✅ intended |
| AVAIL | `['*']` | yes | – | SHOWN ✅ |
| DHSES | `['view-page']` | no | **no** | **HIDDEN ❌ the bug** |
| user 656 | `['*']` | yes | – | SHOWN |

So the gate was never "signed-in only" — it was "`*` only". It looked correct purely because the
reporter's own group holds `*`.

Reproduced without DHSES credentials by driving the real `isUserAuthed` with the real pattern
and section rows pulled from the server via the CLI (all four rows above are simulation output,
not inference).

### Why no permissions settings were visible in the section menu

Separate, and mostly a red herring for the bug itself: the section Settings menu's
**Permissions** item is nested under **Layout**, and is gated by
`sectionMenu.jsx:1525` — `cdn: () => canEditSectionPermissions && canEditSection`. Both resolve
true for a `*` holder, so the item should be present for an AVAIL user; it is simply not where
one would look first. The section permissions on these two sections were set at some earlier
point and are stored on the rows (verified via `dms raw get`), whatever the menu showed.

## Fix

**`patterns/page/components/sections/section.jsx`** — the view gate accepts the page-view
permission alongside the section-view one:

```js
if (sectionHasAuth && !editPageMode && !isUserAuthed(['view', 'view-page'], sectionAuthPermissions)) return null;
```

**`patterns/page/page.format.js`** — the component-level `permissionDomain` now offers `view`
(listed first, so "let this group see the section" is the obvious choice rather than `*`):

```js
permissionDomain: [
    {label: 'View Section', value: 'view'},
    {label: 'Edit Section', value: 'edit'},
    {label: '*',            value: '*'},
],
```

### Why this is a fix and not a widening

The gate's own comment already documents the intent — `{groups:{public:[]}}` = signed-in only.
The code did not implement that. Accepting `view-page` makes an inherited *page-view* grant
carry to a section unless the section explicitly disables it, which is exactly the documented
merge contract (`[]` disables). Both escape hatches still work, verified by simulation:

- **exclude one inherited group** — `{groups:{public:[], DHSES:[]}}` → logged out HIDDEN,
  AVAIL SHOWN, DHSES HIDDEN.
- **restrict to one group** — `{groups:{public:[], AVAIL:[], DHSES:['view']}}` → only DHSES
  (and a user holding `*` through another grant) SHOWN. This shape is only *expressible* now
  that `view` is in the section permission domain.

## Testing checklist

- [x] **Simulation against live data** (real `isUserAuthed` + real pattern/section rows): post-fix,
      logged out HIDDEN, AVAIL SHOWN, DHSES SHOWN, user 656 SHOWN.
- [x] **Exclusion escape hatch** (`{GROUP: []}`) still hides an inherited group.
- [x] **Single-group restriction** now expressible and correct.
- [x] **Logged-out regression check, live** (`cayuga.localhost/actions/dashboard`): sections
      `2416190`/`2416191` still render as empty wrappers (`innerHTML` = `<div class=""></div>`,
      no text) while the ungated neighbours render fully; body length 3503 unchanged; no page
      errors.
- [ ] **Live check as a real DHSES user** — not possible from here (no DHSES credentials for
      `mitigat-ny-prod`). The simulation covers the gate logic with the real data, but a human
      should confirm once with an actual DHSES login.

## Related defects found, deliberately NOT changed

- **The edit-side twin.** `section.jsx:251`, `section.jsx:529` and `sectionMenu.jsx:73` all check
  `isUserAuthed(['edit', 'edit-section'], sectionAuthPermissions)` and have the identical
  vocabulary problem: a group granted `edit-page` at pattern level cannot edit any section that
  carries `authPermissions` unless it also holds `*` or a section-level `edit`. Not touched here
  because widening *edit* rights across every DMS site is a bigger decision than fixing the
  reported view bug, and nothing in this report depended on it.
- **`edit-section` is dead vocabulary.** It appears in those three checks and in no
  `permissionDomain` anywhere, so nothing can ever grant it.
- **A hidden section still leaves an empty grid cell.** `SectionView` returns `null` inside the
  wrapper `sectionArray` already rendered, so a gated-out section occupies an empty slot rather
  than collapsing. Pre-existing and cosmetic; unchanged by this fix.

## Data-only alternative (if the library change is unwanted)

Reverting both hunks and instead granting the pattern's DHSES group `view` alongside
`view-page` — `"DHSES":["view-page","view"]` on pattern `2265530` — fixes this one site without
touching library semantics. It does not fix the next pattern, and the section Permissions UI
still could not express it.

## Files changed

- `packages/dms/src/patterns/page/components/sections/section.jsx` (view gate)
- `packages/dms/src/patterns/page/page.format.js` (component `permissionDomain`)
