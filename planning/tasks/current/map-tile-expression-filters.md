# Map tiles: expression dynamic-filters work — stop appending them to `cols=`

## Status: DONE 2026-08-27 (one guard in SymbologyViewLayer.getLayerTileUrl, BC)

## Problem
A serverSide `dynamic-filter` whose `column_name` is a SQL expression
(`data->>'field'`) SILENTLY BLANKED the whole layer when active: the tile
`filter=` clause accepts expressions fine (verified by direct tile requests —
`(county_geoid = '36105') AND (data->>'x' = 'Yes')` returns correctly filtered
pbf), but `getLayerTileUrl` also appends every ACTIVE dynamic-filter's
column_name to the tile URL's **`cols=`** param — and an expression cannot be a
tile PROPERTY, so the server returns empty tiles. (The code even carried a
hardcoded TODO hack for one legacy calculated column.)

## Change (BC)
`dynamicCols` now keeps only plain identifiers
(`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) — expression column_names stay OUT of `cols=`.
They don't need to be there: serverSide filtering happens entirely in the
`filter=` clause. Filters on real columns are unchanged; filters on expressions
went from "empty layer" to "works", so this is strictly an improvement.

## Motivating use
MNY Actions Dashboard: the seven JSONB page variables (maturity/readiness +
five Key-Characteristics toggles) now drive the actions tile layer like every
other section — the "map needs physical columns" assumption was wrong on both
counts (filter= takes expressions; cols= never needed them).
