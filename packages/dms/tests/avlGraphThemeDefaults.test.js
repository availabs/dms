/**
 * Freeze the CORE `avlGraphTheme` defaults.
 *
 * This is constraint 1 of the graph-chrome theming work, and it is not a style preference —
 * it is the only thing protecting **~7,415 MitigateNY graphs**. Those sites either define no
 * `avlGraph` theme key at all or define a sparse one, so whatever is literal in this file IS
 * what they render. A "harmless" tweak to a default here — a swapped palette entry, a nudged
 * margin, a new key that a chart reads — ships to every site that never opted in.
 *
 * The task file's instruction was explicit: assert it, don't infer it by reading the theme
 * file. So this compares the whole serialized object against a golden captured before the
 * theming work began.
 *
 * If this test fails you have changed a DEFAULT. That is occasionally the right thing to do,
 * but it is a cross-site content decision, not a refactor — get it agreed, then regenerate
 * the golden in the same commit as the reason.
 *
 * New theming tokens are supposed to be ADDITIVE and UNSET by default (a token that is unset
 * must fall back to today's literal), so correctly-built pass-2 work leaves this test green.
 *
 * Run: npx vitest run packages/dms/tests/avlGraphThemeDefaults.test.js
 */

import { describe, it, expect } from "vitest";

import { avlGraphTheme } from "../src/ui/components/graph_new/theme.js";

import GOLDEN from "./fixtures/avlGraphTheme.golden.json" with { type: "json" };

describe("core avlGraphTheme defaults", () => {

  it("is byte-identical to the pre-theming golden", () => {
    expect(JSON.parse(JSON.stringify(avlGraphTheme))).toEqual(GOLDEN);
  });

  // Called out individually because these are the values a legend/padding change is most
  // likely to reach for, and a diff on the whole object doesn't say which one moved.
  it("still defines exactly the two historical styles, in order", () => {
    expect(avlGraphTheme.styles.map(s => s.name)).toEqual(["Light Mode", "Dark Mode"]);
    expect(avlGraphTheme.options.activeStyle).toBe(0);
  });

  it("still applies p-4 inside the card, in BOTH styles", () => {
    // Item 08 makes padding a per-section chart setting precisely so this stays put —
    // MAP-21 and tsmo2 keep 16px. A brand overrides via its own avlGraph `padding` token.
    expect(avlGraphTheme.styles.map(s => s.padding)).toEqual(["p-4", "p-4"]);
  });

  it("still ships legend defaults of exactly { show: true } and nothing else", () => {
    // Layer B tokens (rampLength, rampThickness, tickCount, collapse…) must arrive UNSET, so
    // that a site setting none of them renders exactly as it does today.
    for (const style of avlGraphTheme.styles) {
      expect(style.chartDefaults.legend).toEqual({ show: true });
    }
  });

  it("still carries no legend/tooltip CLASS-STRING tokens in core", () => {
    // Layer A chrome (legend, legendSwatch, legendLabel, legendTick, legendRamp, tooltip) is
    // BRAND styling. Core must leave every one of them undefined so the historical hardcoded
    // Tailwind in Legend.jsx remains the fallback for unbranded sites.
    const layerA = ["legend", "legendSwatch", "legendLabel", "legendTick", "legendRamp", "legendDot", "tooltip"];
    for (const style of avlGraphTheme.styles) {
      for (const key of layerA) {
        expect(style[key], `core must not set avlGraph style token "${ key }"`).toBeUndefined();
      }
    }
  });
});
