# Refreshing a section's column metadata

A `dataWrapper` section (Card, Spreadsheet, Graph, …) keeps its own **copy** of the source's
column definitions in `element-data.columns`. The source itself can move on — a column gains
options, changes type, gets a `meta_lookup`. **Refresh Meta** is the per-column button that
re-syncs one column from the section's own source snapshot.

It is a blunt instrument: it overwrites author choices with source values. Read the gotcha
before clicking it, and before scripting it across many components.

## What it does

Source of truth: [`ColumnManager.jsx:346`](../packages/dms/src/patterns/page/components/sections/ColumnManager.jsx).

- Expand a column in the section's column manager. An orange **`Refresh Meta`** pill appears
  **only when that column is out of date** — i.e. some synced attribute differs from the snapshot.
- Clicking it copies these nine attributes from `externalSource.columns[…]` onto the component's
  column, wholesale:

  ```
  type · required · display · defaultFn · dataType · trueValue · options · mapped_options · meta_lookup
  ```

- The snapshot column is matched **by `name`**; the component column is matched by
  `name` + `isDuplicate` + `copyNum`, so duplicated columns refresh independently.
- Nothing else is touched — no filter reseeding, no v1→v2 migration, no `totalLength` recompute.
  The section refetches afterwards, so its cached `data` is repopulated as a side effect.

## The gotcha: it reverts deliberate author choices

Every one of the nine attributes is a field an author may have set on purpose. `display` is the
dangerous one, because on a **calculated column** the source and the author legitimately disagree:

- the source says `display: "calculated"` — it *is* a calculated column
- the author sets `display: "meta-variable"` so the column feeds the request's **meta map**

That map is built at [`buildUdaConfig.js:1466`](../packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js):

```js
const meta = columns.filter(column =>
  column.show &&
  ["meta-variable", "geoid-variable", "meta"].includes(column.display) &&
  column.meta_lookup)
```

A column in that map comes back from the server as `{value: "Hurricane", originalValue: "hurricane"}`
instead of a bare `"hurricane"` — that's what turns a slug into a display name. `"calculated"` is not
in the list, so **Refresh Meta silently removes the column from the meta map** and the lookup stops
resolving. In a Card, `formatFn: "icon"` uses that value as both the glyph key and the printed label
([`utils.jsx:280`](../packages/dms/src/patterns/page/components/sections/components/dataWrapper/utils/utils.jsx)),
so the cell renders the raw slug.

Note the `column.show` clause: a **hidden** column (`show: false`, e.g. one that only exists to
`group` the query) was never in the meta map, so refreshing it changes nothing visible. The blast
radius is columns that are both shown and meta-mapped.

**The click leaves a stale cache that hides the damage.** The refetch that accompanies the refresh
can still carry the old mapped rows, so the section looks fine immediately afterwards. Sections are
`fetchMode: 'smart'`, so the *next* page load rebuilds the request without the meta entry. Verify by
reloading, not by reading the cached `data`.

If you want the metadata sync but not the `display` revert, re-set `display` after refreshing.

## Reading the sync state before touching anything

Which columns would a refresh change, and to what:

```js
const SYNC = ['type','required','display','defaultFn','dataType','trueValue','options','mapped_options','meta_lookup'];
const e   = JSON.parse(row.element['element-data']);
const snap = new Map((e.externalSource?.columns || []).map(c => [c.name, c]));
e.columns.forEach((c, i) => {
  const s = snap.get(c.name); if (!s) return;
  SYNC.filter(k => k in s && JSON.stringify(c[k]) !== JSON.stringify(s[k]))
      .forEach(k => console.log(`columns[${i}].${k}: ${JSON.stringify(c[k])} -> ${JSON.stringify(s[k])}`));
});
```

A column listed here is exactly what the UI marks out-of-date and shows the pill for.

## Doing it headlessly (many components at once)

Mirror `ATTRS_TO_SYNC` rather than hardcoding the one key you expect to change — then **print every
key you touch**, so a surprise surfaces instead of sliding through. Applying this across a set of
sibling components should produce an identical, boring diff on each; anything else is a signal.

Per row: read → sync → write the **whole row** → read back.

```bash
dms raw update <id> --app <app> --data payload.json
```

Three things that will bite:

- **`externalSource` only.** `refreshMeta` reads `externalSource.columns`. A section still on the v1
  shape (`sourceInfo` / `dataRequest`) has no `externalSource`, so the pill never appears and a
  script that only looks at `externalSource` silently no-ops. Fall back to `sourceInfo` when reading,
  or migrate the section first.
- **`dms.data.edit` MERGES, it does not replace** — even via `raw update --data <file>`. Keys absent
  from your payload survive on the row. You cannot delete a key this way; blank it instead (`""`),
  which every `v?.key || default` consumer reads as absent. Round-trip the full row so unrelated keys
  aren't disturbed.
- **`--set` deep-merges arrays index-wise.** For anything array-shaped (`columns`, `filters.groups`)
  send the whole row with `--data`, not `--set`.

Element-data routinely runs 25–70 KB, which blows the Windows command-line limit — `--data <file>`
reads it off disk, `--set` does not.

## Verify and roll back

- Back up every target row to a timestamped JSON file **before** the first write, and print the
  restore command at the end of the run.
- After writing, read each row back and diff it against the payload; report anything that isn't
  byte-identical.
- Confirm the intended attribute actually landed (`columns[0].display === "calculated"`), not just
  that the write returned success.
- Then reload an affected page and look at the rendered cell — for the `display`/meta-map case, the
  data layer is the only place the regression shows, and only after a refetch.

## See also

- [`card-layout.md`](./card-layout.md) — what the Card does with `formatFn`, `display` and cell config.
- [`using-a-datawrapper-card.md`](./using-a-datawrapper-card.md) — the `externalSource` / `columns` /
  `filters` element-data shape these attributes live in.
- [`traversing-dms-pages.md`](./traversing-dms-pages.md) — reaching a section's true `SectionEdit`
  state, where the column manager and this pill live.
