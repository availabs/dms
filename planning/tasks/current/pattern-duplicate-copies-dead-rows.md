# Pattern duplicate copied dead rows and corrupted parent refs

**Initiatives:** [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) (primary) · **Status:** built · **Created by:** amuro@albany.edu · **Edited by:** —

Found 2026-10-28 while duplicating `mitigat-ny-prod`'s `admin` pattern (groundwork for resolving the
`prod|admin:pattern` instance-name collision — see
[row-auth-schema.md](./row-auth-schema.md)). Two defects in
`dama/upload/dms-duplicate.js`, both present in every earlier use of Duplicate.

## Defect 1 — the ref moved when the id did not

`remapParentRef` and `remapSectionRefs` rewrote the `ref` **unconditionally**:

```js
return { ...obj, id: newId != null ? newId : obj.id, ref: `${newApp}+${newInstance}|page` };
```

An entry pointing at a row outside the pattern correctly keeps its id — and then had its ref
rewritten to a type that id does not point at. Measured on the first run: **1,081 of 2,248 cloned
components** claimed `…+mitigateny_admin|page` while pointing at a `mitigateny_actions|page`. The
originals were correct, so the copy introduced all of it.

**Fixed:** the ref moves only when the id does.

## Defect 2 — unreferenced rows were copied forward

The duplicate copied every non-empty component, whether or not anything rendered it.

Owner, 2026-10-28: **there is no cross-pattern rendering relationship in DMS**, so a component is
live iff a page *of its own pattern* lists its id in `sections` / `draft_sections`. Measured on
`admin` (2,252 components):

| | |
|---|---|
| listed by a page of this pattern (live) | 1,026 |
| listed **nowhere** in the app | 1,048 |
| listed only by another pattern's page, through a ref that does not resolve | 34 |
| empty / ghost rows | 3 |

So **55% of what was being copied rendered nothing.** This is the mechanism behind the incident in
`nameToSlug`'s docstring: the `undefined_copy` → `undefined_copy_copy` → … chain dragged ~3,700
components (~177 MB) per generation until a Falcor response passed V8's 512 MiB string limit
(`falcor-response-string-limit-crash.md`). Duplicate was compounding the dead weight each time.

**Fixed:** only components a page of the pattern lists are copied.

## Also fixed — `data.parent` is rebuilt, not copied

`data.parent` is **not maintained on copy/paste**, so the stored value is frequently stale: 281 of
`admin`'s components named a different page than the one listing them, and one named a row that no
longer exists. The duplicate now derives each cloned component's parent from **the page that lists
it**, which is authoritative and already remapped correctly.

## Result on the live re-run

| | before the fix | after |
|---|---|---|
| components cloned | 2,249 | **1,023** |
| parent → a cloned page with the right ref | 1,167 / 2,248 | **1,023 / 1,023** |
| wrong `parent.ref` | **1,081** | **0** |
| section entries resolving | — | 1,024 / 1,027 (3 are the skipped ghosts) |

## Changes

- `src/dama/upload/dms-duplicate.js` — both remap helpers; live-component filter; parent rebuilt
  from the listing page; the worker body extracted as `duplicatePatternContent(controller,
  descriptor, { report, log })` so it can be driven by a test or a repair script without HTTP, a
  signed-in user, or a DAMA task row.
- `tests/test-duplicate-refs.js` — **9 cases**, in `npm test`.

## Left open

- **The paste bug itself.** If pasting a section does not set `parent` on the new row, every pattern
  in every app is accumulating this. Not investigated here; worth its own task.
- **34 dangling section entries** on `mitigateny_actions` pages (and 1,048 unreferenced
  `admin|component` rows) are pre-existing and were **not** touched. Cleanup candidates.
