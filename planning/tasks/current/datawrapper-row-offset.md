# `display.rowOffset` — let a section skip the first N rows of its own result

**Topic:** patterns/page — dataWrapper · **Status:** SCOPED, not started · **Raised:** 2026-09-09

Raised while building the MitigateNY LHMP plan home
(`planning/mitigateny/tasks/current/mny-lhmp-home-live-build.md`, section S8). It is the one thing
that build could not express with existing primitives.

## The pattern this unlocks

**"Rank 1 out front, ranks 2–n beside it."** A grouped, ordered result where the leader gets its own
focus panel and the remainder get a list scaled to *their* own top. It generalises far past one page:
a top-corridor callout beside the rest of the corridors, a headline measure beside its peers, a
"biggest mover" card beside a movers list.

On the LHMP plan home, Sullivan's hurricane loss is **91% of all recorded loss**. On a shared scale
the other ten hazards are stubs, so the band could only ever say "hurricane". Splitting the leader
out is what makes the other ten legible.

## Why it isn't expressible today

`getData.js:365` computes the window from the pager alone:

```js
const fromIndex = isOptionsLoad || loadAllRows ? 0 : currentPage * safePageSize;
const toIndex   = … Math.min(length, currentPage * safePageSize + safePageSize) - 1;
```

`currentPage` is `useState(0)` inside `useDataLoader.js:90` — it is user state, not author config, so
**there is no author-reachable way to start a section's result at row 1 instead of row 0.**

The workarounds all fail:

| Workaround | Why it fails |
|---|---|
| A filter excluding the leader by value (`fusion_category != 'hurricane'`) | Not templateable — the leader differs per county, and this page is one template for 62 counties. |
| `pageSize: 1` on the focus card + the full list beside it | What the build shipped. The leader appears twice, which the design deliberately avoids. |
| A SQL `offset` in a calculated column | `offset` is not part of a column expression; the UDA owns the range. |

## Proposal

One display key, read where the pager already is:

```js
const rowOffset = Math.max(0, Number(state.display?.rowOffset) || 0);
const fromIndex = isOptionsLoad || loadAllRows ? rowOffset : rowOffset + currentPage * safePageSize;
const toIndex   = isOptionsLoad ? OPTIONS_LIMIT - 1
                : loadAllRows   ? length - 1
                : Math.min(length, rowOffset + currentPage * safePageSize + safePageSize) - 1;
```

Plus a **Row offset** number input in the Card/Spreadsheet toolbar's data settings, next to Page size.

### Details to settle

- **`length` and the pager.** With an offset, the reported length should almost certainly become
  `length - rowOffset` for pagination arithmetic, or the last page comes back short. Decide and
  test — `getLength` and `Pagination` both consume it.
- **`fromIndex >= length` guard** (`getData.js:374`) already handles an offset past the end; it falls
  into the blank-row-fallback branch, which is the right behaviour.
- **BC:** unset ⇒ `0` ⇒ byte-identical requests. This is purely additive.
- Pairs naturally with an author-set `pageSize`, so "ranks 2–11" is `rowOffset: 1, pageSize: 10`.

## Companion (already solved, no change needed)

The *scale* half of the same design rule — "ranks 2–n scaled to rank 2" — **is** expressible today,
with a window function in a `selectOnly` sibling and `data_bar`'s `barMaxColumn`:

```sql
nth_value(sum(<loss>), 2) over (
  order by sum(<loss>) desc
  rows between unbounded preceding and unbounded following
) as hazard_loss_max
```

with `normalName: 'hazard_loss_max'` and `barMaxColumn: 'hazard_loss_max'` on the bar column. Shipped
and verified on the LHMP plan home. (Note the trap `card-layout.md` already documents: pointing
`barMaxColumn` at the bar's *own* column makes every bar 100%.)

## Testing Checklist

- [ ] `rowOffset` unset produces byte-identical UDA requests to today
- [ ] `rowOffset: 1` on an ordered grouped card drops exactly the top row
- [ ] Pagination arithmetic correct with an offset (last page not short, page count right)
- [ ] `rowOffset` beyond the result length falls into the existing blank-row-fallback branch
- [ ] Toolbar control present and round-trips through `element-data`
