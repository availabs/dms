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

// The Map SECTION's side of this opt-in (deriving the prop from a registered plugin's
// `fullWidthOverlay`) lives with the section, in dms-template's map editor pattern:
// src/patterns/mapeditor/mapeditor.test.js.
