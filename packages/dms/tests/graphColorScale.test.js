/**
 * Unit tests for buildValueColorScale — the shared value-scaled color-scale
 * builder used by GridGraph (value-per-cell) and BarGraph's `byValue` mode
 * (value-per-bar). Regression coverage for the domain/range length-mismatch
 * bug: a fixed 3-point [min, mid, max] domain against a longer N-color
 * palette silently truncated to that palette's first 3 entries.
 *
 * Run: npx vitest run tests/graphColorScale.test.js
 */

import { describe, it, expect } from "vitest";

import { buildValueColorScale } from "../src/ui/components/graph_new/components/utils.js";

// d3's color interpolator normalizes hex input to "rgb(r, g, b)" output even
// at exact domain breakpoints — compare colors by value, not by string form.
const hexToRgbString = hex => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${ (n >> 16) & 255 }, ${ (n >> 8) & 255 }, ${ n & 255 })`;
};

const parseRgb = rgbString => rgbString.match(/\d+/g).map(Number);

describe("buildValueColorScale", () => {

  it("returns undefined when min/max aren't finite (no data)", () => {
    expect(buildValueColorScale(Infinity, -Infinity, ["#000", "#fff"])).toBeUndefined();
    expect(buildValueColorScale(NaN, 10, ["#000", "#fff"])).toBeUndefined();
  });

  it("returns undefined when colors is empty/missing", () => {
    expect(buildValueColorScale(0, 10, [])).toBeUndefined();
    expect(buildValueColorScale(0, 10, undefined)).toBeUndefined();
  });

  it("a single color always wins, regardless of value", () => {
    const scale = buildValueColorScale(0, 100, ["#542788"]);
    expect(scale(0)).toBe(hexToRgbString("#542788"));
    expect(scale(100)).toBe(hexToRgbString("#542788"));
  });

  it("min === max (constant series) picks the palette's middle color", () => {
    const colors = ["#d7191c", "#fdae61", "#ffffbf", "#a6d96a", "#1a9641"];
    const scale = buildValueColorScale(5, 5, colors);
    expect(scale(5)).toBe(hexToRgbString("#ffffbf"));
  });

  // Regression: these two degenerate cases used to return bare functions
  // (no .domain()/.range()) — crashed the Legend's linear renderer, which
  // calls both unconditionally, the moment a BarGraph's byValue series had
  // just one color or a perfectly constant value (e.g. before real data
  // loads, or a route where every bar happens to be equal).
  it("degenerate cases still return a real scale — Legend calls .domain()/.range() unconditionally", () => {
    const single = buildValueColorScale(0, 100, ["#542788"]);
    expect(typeof single.domain).toBe("function");
    expect(typeof single.range).toBe("function");
    expect(single.domain()).toEqual([0, 100]);

    const constant = buildValueColorScale(5, 5, ["#d7191c", "#fdae61", "#ffffbf"]);
    expect(typeof constant.domain).toBe("function");
    expect(typeof constant.range).toBe("function");
    expect(constant.domain()).toEqual([5, 5]);
  });

  it("spans the FULL palette for a 9-color diverging scale — not just the first 3", () => {
    // report 1061's real color_range: 9-color purple->orange.
    const colors = ["#542788", "#8073ac", "#b2abd2", "#d8daeb", "#f7f7f7",
                     "#fee0b6", "#fdb863", "#e08214", "#b35806"];
    const scale = buildValueColorScale(0, 800, colors);
    // min -> first color, max -> last color: the old 3-point domain bug
    // could never reach anything past colors[2].
    expect(scale(0)).toBe(hexToRgbString(colors[0]));
    expect(scale(800)).toBe(hexToRgbString(colors[8]));
    // a value in the upper half must be able to reach the orange half of the
    // palette (colors[5..8]) — this is exactly what silently broke before.
    const interpolated = scale(700);
    expect(colors.slice(5).map(hexToRgbString)).toContain(interpolated);
  });

  it("spans the full palette for a 5-color diverging scale (report 1045's shape)", () => {
    const colors = ["#7b3294", "#c2a5cf", "#f7f7f7", "#a6dba0", "#008837"];
    const scale = buildValueColorScale(50, 70, colors);
    expect(scale(50)).toBe(hexToRgbString(colors[0]));
    expect(scale(70)).toBe(hexToRgbString(colors[4]));
    // green (colors[3]/[4]) must be reachable for a high value — previously
    // truncated to only ever interpolate within colors[0..2] (purple/
    // light-purple/white), which never produces a green-dominant color (G
    // never exceeds R there). A value 90% of the way to max must land in the
    // green half: G channel clearly above R.
    const [r, g] = parseRgb(scale(68));
    expect(g).toBeGreaterThan(r);
  });

});
