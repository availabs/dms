/**
 * Forward coverage for the legend's Layer-A class-string tokens.
 *
 * `tests/legendLegacyProps.test.js` proves an UNSET token changes nothing. This file proves a
 * SET token does the right thing — and, just as importantly, that it does not take the
 * structural classes with it. The contract each case pins:
 *
 *   a token replaces the LOOK it names, and never the STRUCTURE around it
 *
 * `absolute` / `whitespace-nowrap` (tick anchoring), `min-w-0 truncate` (label), `shrink-0`
 * (swatch and vertical ramp) and the grid/flex orientation classes are what keep a legend
 * inside its own box. A brand that could delete them would reintroduce exactly the clipping
 * the geometry pass fixed — a terminal tick label rendering ~42px outside a rounded, clipping
 * card. So they are emitted outside the token, and these tests say so out loud.
 *
 * Run: npx vitest run packages/dms/tests/legendThemeTokens.test.js
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Legend } from "../src/ui/components/graph_new/components/avl-graph/components/Legend.jsx";
import { buildValueColorScale } from "../src/ui/components/graph_new/components/utils.js";

const RAMP = ["#2166ac", "#67a9cf", "#d1e5f0", "#fddbc7", "#ef8a62", "#b2182b"];
const scale = buildValueColorScale(0, 47.5, RAMP);

const render = props => renderToStaticMarkup(React.createElement(Legend, props));

const categorical = classNames => render({
  type: "categorical", orientation: "vertical", size: "medium",
  categories: ["A", "B"], colors: RAMP, actions: [], classNames
});
const categoricalRow = classNames => render({
  type: "categorical", orientation: "horizontal", size: "medium",
  categories: ["A"], colors: RAMP, actions: [], classNames
});
const linearH = classNames => render({
  type: "linear", orientation: "horizontal", size: "medium",
  scale, format: d => `${ Math.round(d) }`, actions: [], classNames
});
const linearV = classNames => render({
  type: "linear", orientation: "vertical", size: "medium",
  scale, format: d => `${ Math.round(d) }`, actions: [], classNames
});

describe("legend Layer-A class tokens", () => {

  it("an absent classNames object behaves exactly like an empty one", () => {
    // The realistic MitigateNY case is `classNames` present-but-all-undefined (GraphComponent
    // always injects the object, whether or not the theme fills it) — but a direct consumer
    // that predates the prop passes nothing at all. Both must land in the same place.
    expect(categorical(undefined)).toBe(categorical({}));
    expect(linearH(undefined)).toBe(linearH({}));
    expect(linearV(undefined)).toBe(linearV({}));
  });

  it("a partially-filled classNames leaves the untouched tokens historical", () => {
    const out = categorical({ swatch: "size-2 rounded-full" });
    expect(out).toContain("size-2 rounded-full");
    expect(out).not.toContain("w-4 h-4 rounded mr-1");
    // …while the label and container are untouched:
    expect(out).toContain(`class="min-w-0 truncate"`);
    expect(out).toContain(`class="px-4 grid grid-cols-1 gap-1"`);
  });

  describe("swatch", () => {
    it("replaces the swatch look", () => {
      // transportny's authored intent is a thin rule, not a block — which only works as a
      // replacement, since `h-0.5` and `h-4` would otherwise both be in play.
      const out = categorical({ swatch: "h-0.5 w-4" });
      expect(out).toContain(`class="h-0.5 w-4 flex-shrink-0"`);
      expect(out).not.toContain("h-4 rounded mr-1");
    });
    it("keeps flex-shrink-0 no matter what the token says", () => {
      expect(categorical({ swatch: "h-0.5 w-4" })).toContain("flex-shrink-0");
    });
  });

  describe("label", () => {
    it("appends to the structural classes rather than replacing them", () => {
      // Nothing in the label's default is decorative, so there is nothing to replace —
      // both `min-w-0` and `truncate` must survive or long labels stop truncating.
      const out = categorical({ label: "text-[11px] text-slate-500" });
      expect(out).toContain(`class="min-w-0 truncate text-[11px] text-slate-500"`);
    });
  });

  describe("row", () => {
    it("replaces spacing/typography but keeps the vertical grid layout", () => {
      const out = categorical({ row: "gap-4 text-slate-500" });
      expect(out).toContain(`class="gap-4 text-slate-500 grid grid-cols-1"`);
      expect(out).not.toContain("px-4 grid grid-cols-1 gap-1");
    });
    it("replaces spacing/typography but keeps the horizontal flex layout", () => {
      const out = categoricalRow({ row: "gap-4" });
      expect(out).toContain(`class="gap-4 flex flex-wrap items-center justify-left"`);
    });
    it("is IGNORED by both linear (gradient) legends", () => {
      // Regression guard for a live break on 2026-09-10. `row` means "the categorical
      // legend's row of items". transportny had authored `legend: "flex items-center gap-4 …"`
      // long before the tokens were wired; landing that `flex` on the gradient container made
      // the `width: 100%` ramp shrink-wrap, so it stopped spanning the box the absolutely
      // positioned tick labels are placed against and the labels landed back on the colour —
      // the exact defect the geometry pass removed. A brand can't know which variant its token
      // reaches, so the gradient container stays component-owned; `tick` and `ramp` are the
      // surfaces that reach it.
      expect(linearH({ row: "flex items-center gap-4" })).toContain(`class="relative w-full min-w-0"`);
      expect(linearH({ row: "flex items-center gap-4" })).not.toContain("gap-4");
      expect(linearV({ row: "flex items-center gap-4" })).toContain(`class="relative flex w-fit"`);
      expect(linearV({ row: "flex items-center gap-4" })).not.toContain("gap-4");
    });
  });

  describe("tick", () => {
    it("replaces tabular-nums but keeps the anchoring classes", () => {
      const out = linearH({ tick: "text-[10px] text-slate-400 tabular-nums" });
      expect(out).toContain(`class="absolute whitespace-nowrap text-[10px] text-slate-400 tabular-nums"`);
    });
    it("cannot drop `absolute` or `whitespace-nowrap`, even if the token omits them", () => {
      // This is the clipping guard. A tick that loses `absolute` leaves the flow and the
      // ramp's geometry collapses; one that loses `whitespace-nowrap` wraps mid-number.
      for (const html of [linearH({ tick: "text-slate-400" }), linearV({ tick: "text-slate-400" })]) {
        expect(html).toContain("absolute whitespace-nowrap text-slate-400");
      }
    });
  });

  describe("ramp", () => {
    it("replaces the radius on the horizontal ramp", () => {
      const out = linearH({ ramp: "rounded-full ring-1 ring-slate-950/10" });
      expect(out).toContain(`class="rounded-full ring-1 ring-slate-950/10"`);
    });
    it("replaces the radius on the vertical ramp but keeps shrink-0", () => {
      const out = linearV({ ramp: "rounded-full" });
      expect(out).toContain(`class="rounded-full shrink-0"`);
    });
  });

  describe("title (the unit slot)", () => {
    const titled = (extra = {}) => render({
      type: "linear", orientation: "horizontal", size: "medium",
      scale, format: d => `${ Math.round(d) }`, actions: [], ...extra
    });

    it("renders nothing extra when no title is set", () => {
      // The whole reason the title wraps rather than nests: an untitled legend's DOM must be
      // unchanged. legendLegacyProps.test.js proves that byte for byte; this states the intent.
      expect(titled()).not.toContain("truncate");
    });

    it("renders the title above the ramp, not on it", () => {
      const out = titled({ title: "mph" });
      // the title must come BEFORE the gradient in document order
      expect(out.indexOf("mph")).toBeLessThan(out.indexOf("linear-gradient"));
    });

    it("truncates a long title so it cannot widen the legend", () => {
      // A title that grows the legend would push the chart around — the exact cost this design
      // was chosen to avoid.
      expect(titled({ title: "Average Hours of Delay per Vehicle" })).toContain(`class="truncate"`);
    });

    it("takes the legendTitle class token", () => {
      expect(titled({ title: "mph", classNames: { title: "text-[10px] text-slate-400" } }))
        .toContain(`class="truncate text-[10px] text-slate-400"`);
    });

    it("does NOT change the tick labels (the point of putting the unit up top)", () => {
      // Ticks must stay exactly as wide as they were, or fitRampTicks starts dropping them.
      const withT = titled({ title: "mph" });
      const withoutT = titled();
      const ticks = h => (h.match(/absolute whitespace-nowrap[^>]*>([^<]*)</g) || []).join("|");
      expect(ticks(withT)).toBe(ticks(withoutT));
    });

    it("titles the vertical legend too", () => {
      const out = render({
        type: "linear", orientation: "vertical", size: "medium",
        scale, format: d => `${ Math.round(d) }`, actions: [], title: "minutes"
      });
      expect(out.indexOf("minutes")).toBeLessThan(out.indexOf("linear-gradient"));
    });

    it("is ignored by the categorical legend (linear-only for now)", () => {
      const out = render({
        type: "categorical", orientation: "vertical", size: "medium",
        categories: ["A"], colors: RAMP, actions: [], title: "mph"
      });
      expect(out).not.toContain("mph");
    });
  });

  it("still renders nothing when there is no usable ramp, tokens or not", () => {
    // A theme must not be able to resurrect the fabricated 0/0.25/0.5/0.75/1 key.
    expect(render({
      type: "linear", orientation: "horizontal", size: "medium", actions: [],
      classNames: { ramp: "rounded-full", tick: "text-slate-400", row: "text-slate-500" }
    })).toBe("");
  });
});
