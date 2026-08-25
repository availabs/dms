# Map section: add a `"1/2"` (450px) height option

## Status: DONE 2026-08-24 (one-line additive)

## Objective
`HEIGHT_OPTIONS` in `ComponentRegistry/map/index.jsx` jumped from `"2/3"` (600px) to `"1/3"`
(300px). A map embedded in a half-width section beside a stacked column of sibling cards (the
MitigateNY Actions Dashboard: map beside two bar-chart Cards, band height ≈598px per the
vertical-rhythm parity gate) can't hit the band with either — 600 overshoots by ~130px, 300
undershoots by ~150px.

## Change
Added `"1/2": "450px"` to `HEIGHT_OPTIONS`. The settings UI's Height select derives its options
from `Object.keys(HEIGHT_OPTIONS)` (`settings/more.jsx`), so no other edit is needed.

## BC
Purely additive — existing sections keep their saved keys; the new key only renders when chosen.

## Motivating use
MNY Actions Dashboard map section (page 2410892, pattern 2265530) — see
`planning/mitigateny/tasks/current/actions-dashboard-live-build.md` in the root workspace hub.
