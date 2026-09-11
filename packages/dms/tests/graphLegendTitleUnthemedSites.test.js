/**
 * The back-compat case that actually matters for the legend-title work: **a site with no
 * resolver.**
 *
 * The title slot is filled by an OPTIONAL, theme-supplied `avlGraph.resolveLegendUnit` hook.
 * Exactly one theme in this repo defines one (transportny). Every other site — MitigateNY above
 * all, with roughly 7,415 legend-rendering graphs, plus landbank, tessera, wcdb, catalyst and any
 * downstream project on the published package — has no hook, no `legend.title`, and no avlGraph
 * legend class tokens whatsoever.
 *
 * For all of them the correct behaviour is *nothing happens*: no caption, no extra wrapper
 * element, no change in height, byte-identical markup. The other legend tests approach this from
 * the component side; this one renders the real section component through the same ThemeContext a
 * live page uses, because that is where the hook is looked up and therefore the only place the
 * "no hook" path can actually be exercised.
 *
 * Run: npx vitest run packages/dms/tests/graphLegendTitleUnthemedSites.test.js
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import Graph from "../src/ui/components/graph_new/index.jsx";
import { ThemeContext } from "../src/ui/useTheme";

const DISPLAY = {
  graphType: "BarGraph",
  xAxis: { name: "yr" },
  yAxis: [{ name: "v" }],
  legend: { show: true, position: "bottom", type: "categorical" },
  margin: { top: 20, right: 20, bottom: 50, left: 100 }
};

const renderGraph = (theme, display = DISPLAY) => renderToStaticMarkup(
  React.createElement(ThemeContext.Provider, { value: { theme } },
    React.createElement(Graph, {
      isEdit: false,
      activeStyle: 0,
      setState: () => {},
      state: {
        columns: [],
        data: [{ yr: "2019", v: 10 }, { yr: "2020", v: 20 }],
        display,
        comparisonSeries: undefined
      },
      pageContext: { pageState: {}, setActionParam: () => {}, clearActionParam: () => {} }
    })
  )
);

// What MitigateNY actually has: an avlGraph theme with styles and chartDefaults, and no hook.
const MNY_LIKE = { avlGraph: { options: { activeStyle: 0 }, styles: [{ name: "default", padding: "p-4" }] } };
// What a site that never defined an avlGraph key at all has.
const BARE = { avlGraph: {} };

describe("legend title on sites with no resolver", () => {

  it("renders no caption when the theme supplies no resolveLegendUnit", () => {
    for (const [name, theme] of [["mny-like", MNY_LIKE], ["bare", BARE], ["empty theme", {}]]) {
      const html = renderGraph(theme);
      expect(html, `${ name }: a caption appeared on a site with no resolver`)
        .not.toContain("truncate");
    }
  });

  it("is byte-identical across every no-resolver theme shape", () => {
    // If the hook lookup ever gained a default, this is what would catch it.
    expect(renderGraph(BARE)).toBe(renderGraph({}));
  });

  it("survives a theme whose resolveLegendUnit is not a function", () => {
    // Themes are partly DB-stored and hand-edited, so a stale string under this key is a
    // realistic accident. It must not throw during render — a cosmetic caption is never worth
    // white-screening a page.
    expect(() => renderGraph({ avlGraph: { resolveLegendUnit: "nope" } })).not.toThrow();
    expect(renderGraph({ avlGraph: { resolveLegendUnit: "nope" } })).toBe(renderGraph(BARE));
  });

  // ── The MitigateNY guarantee ──────────────────────────────────────────────
  // A caption appears if and only if something asks for one. MitigateNY asks for nothing: no
  // resolver, no `legend.title`, no legend class tokens. The guarantee is not that the feature
  // can't reach categorical legends — it can, deliberately, so the Settings-drawer control isn't
  // dead on most graph types — it is that an absent title changes nothing at all.
  it("renders a caption on a categorical legend only when one is actually set", () => {
    const titled = renderGraph(MNY_LIKE, { ...DISPLAY, legend: { ...DISPLAY.legend, title: "Households" } });
    expect(titled).toContain("Households");
    // …and the untitled render — every MitigateNY graph — is untouched.
    expect(renderGraph(MNY_LIKE)).not.toContain("Households");
    expect(renderGraph(MNY_LIKE)).not.toContain("truncate");
  });

  it("a resolver's UNIT never reaches a categorical legend", () => {
    // The bug this pins, caught live on a report page: the unit was filling every legend type, so
    // a speed line graph showed "mph" above its list of ROUTES. A categorical legend keys
    // identity, not magnitude — a unit there is meaningless. Only the linear legends read it.
    const withResolver = renderGraph({ avlGraph: { resolveLegendUnit: () => "mph" } });
    expect(withResolver).not.toContain("mph");
    expect(withResolver).toBe(renderGraph(BARE));
    // …and a resolver that declines is likewise indistinguishable from having none.
    expect(renderGraph({ avlGraph: { resolveLegendUnit: () => undefined } })).toBe(renderGraph(BARE));
  });

  it("still hands the resolver the whole display, not a plucked field", () => {
    // The boundary that keeps `_measurePick` out of this package: the library passes `display`
    // and the site-supplied hook decides what to read.
    const seen = [];
    renderGraph({ avlGraph: { resolveLegendUnit: d => { seen.push(d); return undefined; } } });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toMatchObject({ graphType: "BarGraph" });
  });
});
