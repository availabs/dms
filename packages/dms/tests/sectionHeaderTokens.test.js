/**
 * The NEW half of the section-header token layer: that the tokens actually do something.
 *
 * Its sibling `viewSectionHeaderLegacy.test.js` asserts the opposite and more important thing —
 * that a theme setting NONE of these renders byte-identically to the pre-token markup. Both are
 * needed: goldens alone would pass if the tokens were silently ignored, and these alone would
 * pass while every MitigateNY page quietly changed.
 *
 * Run: npx vitest run packages/dms/tests/sectionHeaderTokens.test.js
 */

import { describe, it, expect } from "vitest";
import React from "react";

import { render } from "./fixtures/viewSectionHeaderCases.jsx";

const HEADING = { default: "" };
const base = { theme: { heading: HEADING }, helpTextArray: [] };

// The shape transportny's report-card style actually sets (see themev2.js `pages.section`
// styles — name 'reportCard'): one 40px bordered row, title left, meta right.
const CARD = {
  headerRow:       "flex w-full items-center gap-2 h-10 pl-4 pr-10 border-b border-zinc-950/10",
  headerInner:     "flex-1 min-w-0 flex flex-row items-center gap-3",
  headerTitleWrap: "flex-1 min-w-0",
  headerTitle:     "font-display font-medium text-[15px] text-[#0F1722] truncate",
  headerKicker:    "shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-400",
  headerActions:   "flex items-center shrink-0",
  headerExtensionsInline: true,
};

const pill = React.createElement("button", { "data-qc": "measure" }, "speed");

describe("ViewSectionHeader — header band tokens", () => {

  it("replaces the 50px band with the style's own row classes", () => {
    const html = render({ ...base, value: { title: "Average speed by month" }, sectionTheme: CARD });
    expect(html).toContain(`class="${ CARD.headerRow }"`);
    expect(html).not.toContain("min-h-[50px]");
  });

  it("APPENDS headerTitle to the historical heading class rather than replacing it", () => {
    const html = render({
      theme: { heading: { ...HEADING, "2": "text-lg tracking-wider" } },
      helpTextArray: [],
      value: { title: "Average speed by month", level: "2" },
      sectionTheme: CARD,
    });
    // Both survive: the site's own heading map AND the brand's card title token.
    expect(html).toContain(`class="w-full text-lg tracking-wider ${ CARD.headerTitle }"`);
  });

  it("renders the kicker from the section's description when the token is set", () => {
    const html = render({
      ...base,
      value: { title: "Average speed by month", description: "speed · monthly · all day" },
      sectionTheme: CARD,
    });
    expect(html).toContain("speed · monthly · all day");
    expect(html).toContain(CARD.headerKicker);
  });

  it("renders NO kicker when the description is set but the token is not", () => {
    const html = render({
      ...base,
      value: { title: "Average speed by month", description: "speed · monthly · all day" },
      sectionTheme: { ...CARD, headerKicker: "" },
    });
    expect(html).not.toContain("speed · monthly · all day");
  });

  it("renders NO kicker when the token is set but the section has no description", () => {
    const html = render({ ...base, value: { title: "Average speed by month" }, sectionTheme: CARD });
    expect(html).not.toContain(CARD.headerKicker);
  });

  describe("header extensions", () => {
    it("pulls extensions into the band when headerExtensionsInline is true", () => {
      const html = render({
        ...base, value: { title: "Average speed by month" },
        sectionTheme: CARD, headerExtensions: [pill],
      });
      expect(html).toContain(`data-qc="measure"`);
      expect(html).toContain(CARD.headerExtensionsInline ? "shrink-0 flex items-center gap-1.5" : "");
    });

    it("ignores extensions when the style has not opted in (they stay on section.jsx's own row)", () => {
      const html = render({
        ...base, value: { title: "Average speed by month" },
        sectionTheme: { ...CARD, headerExtensionsInline: false }, headerExtensions: [pill],
      });
      expect(html).not.toContain(`data-qc="measure"`);
    });

    // Regression lock. An earlier version hid the kicker whenever `headerExtensions` was
    // non-empty — but an extension builder returns a node whose component may render `null`
    // (npmrds' Quick Controls return null outside page-edit mode), so a non-empty array is not
    // evidence that anything is drawn. That inference blanked the meta line on every report card
    // in view mode, the one mode it exists for. Both share the slot; a theme that wants the
    // kicker to yield on a narrow card says so with a breakpoint in the token.
    it("keeps the kicker when inline extensions are also present", () => {
      const html = render({
        ...base,
        value: { title: "Average speed by month", description: "speed · monthly · all day" },
        sectionTheme: CARD, headerExtensions: [pill],
      });
      expect(html).toContain(`data-qc="measure"`);
      expect(html).toContain("speed · monthly · all day");
    });
  });

  it("lets a theme deliberately zero a token instead of falling back to the default", () => {
    const html = render({
      ...base, value: { title: "x" },
      sectionTheme: { ...CARD, headerRow: "" },
    });
    expect(html).toContain(`<div class="">`);
    expect(html).not.toContain("min-h-[50px]");
  });
});
