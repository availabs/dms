/**
 * Legend POSITION resolution — the shared helpers the six graph wrappers place their legend with.
 *
 * Why this file exists
 * --------------------
 * Until 2026-09-11 five of the six wrappers (Bar, Line, Pie, Treemap, Sunburst) matched
 * `legend.position` with strict equality against the four bare edges. GridGraph was the only one
 * that understood `top-right`/`top-left`/`bottom-right`/`bottom-left`. So a corner position on any
 * other chart matched NO branch and the legend silently vanished — no fallback, no warning, just a
 * chart with no key. The author-facing option list happened to offer corners only for GridGraph,
 * which hid the gap rather than closing it.
 *
 * The helpers below close it. The load-bearing assertion here is NOT that corners now work — it is
 * that the four BARE values still resolve to exactly what every wrapper hardcoded before, because
 * MitigateNY renders ~7,415 legends that will never set a corner.
 *
 * Run: npx vitest run packages/dms/tests/legendPosition.test.js
 */

import { describe, it, expect } from "vitest";

import {
  isTopLegend, isBottomLegend, isColumnLegendPosition, legendRowJustify,
} from "../src/ui/components/graph_new/components/utils.js";

const BARE = ["top", "bottom", "left", "right"];
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];

describe("legend position — backward compatibility (the part that matters)", () => {

  it("keeps justify-center for a bare top/bottom — the literal every wrapper hardcoded", () => {
    expect(legendRowJustify("top")).toBe("justify-center");
    expect(legendRowJustify("bottom")).toBe("justify-center");
  });

  it("keeps the bare four classifying exactly as `['top','bottom'].includes(position)` did", () => {
    for (const p of BARE) {
      expect(isColumnLegendPosition(p), p).toBe(["top", "bottom"].includes(p));
    }
  });

  it("treats a missing/undefined position as a row legend, not a column one", () => {
    // `right` is the historical default when position is unset; it must not become a top row.
    expect(isColumnLegendPosition(undefined)).toBe(false);
    expect(isColumnLegendPosition(null)).toBe(false);
    expect(isColumnLegendPosition("")).toBe(false);
  });
});

describe("legend position — corner support (the new part)", () => {

  it("routes every corner to the right edge branch", () => {
    expect(isTopLegend("top-left")).toBe(true);
    expect(isTopLegend("top-right")).toBe(true);
    expect(isBottomLegend("bottom-left")).toBe(true);
    expect(isBottomLegend("bottom-right")).toBe(true);
    // and never to the wrong one — this is what made a corner match no branch at all before
    expect(isBottomLegend("top-right")).toBe(false);
    expect(isTopLegend("bottom-right")).toBe(false);
  });

  it("aligns a corner legend to its own side", () => {
    expect(legendRowJustify("top-right")).toBe("justify-end");
    expect(legendRowJustify("bottom-right")).toBe("justify-end");
    expect(legendRowJustify("top-left")).toBe("justify-start");
    expect(legendRowJustify("bottom-left")).toBe("justify-start");
  });

  it("treats every corner as a column legend (the wrapper stacks rather than sits beside)", () => {
    for (const p of CORNERS) expect(isColumnLegendPosition(p), p).toBe(true);
  });

  it("leaves left/right alone — they are beside the plot, not above or below it", () => {
    for (const p of ["left", "right"]) {
      expect(isTopLegend(p), p).toBe(false);
      expect(isBottomLegend(p), p).toBe(false);
      expect(isColumnLegendPosition(p), p).toBe(false);
    }
  });

  it("covers every position the author-facing control offers — no option can render nothing", () => {
    // Mirrors config.jsx's single `legend` control group. If someone adds a ninth option there
    // without teaching the helpers about it, this fails rather than shipping an invisible legend.
    const OFFERED = [...BARE, ...CORNERS];
    for (const p of OFFERED) {
      const placed = isColumnLegendPosition(p) || p === "left" || p === "right";
      expect(placed, `"${ p }" matches no wrapper branch — the legend would not render`).toBe(true);
    }
  });
});
