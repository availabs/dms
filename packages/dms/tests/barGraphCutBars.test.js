/**
 * avl-graph BarGraph: bars taller than a Domain Max are clipped to the plot and marked cut.
 *
 * A crop (an author's yAxis Domain Max, or a Scale Filter stop) below the tallest bar used to
 * let that bar run on through the top margin and stop wherever the SVG ended, so it read as a
 * bar that happened to end there. Pinned here:
 *   - no Domain Max, or one every bar fits under: no clipPath, no marks (unchanged render);
 *   - stacked: one torn-edge mark per bar whose positive sum exceeds the crop, across the bar;
 *   - grouped: one mark per series bar over the crop;
 *   - horizontal: the mark sits at the plot's right edge instead of its top.
 *
 * The chart only lays out once it has a measured size, so the hook that measures it is stubbed
 * to a fixed 600×300. vitest's `happy-dom` environment can't be loaded from the workspace root
 * (the package lives under packages/dms/node_modules), so the window is built here instead.
 *
 * Run: npx vitest run src/dms/packages/dms/tests/barGraphCutBars.test.js
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { Window } from "happy-dom";

vi.mock("../src/ui/components/graph_new/components/avl-graph/utils/index.js", async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, useSetSize: () => ({ width: 600, height: 300 }) };
});

let window, React, act, createRoot, BarGraph;

beforeAll(async () => {
  window = new Window({ url: "http://localhost/" });
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = (await import("react")).default;
  ({ act } = await import("react"));
  ({ createRoot } = await import("react-dom/client"));
  ({ BarGraph } = await import("../src/ui/components/graph_new/components/avl-graph/BarGraph.jsx"));
});

afterAll(async () => {
  await window.happyDOM.abort();
  window.close();
});

const DATA = [
  { index: "a", x: 100, y: 50 },   // stacked total 150
  { index: "b", x: 10, y: 5 },     // 15
  { index: "c", x: 30, y: 0 }      // 30
];

const render = async props => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(BarGraph, {
      data: DATA,
      keys: ["x", "y"],
      colors: ["#111", "#222"],
      margin: { top: 20, right: 20, bottom: 50, left: 100 },
      axisBottom: {},
      axisLeft: {},
      hoverComp: { show: false },
      ...props
    }));
  });
  const out = {
    clipPaths: host.querySelectorAll("clipPath").length,
    clipped: host.querySelectorAll("g[clip-path]").length,
    marks: [...host.querySelectorAll("path.avl-cut")].map(p => p.getAttribute("d")),
    stroke: host.querySelector("path.avl-cut")?.getAttribute("stroke")
  };
  await act(async () => root.unmount());
  host.remove();
  return out;
};

// Plot is 600 − 100 − 20 = 480 wide, 300 − 20 − 50 = 230 tall.
const yOf = d => [...d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map(m => +m[2]);
const xOf = d => [...d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map(m => +m[1]);

describe("avl-graph BarGraph cut bars", () => {

  it("no Domain Max: no clip, no marks", async () => {
    expect(await render({})).toMatchObject({ clipPaths: 0, clipped: 0, marks: [] });
  });

  it("a Domain Max every bar fits under: no clip, no marks", async () => {
    expect(await render({ axisLeft: { domainMax: 200 } })).toMatchObject({ clipPaths: 0, clipped: 0, marks: [] });
  });

  it("an empty Domain Max input is no crop", async () => {
    expect(await render({ axisLeft: { domainMax: "" } })).toMatchObject({ clipPaths: 0, marks: [] });
  });

  it("stacked: one mark per bar whose total exceeds the crop, at the plot top", async () => {
    const out = await render({ axisLeft: { domainMax: 20 } });
    expect(out.clipPaths).toBe(1);
    expect(out.clipped).toBe(1);
    expect(out.marks).toHaveLength(2);                      // bars a (150) and c (30); b (15) fits
    for (const d of out.marks) {
      expect(Math.min(...yOf(d))).toBeCloseTo(3.5);         // 7px inset ± 3.5px teeth
      expect(Math.max(...yOf(d))).toBeCloseTo(10.5);
    }
    expect(out.stroke).toBe("#ffffff");
  });

  it("a stacked bar's height is its positive sum", async () => {
    // bar a: 100 + 50 = 150 > 120 even though neither segment alone is.
    expect((await render({ axisLeft: { domainMax: 120 } })).marks).toHaveLength(1);
  });

  it("grouped: one mark per series bar over the crop", async () => {
    const out = await render({ groupMode: "grouped", axisLeft: { domainMax: 40 } });
    expect(out.marks).toHaveLength(2);                      // a.x (100) and a.y (50)
  });

  it("horizontal: the mark sits at the plot's right edge", async () => {
    const out = await render({ orientation: "horizontal", axisLeft: {}, axisBottom: { domainMax: 20 } });
    expect(out.marks).toHaveLength(2);
    for (const d of out.marks) {
      expect(Math.min(...xOf(d))).toBeCloseTo(480 - 7 - 3.5);
      expect(Math.max(...xOf(d))).toBeCloseTo(480 - 7 + 3.5);
    }
  });

  it("the mark takes the chart's background colour", async () => {
    expect((await render({ axisLeft: { domainMax: 20 }, bgColor: "#123456" })).stroke).toBe("#123456");
  });
});
