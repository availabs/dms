# Pasting a section carries the source page's `parent`

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** done · **Created by:** amuro@albany.edu · **Edited by:** —

**Closed 2026-10-29** — obsolete twice over. `data.parent` was retired entirely ([row-auth-parentage.md](../current/row-auth-parentage.md), Remaining 3), so there is no stale pointer left to carry; and `handlePaste`'s exclusion list now names `parent` anyway, alongside `trackingId`, `draft_id` and `is_draft` — the `trackingId` leak this file did not spot was the live defect on that path. See [copy-paste-duplicate-section-identity.md](./copy-paste-duplicate-section-identity.md).

Found 2026-10-28 while retiring `mitigat-ny-prod`'s duplicate `admin` pattern
([retire-duplicate-admin-pattern.md](../../../../planning/mitigateny/tasks/current/retire-duplicate-admin-pattern.md)).
**Not implemented — raised for a later session.**

## The bug

`patterns/page/components/sections/section_utils.js` `handlePaste` copies every field from the
clipboard except `id` and `ref`:

```js
Object.keys(copiedValue)
    .filter(key => !['id', 'ref'].includes(key))      // ← `parent` is not excluded
    .map(key => { pastedValue[key] = copiedValue[key] })

onChange({ ...value, ...pastedValue });
```

A section's data carries `parent` — a `{id, ref}` naming the page it belongs to. Because `parent` is
not filtered out, it is spread over the new section's own value, so **the pasted section claims the
page it was copied FROM**.

Called from `sectionMenu.jsx:413` (the section menu's Paste).

## What it does to the data

Measured on `mitigat-ny-prod`'s `admin` pattern before it was retired — 2,252 components:

| | |
|---|---|
| `parent` agrees with the page that lists it | 742 |
| **`parent` names a different page (stale)** | **281** |
| not listed by any page of the pattern | 1,225 |
| no `parent` field | 4 |

Of those stale pointers, 1,104 named a page outside the pattern entirely — mostly
`mitigateny_actions` — and one named a row that no longer exists.

The page's `sections` / `draft_sections` list is authoritative, so this is **not** visible in
rendering. It stays silent until something trusts `parent`:

- **Pattern duplicate** did, and produced 1,081 corrupted refs out of 2,248 cloned components before
  it was fixed to rebuild `parent` from the listing page
  ([pattern-duplicate-copies-dead-rows.md](../current/pattern-duplicate-copies-dead-rows.md)).
- **Row auth** will. The resolver walks `parent_id`, derived from `data.parent`
  ([row-auth-schema.md](../current/row-auth-schema.md)) — a stale pointer means a row inherits grants from the
  wrong page, which is silent and wrong in the dangerous direction.

Every pattern in every app is still accumulating this.

## The likely fix

Add `parent` to the exclusion list, so a pasted section keeps the parent of the page it is pasted
INTO:

```js
.filter(key => !['id', 'ref', 'parent'].includes(key))
```

Before doing that, check the same function for other fields that should not travel with a paste —
`parent_id` once the row-auth column exists, and any timestamp or authorship field the clipboard
value happens to carry.

**A heavier relative of this bug** — a page created from a template sharing the template's section
**rows**, not just a stale `parent` field — is
[page-from-template-shares-section-rows.md](./page-from-template-shares-section-rows.md). Both belong
to the same copy/paste/duplicate sweep.

**Also check the other paste paths**, which were not examined: `ComplexFilters.jsx:139`
(`handlePasteFilters`), `ComponentRegistry/spreadsheet/config.jsx:22`, and
`ComponentRegistry/Card.config.jsx:61`.

## Scope to confirm first

This fixes new pastes. It does **not** repair the stale pointers already in the data — a separate
backfill, which is straightforward because the listing page is authoritative:

```sql
-- for each component, set parent to the page whose sections/draft_sections list it
```

`mitigat-ny-prod`'s worst offender was removed with the old admin pattern, but the other apps were
never measured. Run the count above per app before deciding whether a backfill is worth it.

## Testing

A unit test over `handlePaste` with a clipboard value carrying a `parent`, asserting the result keeps
the destination's parent. There is no existing test file for `section_utils.js`.
