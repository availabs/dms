/**
 * BarGraph's time x-axis (graph `xAxis.scaleType: 'time'`, labels "m/dd" from GraphComponent).
 *
 * Two defects on that path, found on the QA Tickets "Done / day" chart (2026-10-05):
 *   - d3 ticks a short range every few hours, so each day's label printed two or more times;
 *   - a date-only "YYYY-MM-DD" parsed as UTC midnight, so west of UTC a day's bar sat on the
 *     previous evening, hours left of the local-midnight tick that labels it.
 * Contract pinned here: date-only values are local midnight; repeated labels collapse to the
 * day-boundary ticks; ticks whose labels are already distinct come back untouched.
 *
 * Run: npx vitest run packages/dms/tests/barGraphTimeAxis.test.js
 */
process.env.TZ = "America/New_York";

import { describe, it, expect } from "vitest";
import { scaleTime } from "d3-scale";
import { toTimeValue, timeAxisTickValues } from "../src/ui/components/graph_new/components/avl-graph/utils/index.js";

const dayLabel = d => `${ d.getMonth() + 1 }/${ String(d.getDate()).padStart(2, "0") }`;
// BarGraph's domain: the data extent padded by half the smallest gap (1-day fallback).
const scaleFor = (days) => {
  const nums = days.map(d => +toTimeValue(d));
  const lo = Math.min(...nums), hi = Math.max(...nums);
  const u = [...new Set(nums)].sort((a, b) => a - b);
  let gap = Infinity;
  for (let i = 1; i < u.length; i++) gap = Math.min(gap, u[i] - u[i - 1]);
  if (!isFinite(gap) || gap <= 0) gap = (hi - lo) || 86400000;
  return scaleTime().domain([new Date(lo - gap / 2), new Date(hi + gap / 2)]).range([0, 500]);
};
const labelsFor = (days) => {
  const s = scaleFor(days);
  return timeAxisTickValues(s.ticks(), dayLabel).map(dayLabel);
};

describe("toTimeValue", () => {
  it("reads a date-only string as local midnight", () => {
    const d = toTimeValue("2026-09-24");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 8, 24, 0]);
  });
  it("leaves timestamps, numbers and Dates to Date", () => {
    expect(+toTimeValue("2026-09-24T12:30:00Z")).toBe(Date.UTC(2026, 8, 24, 12, 30));
    expect(+toTimeValue(0)).toBe(0);
    const d = new Date(2026, 0, 1);
    expect(+toTimeValue(d)).toBe(+d);
  });
});

describe("timeAxisTickValues: one label per day", () => {
  it("one day of data: a single tick, on that day", () => {
    expect(labelsFor(["2026-09-24"])).toEqual(["9/24"]);
  });
  it("two days: each day once", () => {
    expect(labelsFor(["2026-09-24", "2026-09-25"])).toEqual(["9/24", "9/25"]);
  });
  it("the kept ticks sit exactly on the bars (local midnight)", () => {
    const s = scaleFor(["2026-09-24", "2026-09-25"]);
    const ticks = timeAxisTickValues(s.ticks(), dayLabel);
    expect(ticks.map(t => s(t))).toEqual(["2026-09-24", "2026-09-25"].map(d => s(toTimeValue(d))));
  });
  it("a week of daily ticks is already distinct and comes back as d3 made it", () => {
    const s = scaleFor(["2026-09-24", "2026-09-26", "2026-09-30"]);
    const ticks = s.ticks();
    expect(timeAxisTickValues(ticks, dayLabel)).toBe(ticks);
  });
  it("a range that crosses no midnight keeps the first tick of each label", () => {
    const s = scaleTime().domain([new Date(2026, 8, 24, 9), new Date(2026, 8, 24, 17)]);
    expect(timeAxisTickValues(s.ticks(), dayLabel).map(dayLabel)).toEqual(["9/24"]);
  });
  it("an hour-level format keeps every tick", () => {
    const s = scaleTime().domain([new Date(2026, 8, 24, 9), new Date(2026, 8, 24, 17)]);
    const ticks = s.ticks();
    expect(timeAxisTickValues(ticks, d => `${ d.getHours() }h`)).toBe(ticks);
  });
  it("no format: ticks unchanged", () => {
    const ticks = scaleFor(["2026-09-24"]).ticks();
    expect(timeAxisTickValues(ticks, undefined)).toBe(ticks);
  });
});
