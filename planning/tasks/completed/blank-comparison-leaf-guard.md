# Query builder: drop blank `gt/gte/lt/lte` leaves like blank `filter`/`like` leaves

**Topic:** page pattern · dataWrapper · **Status:** DONE · **Date:** 2026-09-13

## Problem

A `usePageFilters` range leaf (`received_at gte {from}` / `lt {to}`) is fed `""` by
`usePageFilterSync` until the control that owns the variable has written it (on the WCDB playlist,
the ShowBlockNav writes `from`/`to` a moment after mount). `mapFilterGroupCols` already drops
blank-valued `filter` / `exclude` / `like` leaves, but not the scalar comparison ops, so
`received_at >= ''` reached Postgres → `invalid input syntax for type timestamp with time zone`
→ swallowed into "Error getting length" and an empty section on first paint.

## Fix

`buildUdaConfig.js` `mapFilterGroupCols`: the same blank-value drop-out for `gt`, `gte`, `lt`,
`lte`. An unset bound is no bound. Additive: a leaf with a real value is unchanged.

## Verification

WCDB admin playlist edit view: the "Error getting length" console error on load is gone; the log
still filters to the navigator's block once `from`/`to` are written.

## Files

- `packages/dms/src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js`
