/**
 * BarGraph Scale Filter: log-spaced stops, value labels, theme tokens.
 *
 * The filter's quick-picks crop the value axis (they set `yAxis.domainMax`) so a chart
 * dominated by one outlier can be read at smaller magnitudes. They used to be Max / 75% /
 * 50% / 5% of the tallest bar; on log-distributed data (the MitigateNY county template's
 * loss-by-year spans $9K..$332M) only 5% revealed anything. Pinned here:
 *   - the stops are log-spaced between the tallest and the smallest positive bar, snapped
 *     to 1/2/5 × 10ⁿ, strictly decreasing, never below the smallest bar;
 *   - each button is labelled with the value it crops to, in the compact form of the
 *     axis's own format;
 *   - a theme without the `scaleFilter*` tokens gets the pre-token literals, byte for byte.
 *
 * The four fixtures are the live county-template sections' own cached bar totals
 * (page 1300806, read 2026-10-06).
 *
 * Run: npx vitest run src/dms/packages/dms/tests/barGraphScaleFilter.test.js
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { getScaleFilterStops, SCALE_FILTER_MIN_SPREAD } from "../src/ui/components/graph_new/components/utils.js";
import { getCompactFormatFunc } from "../src/ui/components/graph_new/utils.js";
import { BarGraphOption } from "../src/ui/components/graph_new/components/BarGraph.jsx";
import { avlGraphTheme } from "../src/ui/components/graph_new/theme.js";

// One-series bars from a list of totals.
const bars = totals => totals.map((v, i) => ({ index: String(i), v }));
const stopsOf = totals => getScaleFilterStops({ data: bars(totals), keys: ["v"] });

// Bar totals of the four live sections.
const LOSS_BY_YEAR = [23898000, 290000, 95000, 144760, 11891963, 0, 382000, 1543289, 38934935,
  13362668, 111767100, 621983, 38000, 75000, 9000, 8294937, 331701820.69, 1212000, 530000, 12000,
  17000, 135800, 550000, 185000, 165000, 3806136.52, 37500, 276250, 84000];
const LOSS_BY_MONTH = [9157000, 210000, 449800, 13298668, 5205898, 117531083, 1694789, 43447437,
  25800017, 331820820.69, 312630, 1133000];
const DAMAGE_5Y = [165000, 3806136.52, 37500, 276250, 84000];
const EVENTS_5Y = [26, 46, 18, 31, 22];

describe("getScaleFilterStops", () => {

  describe("the live county-template charts", () => {
    it("loss by year (36,856× spread): $20M, $2M, $100K", () => {
      const { peak, stops } = stopsOf(LOSS_BY_YEAR);
      expect(peak).toBeCloseTo(331701820.69);
      expect(stops).toEqual([20e6, 2e6, 1e5]);
    });
    it("loss by month (1,580×): $50M, $10M, $1M", () => {
      expect(stopsOf(LOSS_BY_MONTH).stops).toEqual([50e6, 10e6, 1e6]);
    });
    it("last 5 years damage (101×): $1M, $500K, $100K", () => {
      expect(stopsOf(DAMAGE_5Y).stops).toEqual([1e6, 5e5, 1e5]);
    });
    it("last 5 years events (2.6×): no stops — nothing for a crop to reveal", () => {
      const { peak, stops } = stopsOf(EVENTS_5Y);
      expect(peak).toBe(46);
      expect(stops).toEqual([]);
    });
  });

  it("measures a stacked bar by its positive sum", () => {
    const data = [{ index: "a", x: 900, y: 100 }, { index: "b", x: 5, y: 5 }];
    const { peak, stops } = getScaleFilterStops({ data, keys: ["x", "y"], groupMode: "stacked" });
    expect(peak).toBe(1000);
    // floor = 10 (5 + 5), so the stops sit between 10 and 1000
    expect(stops.every(s => s >= 10 && s < 1000)).toBe(true);
    expect(stops.length).toBe(3);
  });

  it("measures a grouped chart by each series' own value", () => {
    const data = [{ index: "a", x: 900, y: 100 }, { index: "b", x: 5, y: 5 }];
    const { peak, stops } = getScaleFilterStops({ data, keys: ["x", "y"], groupMode: "grouped" });
    expect(peak).toBe(900);
    expect(stops.every(s => s >= 5 && s < 900)).toBe(true);
  });

  it("defaults to stacked when groupMode is unset", () => {
    const data = [{ index: "a", x: 900, y: 100 }, { index: "b", x: 1, y: 1 }];
    expect(getScaleFilterStops({ data, keys: ["x", "y"], groupMode: undefined }).peak).toBe(1000);
  });

  it("ignores negative, zero and non-numeric values", () => {
    const data = [
      { index: "a", v: 1000, w: -5000 },
      { index: "b", v: 0 },
      { index: "c", v: "n/a" },
      { index: "d", v: 2 }
    ];
    const { peak, stops } = getScaleFilterStops({ data, keys: ["v", "w"] });
    expect(peak).toBe(1000);
    expect(stops.every(s => s >= 2 && s < 1000)).toBe(true);
  });

  it("returns no stops for empty, all-zero, all-negative or single-bar data", () => {
    expect(stopsOf([])).toEqual({ peak: 0, stops: [] });
    expect(stopsOf([0, 0])).toEqual({ peak: 0, stops: [] });
    expect(stopsOf([-4, -400]).stops).toEqual([]);
    expect(stopsOf([5000]).stops).toEqual([]);
  });

  it("starts producing stops at a spread of exactly SCALE_FILTER_MIN_SPREAD", () => {
    expect(stopsOf([SCALE_FILTER_MIN_SPREAD * 100 - 1, 100]).stops).toEqual([]);
    expect(stopsOf([SCALE_FILTER_MIN_SPREAD * 100, 100]).stops.length).toBeGreaterThan(0);
  });

  it("honours `count`", () => {
    expect(getScaleFilterStops({ data: bars(LOSS_BY_YEAR), keys: ["v"], count: 5 }).stops.length).toBe(5);
  });

  it("every stop is a 1/2/5 × 10ⁿ value, strictly decreasing, below the peak, not below the floor", () => {
    // Deterministic pseudo-random spreads, 1.5 to 9 decades.
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 300; run++) {
      const decades = 1 + rand() * 8;
      const totals = Array.from({ length: 3 + Math.floor(rand() * 30) }, () => 10 ** (rand() * decades) * (1 + rand() * 50));
      const { peak, stops } = stopsOf(totals);
      const floor = Math.min(...totals.filter(v => v > 0));
      if (peak / floor < SCALE_FILTER_MIN_SPREAD) {
        expect(stops).toEqual([]);
        continue;
      }
      expect(stops.length).toBe(3);
      let prev = peak;
      for (const s of stops) {
        const mantissa = s / 10 ** Math.floor(Math.log10(s) + 1e-9);
        expect([1, 2, 5].some(m => Math.abs(mantissa - m) < 1e-6)).toBe(true);
        expect(s).toBeLessThan(prev);
        expect(s).toBeGreaterThanOrEqual(floor);
        prev = s;
      }
    }
  });
});

describe("getCompactFormatFunc", () => {
  it("dollars, K/M/B, 3 significant figures", () => {
    const f = getCompactFormatFunc("integer", true);
    expect(f(20e6)).toBe("$20M");
    expect(f(1e5)).toBe("$100K");
    expect(f(331701820.69)).toBe("$332M");
    expect(f(3806136.52)).toBe("$3.81M");
    expect(f(1.2e9)).toBe("$1.2B");
    expect(f(950)).toBe("$950");
  });
  it("picks the unit after rounding (999,999 is 1M, not 1000K)", () => {
    expect(getCompactFormatFunc("integer")(999999)).toBe("1M");
    expect(getCompactFormatFunc("integer")(999.9)).toBe("1K");
  });
  it("no prefix without isDollars; small and fractional values pass through rounded", () => {
    const f = getCompactFormatFunc(undefined);
    expect(f(46)).toBe("46");
    expect(f(0.5)).toBe("0.5");
    expect(f(0.123456)).toBe("0.123");
  });
  it("keeps the axis's lowercase k/m/b when the axis format abbreviates that way", () => {
    expect(getCompactFormatFunc("fnum", true)(20e6)).toBe("$20m");
    expect(getCompactFormatFunc("millions")(5e5)).toBe("500k");
    expect(getCompactFormatFunc("billions2")(2e9)).toBe("2b");
  });
  it("hands non-magnitude formats back unchanged", () => {
    expect(getCompactFormatFunc("epoch_time")(80)).toBe("6:40");
    expect(getCompactFormatFunc("duration_mmss")(22.75)).toBe("22:45");
  });
  it("passes non-numbers through", () => {
    expect(getCompactFormatFunc("integer")("n/a")).toBe("n/a");
  });
});

// ── The rendered control ─────────────────────────────────────────────────────

const BarGraphWrapper = BarGraphOption.Component;
const COLUMNS = [
  { key: "year", target: "xAxis" },
  { key: "loss", target: "yAxis" }
];
const rowsOf = totals => totals.map((loss, i) => ({ year: 1996 + i, loss }));

const renderControl = ({ totals = LOSS_BY_YEAR, theme = {}, domainMax, showScaleFilter = true, format = getCompactFormatFunc("integer", true) } = {}) =>
  renderToStaticMarkup(React.createElement(BarGraphWrapper, {
    viewData: rowsOf(totals),
    columns: COLUMNS,
    legend: { show: false },
    actions: [],
    hoverComp: {},
    colors: { type: "palette", value: ["#000"] },
    height: 300,
    orientation: "vertical",
    groupMode: "stacked",
    yAxis: domainMax === undefined ? {} : { domainMax },
    xAxis: {},
    theme,
    showScaleFilter,
    scaleFilterFormat: format,
    onSetDomainMax: () => {}
  }));

// The control's own markup, sliced off the front of the wrapper's output.
const controlOf = html => {
  const i = html.indexOf('role="group"');
  if (i < 0) return null;
  const start = html.lastIndexOf("<div", i);
  return html.slice(start, html.indexOf('<div class="w-full bg-inherit', start));
};
const squash = s => s.replace(/\s+/g, " ");
const buttonsOf = html => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(m => m[1].replace(/<[^>]+>/g, ""));
const pressedOf = html => [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)]
  .filter(m => m[1] === "true").map(m => m[2].replace(/<[^>]+>/g, ""));

describe("BarGraph Scale Filter control", () => {

  it("labels each stop with the value it crops to; Max carries the peak", () => {
    expect(buttonsOf(controlOf(renderControl()))).toEqual(["Max $332M", "$20M", "$2M", "$100K"]);
  });

  it("Max is active with no crop; a stop is active when domainMax equals it", () => {
    expect(pressedOf(controlOf(renderControl()))).toEqual(["Max $332M"]);
    expect(pressedOf(controlOf(renderControl({ domainMax: 2e6 })))).toEqual(["$2M"]);
    // a string domainMax (the yAxis Domain Max input) matches too
    expect(pressedOf(controlOf(renderControl({ domainMax: "2000000" })))).toEqual(["$2M"]);
    // an empty Domain Max input is no crop
    expect(pressedOf(controlOf(renderControl({ domainMax: "" })))).toEqual(["Max $332M"]);
  });

  it("shows a saved crop that isn't a stop as its own active item, in order", () => {
    const html = controlOf(renderControl({ domainMax: 16585091 }));
    expect(buttonsOf(html)).toEqual(["Max $332M", "$20M", "$16.6M", "$2M", "$100K"]);
    expect(pressedOf(html)).toEqual(["$16.6M"]);
    expect(html).toContain('title="Current axis maximum"');
  });

  it("hides on data too flat for stops, unless the chart is saved cropped", () => {
    expect(controlOf(renderControl({ totals: EVENTS_5Y, format: getCompactFormatFunc("integer") }))).toBeNull();
    const html = controlOf(renderControl({ totals: EVENTS_5Y, domainMax: 30, format: getCompactFormatFunc("integer") }));
    expect(buttonsOf(html)).toEqual(["Max 46", "30"]);
    expect(pressedOf(html)).toEqual(["30"]);
  });

  it("renders nothing when showScaleFilter is off, or there is no data", () => {
    expect(controlOf(renderControl({ showScaleFilter: false }))).toBeNull();
    expect(controlOf(renderControl({ totals: [] }))).toBeNull();
  });

  it("an untokened theme gets the pre-token literals", () => {
    const html = squash(controlOf(renderControl()));
    expect(html).toContain('<div class="mb-2 print:hidden" role="group" aria-label="Value axis scale">');
    expect(html).toContain('<div class="w-fit flex rounded-md p-1 divide-x border">');
    expect(html).toContain('class=" font-semibold px-2 py-1 cursor-pointer select-none text-xs text-blue-600 "');
    expect(html).toContain('class=" font-semibold px-2 py-1 cursor-pointer select-none text-xs text-gray-500 hover:text-gray-700 "');
    expect(html).toContain('<span class="font-normal">$332M</span>');
    // no lead-in label unless a theme styles one
    expect(html).not.toContain(">Scale<");
  });

  it("the library default theme renders exactly the untokened markup", () => {
    expect(controlOf(renderControl({ theme: avlGraphTheme.styles[0] })))
      .toBe(controlOf(renderControl({ theme: {} })));
  });

  it("legacy scaleWrapper/scaleItem copies in a theme are not read", () => {
    const legacy = { scaleWrapper: "LEGACY-WRAP", scaleItem: "LEGACY-ITEM", scaleItemActive: "LEGACY-ON", scaleItemInActive: "LEGACY-OFF" };
    expect(controlOf(renderControl({ theme: legacy }))).toBe(controlOf(renderControl({ theme: {} })));
  });

  it("every token reaches its element, and scaleFilterLabel turns on the lead-in", () => {
    const theme = {
      scaleFilterWrapper: "T-WRAP", scaleFilterLabel: "T-LABEL", scaleFilterTrack: "T-TRACK",
      scaleFilterItem: "T-ITEM", scaleFilterItemActive: "T-ON", scaleFilterItemInactive: "T-OFF",
      scaleFilterValue: "T-VALUE"
    };
    const html = squash(controlOf(renderControl({ theme, domainMax: 2e6 })));
    expect(html).toContain('<div class="T-WRAP print:hidden"');
    expect(html).toContain('<span class="T-LABEL">Scale</span>');
    expect(html).toContain('<div class="T-TRACK">');
    expect(html).toContain('class=" T-ITEM T-ON "');
    expect(html).toContain('class=" T-ITEM T-OFF "');
    expect(html).toContain('<span class="T-VALUE">$332M</span>');
  });
});
