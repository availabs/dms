/**
 * AvlMap `floatMapActions` — the opt-in that stops the map-actions column from
 * reserving overlay width.
 *
 * WHY THIS EXISTS. The overlay inside avl-map.jsx is a flex row with two children:
 * `flex-1 relative` (layer render components + map-plugin panels) and the map-actions
 * column. That column is full-height and ~176px wide (four navigation buttons) but draws
 * its controls only in the BOTTOM-RIGHT corner, so a plugin panel pinned `right-0` inside
 * `flex-1` stopped ~200px short of the map's right edge — measured on npmrds `/macro`:
 * right panel right=1400 in a 1600 viewport against a 24px inset on the left.
 * `floatMapActions` makes the column zero-width and floats its controls in the same
 * corner, so `flex-1` spans the whole overlay.
 *
 * `avl-map.jsx` is shared by EVERY map in the platform, so the contract under test is:
 * with the prop absent/false the rendered markup is BYTE-IDENTICAL to the pre-opt-in
 * markup, and with it on the ONLY difference is the two class strings on the actions
 * column. The last test asserts exactly that — the two renders must be equal after
 * substituting the float classes back to the default ones.
 *
 * Run: npx vitest run tests/avlMapFloatActions.test.js
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AvlMapInner } from "../src/ui/components/map/avl-map.jsx";
import { ThemeContext } from "../src/ui/useTheme";

// The exact class strings the overlay's actions column has always rendered…
const DEFAULT_COLUMN = 'class="relative pl-4"';
const DEFAULT_INNER = 'class="flex flex-col h-full justify-end flex-end"';
// …and what the opt-in swaps them for: no width, controls floated in the same corner.
const FLOAT_COLUMN = 'class="relative w-0"';
const FLOAT_INNER = 'class="absolute bottom-0 right-0 flex flex-col justify-end"';

// A server render runs no effects, so maplibre is never constructed and `maplibre`
// itself is never dereferenced — the overlay markup is all we get, which is all we want.
// The map's chrome reads the theme through ThemeContext (Icon does it unguarded), which
// every real mount has; supply an empty theme so the defaults apply.
const render = (props) =>
  renderToStaticMarkup(
    React.createElement(
      ThemeContext.Provider,
      { value: { theme: {} } },
      React.createElement(AvlMapInner, { id: "test-map", ...props })
    )
  );

describe("avl-map floatMapActions", () => {

  it("renders the actions column as a width-reserving flex sibling by default", () => {
    const html = render({});
    expect(html).toContain(DEFAULT_COLUMN);
    expect(html).toContain(DEFAULT_INNER);
    expect(html).not.toContain(FLOAT_COLUMN);
    expect(html).not.toContain(FLOAT_INNER);
  });

  it("an explicit false is the same as omitting it", () => {
    expect(render({ floatMapActions: false })).toBe(render({}));
  });

  it("floats the column — zero width, same bottom-right corner — when opted in", () => {
    const html = render({ floatMapActions: true });
    expect(html).toContain(FLOAT_COLUMN);
    expect(html).toContain(FLOAT_INNER);
    expect(html).not.toContain(DEFAULT_COLUMN);
    expect(html).not.toContain(DEFAULT_INNER);
  });

  it("keeps the overlay's flex-1 child (the plugin-panel box) untouched", () => {
    // The panels position against this box; the flag must not restyle it, only free it.
    for (const props of [{}, { floatMapActions: true }]) {
      expect(render(props)).toContain('class="flex-1 relative"');
    }
    expect(render({ floatMapActions: true })).toContain(
      'class="flex absolute inset-0 pointer-events-none p-2"'
    );
  });

  it("changes NOTHING else in the markup (the BC proof)", () => {
    const off = render({});
    const on = render({ floatMapActions: true });
    expect(on).not.toBe(off);
    const normalized = on
      .replace(FLOAT_COLUMN, DEFAULT_COLUMN)
      .replace(FLOAT_INNER, DEFAULT_INNER);
    expect(normalized).toBe(off);
  });

  it("still renders the column only when there are actions to draw", () => {
    for (const props of [{ mapActions: [] }, { mapActions: [], floatMapActions: true }]) {
      const html = render(props);
      expect(html).not.toContain(FLOAT_COLUMN);
      expect(html).not.toContain(DEFAULT_COLUMN);
    }
  });
});

// The Map SECTION is what turns the prop on, and it does so from the plugin registry —
// a plugin whose own panels are pinned to the map's edges declares
// `fullWidthOverlay: true` (theme-side, e.g. transportny's macroview) instead of the page
// author having to edit a published section. A source contract, in the style of
// cardLayout.test.js: the section renders inside a falcor/immer/context stack that a unit
// test cannot stand up, but the two lines that make the opt-in reachable must not drift.
describe("Map section → floatMapActions wiring", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(
    path.join(here,
      "../src/patterns/page/components/sections/components/ComponentRegistry/map/index.jsx"),
    "utf8"
  );

  it("passes the prop to AvlMap", () => {
    expect(source).toMatch(/floatMapActions=\{\s*floatMapActions\s*\}/);
  });

  it("derives it from a registered plugin's fullWidthOverlay flag", () => {
    expect(source).toMatch(/PluginLibrary\[pluginName\]\?\.fullWidthOverlay/);
    // …over the section's own plugins, so an unrelated map with no plugins gets false.
    expect(source).toMatch(/symb\?\.symbology\?\.plugins \|\| \{\}/);
  });

  it("is false for a section with no plugins at all (the derivation, replayed)", () => {
    // Same expression as the component, evaluated against representative state so the
    // default-off claim is exercised and not just pattern-matched.
    const derive = (symbologies, PluginLibrary) => Object.values(symbologies || {})
      .some(symb => Object.keys(symb?.symbology?.plugins || {})
        .some(pluginName => Boolean(PluginLibrary[pluginName]?.fullWidthOverlay)));

    const library = { macroview: { fullWidthOverlay: true }, other_plugin: {} };
    expect(derive({}, library)).toBe(false);
    expect(derive({ a: { symbology: { layers: { l1: {} } } } }, library)).toBe(false);
    expect(derive({ a: { symbology: { plugins: { other_plugin: {} } } } }, library)).toBe(false);
    expect(derive({ a: { symbology: { plugins: { not_registered: {} } } } }, library)).toBe(false);
    expect(derive({ a: { symbology: { plugins: { macroview: {} } } } }, library)).toBe(true);
    expect(derive(
      { a: { symbology: { layers: { l1: {} } } }, b: { symbology: { plugins: { macroview: {} } } } },
      library
    )).toBe(true);
  });
});
