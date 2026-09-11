/**
 * Back-compat lock for `ViewSectionHeader`'s RENDERED MARKUP.
 *
 * Why this file exists
 * --------------------
 * Until now the section header band was 100% hardcoded — a 50px row, `font-display
 * font-medium uppercase`, and a title class of `w-full ${theme.heading[level]}`. No theme
 * could reach any of it. The graph-card header work adds a token layer so a brand can style
 * that band (see planning/transportny/tasks/current/report-graph-card-header-and-titles.md).
 *
 * The blast radius is not npmrds. It is **MitigateNY: 154,632 component rows with a non-empty
 * `title`**, none of which will ever set one of the new tokens. If the band renders one class
 * differently than it did before, that is 154,632 pages regressed, and no npmrds report probe
 * would catch it.
 *
 * So: this asserts the **exact rendered HTML** against goldens captured from the code as it
 * stood BEFORE the token layer. Not "the tokens are accepted" — the actual markup, class
 * strings and all. A token that is unset must resolve to the historical literal, byte for byte.
 *
 * Deliberately no jsdom / @testing-library — `react-dom/server`'s renderToStaticMarkup needs
 * no DOM, so this adds zero dependencies (same convention as legendLegacyProps.test.js).
 *
 * Run: npx vitest run packages/dms/tests/viewSectionHeaderLegacy.test.js
 * Regenerating goldens is a DELIBERATE act: it means you intend to change what every existing
 * site's section header looks like. Do not do it to make a red test green.
 */

import { describe, it, expect } from "vitest";

import { CASES, render } from "./fixtures/viewSectionHeaderCases.jsx";
import GOLDENS from "./fixtures/viewSectionHeaderLegacy.golden.json" with { type: "json" };

describe("ViewSectionHeader — pre-token-layer markup", () => {

  it("covers every golden, and every golden has a case (no silent drift)", () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(GOLDENS).sort());
  });

  for (const [name, props] of Object.entries(CASES)) {
    it(`renders byte-identically to the pre-token golden: ${ name }`, () => {
      const golden = GOLDENS[name];
      expect(golden, `no golden captured for "${ name }"`).toBeDefined();
      expect(render(props)).toBe(golden);
    });
  }

  // The goldens would also pass if the header rendered one blank div for everything, so pin
  // the load-bearing literals by name. These are the exact strings MitigateNY depends on.
  describe("literals every existing site depends on", () => {
    const html = () => render(CASES["title only, no level"]);

    it("keeps the historical outer band classes (50px min-height)", () => {
      expect(html()).toContain(`class="flex w-full min-h-[50px] items-center pb-2"`);
    });
    it("keeps the historical inner row classes", () => {
      expect(html()).toContain(
        `class="flex-1 flex flex-row pb-2 font-display font-medium uppercase scroll-mt-36 items-center"`);
    });
    it("keeps the legacy #Title anchor id with spaces replaced by underscores", () => {
      expect(render(CASES["title with spaces (legacy #anchor id)"]))
        .toContain(`id="#Average_Speed_by_TMC_by_5-Minute_Epoch"`);
    });
    it("passes w-full + the resolved heading class to the title component", () => {
      expect(render(CASES["title + level 1 (core blue heading)"]))
        .toContain(`class="w-full text-blue-500 font-bold text-xl tracking-wider py-1 pl-1"`);
    });
    it("renders no info pill for an empty help doc", () => {
      expect(render(CASES["title + empty help doc (renders no info pill)"])).not.toContain("data-help");
    });
  });
});
