# Lexical `sub://` cross-subdomain links + IconNode chip-box fix

**Status: COMPLETE 2026-07-13** (uncommitted). Built for the TransportNY landing redesign
(three products linking to their subdomains).

1. **`sub://<subdomain>/<path>` in ButtonNode** — resolves against the CURRENT host's base
   domain at click time (`sub://npmrds/x` → npmrds.localhost:5173/x in dev,
   npmrds.devtny.org/x on prod), so authored cross-subdomain links are environment-portable.
   Resolution strips the current host's subdomain label (single-depth, mirroring
   getSubdomain); resolved URLs go through the existing external-link `window.open` branch.
   BC: only paths starting `sub://` are affected.
2. **IconNode chip boxes fixed** (pre-existing bug): IconNode reads
   `config.theme.iconStyles[styleKey]` from the LEXICAL editor theme, but
   `buildLexicalInternalTheme` never passed `iconStyles` through and themev2 only registered
   it at the top level — so `styleKey: "productChip"` never rendered its tinted box. Added
   `iconStyles` to the builder's passthrough keys + attached the map to themev2's lexical
   style (`lexical.styles[0].iconStyles = iconStyles`).
3. transportny additions: three designed product icons in the registry (`ProductNpmrds` =
   corridor→travel-time pulse, `ProductTsmo` = ops radar + incident blip,
   `ProductFreightAtlas` = trifold plan map + freight corridor to a node) and per-product chip
   tints (`productChipNavy`, `productChipSlate`).

Verified live: landing product CTAs open http://npmrds.localhost:5173/ and
freightatlas2.localhost:5173/maps_gallery from www; icon chips render tinted.
