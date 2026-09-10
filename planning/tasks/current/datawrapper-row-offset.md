# `display.rowOffset` — let a section skip the first N rows of its own result

**Topic:** patterns/page — dataWrapper · **Status:** IMPLEMENTED, needs a submodule commit ·
**Raised / done:** 2026-09-09

> **Shipped.** `getData.js` reads `display.rowOffset` and offsets both ends of the fetch window;
> `Card.config.jsx` exposes it as **Row Offset**. Live on the MitigateNY LHMP plan home's hazard
> band, which now renders the design exactly: the leader in its focus panel, the remaining ten
> scaled to rank 2 (Lightning 100% · Flooding 99.8% · Tornado 29.6% · Wind 14.8% · … · Extreme Heat 0).
> **The submodule commit is the user's.** Two follow-ups below are NOT done.

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

## Why it was not expressible before this

`getData.js:365` computes the window from the pager alone:

```js
const fromIndex = isOptionsLoad || loadAllRows ? 0 : currentPage * safePageSize;
const toIndex   = … Math.min(length, currentPage * safePageSize + safePageSize) - 1;
```

`currentPage` is `useState(0)` inside `useDataLoader.js:90` — user state, not author config, so there
was **no author-reachable way to start a section's result at row 1 instead of row 0.** Confirmed by
searching for any other hook first: no `display.transform` row callback, no seedable initial page.

The workarounds all fail:

| Workaround | Why it fails |
|---|---|
| A filter excluding the leader by value (`fusion_category != 'hurricane'`) | Not templateable — the leader differs per county, and this page is one template for 62 counties. |
| `pageSize: 1` on the focus card + the full list beside it | What the build shipped. The leader appears twice, which the design deliberately avoids. |
| A SQL `offset` in a calculated column | `offset` is not part of a column expression; the UDA owns the range. |

## What shipped

As shipped (`getData.js`, just above the existing `fromIndex`) — note options loads and full loads
ignore it, which the scoped sketch did not:

```js
const rowOffset = Math.max(0, Math.floor(Number(state.display?.rowOffset) || 0));
const offset    = isOptionsLoad || loadAllRows ? 0 : rowOffset;
const fromIndex = isOptionsLoad || loadAllRows ? 0 : offset + currentPage * safePageSize;
const toIndex   = isOptionsLoad ? OPTIONS_LIMIT - 1
                : loadAllRows   ? length - 1
                : Math.min(length, offset + currentPage * safePageSize + safePageSize) - 1;
```

Toolbar: **Row Offset**, a number input next to Page Size in `Card.config.jsx` (ungated — the
motivating case is an unpaginated list).

### Follow-ups NOT done

- **`length` and the pager.** `length` is still the FULL count, so on a *paginated* section the
  pager will over-report by `rowOffset` and the last page comes back short. The motivating case is
  unpaginated (`usePagination: false`), so this was left alone deliberately rather than changed
  untested — `getLength` and `Pagination` both consume `length` and the blast radius is every
  paginated section. Fix before anyone uses Row Offset with pagination on.
- **No test.** `cardLayout.test.js` covers the layout resolvers, not getData's window arithmetic.

### Already handled

- **`fromIndex >= length`** (`getData.js:374`) needed no change — an offset past the end falls into
  the existing blank-row-fallback branch, which is the right behaviour.
- **BC:** unset ⇒ `0` ⇒ byte-identical requests. Purely additive.
- Pairs with an author-set `pageSize`, so "ranks 2–11" is `rowOffset: 1, pageSize: 10`.

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

- [x] `rowOffset` unset produces byte-identical UDA requests — every other section on the LHMP
      plan home is unchanged, verified by capturing their requests
- [x] `rowOffset: 1` on an ordered grouped card drops exactly the top row — the hazard bar list
      goes from 11 rows led by Hurricane to 10 led by Lightning
- [ ] Pagination arithmetic with an offset — **NOT done**, see the follow-ups above
- [ ] `rowOffset` beyond the result length falls into the blank-row-fallback branch — untested
- [x] Toolbar control present (`Row Offset`) and round-trips through `element-data`
