/**
 * Unit tests for buildSpacedTickValues — the explicit tick-STEP generator behind
 * `yAxis.tickSpacing` in AxisLeft. Regression coverage for the incidents_v2
 * browser freeze: a section edit changed the y column from M veh-hrs (~4–10)
 * to raw veh-hrs (~4.3M–9.8M) while `tickSpacing: 2` stayed, and the unbounded
 * loop produced ~4.9 million tick values / DOM nodes, locking the main thread.
 * The helper must refuse absurd domain/step ratios and signal fallback (null)
 * so the axis reverts to d3's default approximate tick count.
 *
 * Run: npx vitest run tests/axisTickSpacing.test.js
 */

import { describe, it, expect } from "vitest";

import {
  buildSpacedTickValues,
  MAX_SPACED_TICKS,
} from "../src/ui/components/graph_new/components/utils.js";

describe("buildSpacedTickValues", () => {

  it("generates exact spaced ticks for a sane domain/step", () => {
    expect(buildSpacedTickValues(0, 10, 2)).toEqual([0, 2, 4, 6, 8, 10]);
  });

  it("starts at the first step multiple at/above the domain min", () => {
    expect(buildSpacedTickValues(3, 10, 2)).toEqual([4, 6, 8, 10]);
  });

  it("includes the top of the domain despite float accumulation", () => {
    const ticks = buildSpacedTickValues(0, 0.3, 0.1);
    expect(ticks.length).toBe(4);
    expect(ticks[3]).toBeCloseTo(0.3);
  });

  it("returns null when the domain/step ratio exceeds the cap (regression: 0–9.8M at step 2)", () => {
    expect(buildSpacedTickValues(0, 9786360, 2)).toBeNull();
  });

  it("honors the cap boundary", () => {
    expect(buildSpacedTickValues(0, MAX_SPACED_TICKS, 1)).not.toBeNull();
    expect(buildSpacedTickValues(0, MAX_SPACED_TICKS + 1, 1)).toBeNull();
  });

  it("returns null for zero, negative, or non-numeric steps", () => {
    expect(buildSpacedTickValues(0, 10, 0)).toBeNull();
    expect(buildSpacedTickValues(0, 10, -2)).toBeNull();
    expect(buildSpacedTickValues(0, 10, NaN)).toBeNull();
  });

  it("returns null for a non-finite or inverted domain", () => {
    expect(buildSpacedTickValues(0, Infinity, 2)).toBeNull();
    expect(buildSpacedTickValues(NaN, 10, 2)).toBeNull();
    expect(buildSpacedTickValues(10, 0, 2)).toBeNull();
  });
});
