/**
 * Unit tests for buildValueDomain — the value-axis [min, max] behind the avl-graph
 * LineGraph's left and secondary axes.
 *
 * Regression coverage for the difference-mode clipping bug: a graph with two
 * comparison-series routes renders fine, but switching it to difference mode makes
 * every value signed (Main − Compare). The old domain pinned the floor at
 * `aLeft.min` (DefaultAxis.min = 0) and only ever took a MAX, so the negative half
 * of the line was drawn below the plot area and outside the section bounds.
 *
 * The back-compat half of this file matters as much as the fix: for all-positive
 * data the new domain must equal the old one exactly, so ordinary graphs don't
 * shift. `oldBuildValueDomain` below is the pre-fix implementation, verbatim, used
 * as an oracle.
 *
 * Run: npx vitest run tests/lineGraphValueDomain.test.js
 */

import { describe, it, expect } from "vitest";

import {
  buildValueDomain,
  DefaultAxis,
} from "../src/ui/components/graph_new/components/avl-graph/utils/index.js";

// The pre-fix implementation, kept verbatim as a back-compat oracle.
const oldBuildValueDomain = (series, axisMin = 0) =>
  series.reduce((a, c) => {
    const y = c.data.reduce((a, c) => Math.max(a, +c.y), 0);
    if (!isNaN(y)) {
      return [axisMin, Math.max(y, a.length ? a[1] : 0)];
    }
    return a;
  }, []);

const series = (...ys) => ({ data: ys.map((y, i) => ({ x: i, y })) });

describe("buildValueDomain", () => {

  describe("the difference-mode fix", () => {

    it("drops the floor to the data minimum for a signed series (regression)", () => {
      expect(buildValueDomain([series(-12, 4, -7, 21)])).toEqual([-12, 21]);
    });

    it("keeps a zero ceiling when every value is negative", () => {
      expect(buildValueDomain([series(-12, -4, -7)])).toEqual([-12, 0]);
    });

    it("takes the floor from whichever series goes lowest", () => {
      expect(buildValueDomain([series(3, 9), series(-5, 2), series(-1, 40)]))
        .toEqual([-5, 40]);
    });

    it("spans zero even when the signed series is not the first one", () => {
      const [lo, hi] = buildValueDomain([series(10, 20), series(-3, 5)]);
      expect(lo).toBe(-3);
      expect(hi).toBe(20);
    });

    it("honors a non-zero axis min as the floor only while the data stays above it", () => {
      expect(buildValueDomain([series(30, 50)], 10)).toEqual([10, 50]);
      expect(buildValueDomain([series(-4, 50)], 10)).toEqual([-4, 50]);
    });
  });

  describe("back-compat: all-positive data is untouched", () => {

    const positiveCases = [
      [[series(1, 2, 3)], 0],
      [[series(0, 0, 0)], 0],
      [[series(4.5, 9.25)], 0],
      [[series(1, 2), series(30, 4), series(7)], 0],
      [[series(1e6, 2e6)], 0],
      [[series(30, 50)], 10],
      [[], 0],
      [[series(1, 2), { data: [] }], 0],
    ];

    it.each(positiveCases)("matches the pre-fix domain (case %#)", (input, axisMin) => {
      expect(buildValueDomain(input, axisMin)).toEqual(oldBuildValueDomain(input, axisMin));
    });

    it("matches the pre-fix domain across randomized all-positive series", () => {
      let seed = 7;
      const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      for (let n = 0; n < 200; n++) {
        const input = Array.from({ length: 1 + Math.floor(rand() * 4) }, () =>
          series(...Array.from({ length: 1 + Math.floor(rand() * 6) }, () => rand() * 100))
        );
        expect(buildValueDomain(input)).toEqual(oldBuildValueDomain(input));
      }
    });
  });

  describe("preserved edge-case semantics", () => {

    it("returns an empty domain for no series", () => {
      expect(buildValueDomain([])).toEqual([]);
    });

    it("skips a series containing a non-numeric y, whole (long-standing behavior)", () => {
      const input = [series(1, "abc", 500), series(2, 8)];
      expect(buildValueDomain(input)).toEqual([0, 8]);
      expect(buildValueDomain(input)).toEqual(oldBuildValueDomain(input));
    });

    it("returns an empty domain when every series is skipped", () => {
      expect(buildValueDomain([series("abc")])).toEqual([]);
    });

    it("treats null as zero, the way unary + does", () => {
      expect(buildValueDomain([series(null, 5)])).toEqual([0, 5]);
    });

    it("defaults its floor to DefaultAxis.min", () => {
      expect(DefaultAxis.min).toBe(0);
      expect(buildValueDomain([series(5, 9)])).toEqual([0, 9]);
    });
  });
});
