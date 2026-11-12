# Card `cardsMinWidth` (responsive multi-card grids) + datasets list reads `?search=`

**Initiatives:** [plat_nydos_gateway](../../../../../planning/initiatives/plat_nydos_gateway.md) · **Status:** built · **Release:** commit + deploy (ships with the nydos site build) · **Created by:** amuro@albany.edu · **Edited by:** —

## Objective

These are two small, backward-compatible library changes that the NYDOS Gateway home page needed (the site task is
`dms-template/planning/nydos/tasks/current/nydos-theme-and-home-page.md`):

1. **Responsive Card grids.** Card grids (`cardsGridSize`) had a fixed column count, so a 4-up tile row stayed 4-up on
   a 390px phone. The new optional display setting `cardsMinWidth` gives an auto-fit grid of cards at least that wide,
   and the tiles drop to 1-up at 390. When it's unset, the output is the same as before.
2. **Datasets search link.** The datasets list ignored any search parameter. It now fills its search box from
   `?search=`, so the home page's search field (theme column type `site_search`) and its category/program links can
   land on a filtered catalog.

## Files

- `packages/dms/src/ui/components/Card.layout.js`, `Card.jsx`, and the `ComponentRegistry/Card.config.jsx` control.
- `packages/dms/tests/cardLayout.test.js`: new cases (63 pass).
- `skills/card-layout.md`: documents `cardsMinWidth`.
- `packages/dms/src/patterns/datasets/pages/DatasetsList/index.jsx`: reads `?search=` (3 lines).

## Testing Checklist

- [x] Unit tests: `cardLayout.test.js` passes (63).
- [x] Live on the local dev server (app `nydos`): category and program tiles go from 4-up at 1440 to 1-up at 390, and
      `/datasets?search=wetlands` lists 4 matches.
- [ ] Review the diff and commit, then deploy with the site build.
