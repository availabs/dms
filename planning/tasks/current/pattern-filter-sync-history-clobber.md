# pattern-filter-sync replaces a page's `{id, ref}` history link with an inline array

**Initiatives:** [mny_county_sites](../../../../../planning/initiatives/mny_county_sites.md) (primary), [dms_data_safety](../../../../../planning/initiatives/dms_data_safety.md) · **Status:** next · **Created by:** amuro@albany.edu · **Edited by:** —

**Topic:** dms-server · **Found:** 2026-10-06 · **Split from:**
[`county-template-update-migration.md`](../../../../../planning/mitigateny/tasks/current/county-template-update-migration.md)
(MitigateNY), which works around this until it's fixed.

## Objective

When `sync-filters` patches a page, it should **add** its entry to the page's history, not
**replace** the page's history. Today, on any page whose `history` is the normal dms-format link to
a `…|page-edit` row, it overwrites the link, and the page's edit history is orphaned.

## Root cause

`packages/dms-server/src/dms/tasks/pattern-filter-sync/pattern-filter-sync.js` has its own
`appendHistoryEntry` (~line 71) that only understands an inline array:

```js
function appendHistoryEntry(rawHistory, message, user) {
  const history = parseIfJSON(rawHistory, []);
  const arr = Array.isArray(history) ? history : [];          // {id, ref} → []
  return [...arr, { action: message, date: Date.now(), user_id: user?.id ?? null }];
}
```

and writes the result straight into the page (~line 285):
`setDataById(page.id, { has_changes: true, history: appendHistoryEntry(pageData.history, …) })`.

But the page format declares `history` as `{ key: 'history', type: 'dms-format', format:
'dms-site+page-edit' }` (`packages/dms/src/patterns/page/page.format.js`). The client's
`appendHistoryEntry` (`packages/dms/src/patterns/utils.js`) keeps entries **in the `page-edit`
row** as `{entries: [{time, user (email), action}]}`, and the page holds only `{id, ref}`.

So a sync on a page with a `{id, ref}` link:
1. finds no array, and starts from `[]`;
2. writes `[{action, date, user_id}]` into `page.history`, **dropping the link**;
3. leaves the `page-edit` row behind with every prior entry, referenced by nothing.

There are two more knock-on effects:
- **The format split cascades.** The next UI edit on that page calls the client
  `appendHistoryEntry(item.history = [array])`. It finds no `.entries`, so it creates a *new*
  `page-edit` row holding just the new entry, and the sync's inline entry is lost too.
- **Entry shapes differ.** The client writes `{time: Date.toString(), user: email, action}`; the
  server writes `{date: epoch ms, user_id, action}`. The admin Activity tab and the page history
  pane read the client shape.

## Evidence (MitigateNY, 2026-10-06)

- Every page of every county site duplicated on 2026-09-15 (52 + Schoharie on 09-16) carries an
  inline `[{action: "pattern filter synced (group: *)", date, user_id: null}]` from the rollout's
  sync. On those copies the overwritten link pointed at the *template's* `page-edit` row (the
  duplicate worker doesn't clone `page-edit` rows), so nothing was lost there. Their first UI edit
  then started a fresh `page-edit` row.
- The template (`mitigateny_county_template`) still has `{id, ref}` on all 45 pages, because
  sync-filters never ran on it.
- **The real loss is on re-sync.** The MitigateNY quarterly template-release process re-runs
  sync-filters on county pages after writing template changes into them. Pages clients have edited
  (Wyoming, Nassau, Chenango…) now hold `{id, ref}` links to their own history, and each re-sync
  would orphan it. The release process works around this (see Workaround below) until this task
  ships.

## Proposed fix

1. **Respect the dms-format link.** In the sync's page update:
   - if `pageData.history` is `{id, …}`: append `{time, user, action}` (the client's shape) to that
     `page-edit` row's `entries`, through the controller, and **don't** write `history` on the page;
   - if it's an inline array (legacy, written by earlier syncs): create a `page-edit` row whose
     `entries` are the array converted to the client shape plus the new entry, and set
     `page.history = {id, ref: '<app>+<instance>|page-edit'}`;
   - if it's absent, create the `page-edit` row and the link.
2. **One helper, not two.** Export a server-side history appender with the client's semantics
   (`packages/dms-server/src/...`) and have pattern-filter-sync use it. Any other server task that
   writes history then can't drift again. Grep the server for other `history:` writers while there.
3. **Optional remediation script** (CLI or one-off): for a given instance,
   - convert inline-array histories to `page-edit` rows;
   - **re-link orphaned `page-edit` rows**: rows in the instance that no page references, whose
     entries pre-date the inline array, merged back in time order. The rollout copies have none
     worth recovering; this is for any page a sync hits before the fix ships.

## Workaround in use (until this ships)

`dms-template/src/themes/mny/county_template_update_migration/`: before running sync-filters on a
county, snapshot every page's `history` value. Afterwards, for each page whose value went from
`{id, ref}` to an array:
- write the `{id, ref}` link back (a page field, so effective immediately, no publish);
- append the sync's entry to that `page-edit` row in the client shape.

## Files

| File | Change |
|---|---|
| `packages/dms-server/src/dms/tasks/pattern-filter-sync/pattern-filter-sync.js` | use the shared appender; stop writing `history` when a link exists |
| `packages/dms-server/src/…` (new or existing util) | server-side `appendPageHistory(controller, app, pageData, action, user)` with client semantics |
| `packages/dms-server/tests/…pattern-filter-sync…` | cases below |

## Testing checklist

- [ ] Page with `{id, ref}` + 3 entries → after sync: link unchanged, `page-edit` row has 4 entries,
      the 4th `{time, user, action: 'pattern filter synced (group: *)'}`
- [ ] Page with a legacy inline array → after sync: `{id, ref}` link to a new row holding the old
      entries (converted) + the new one
- [ ] Page with no history → link + row with one entry
- [ ] The admin Activity tab and the page history pane show the sync entry
- [ ] A UI edit after a sync appends to the same row (no new row)
