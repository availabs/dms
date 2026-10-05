/**
 * The `qa` install's pages speak the library default theme's vocabulary: every text style,
 * section size, group theme and pill colour they name is one the default theme defines, so an
 * install reads the same on any site that keeps the defaults (and nothing silently falls back
 * to a TransportNY-only token).
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaDefaultTheme.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { buildQaPages } from "../src/patterns/qa/pages";
import { textSettingsTheme } from "../src/ui/themes/textSettings";
import { sectionArrayTheme } from "../src/patterns/page/components/sections/sectionArray.theme";
import { layoutGroupTheme } from "../src/ui/components/LayoutGroup.theme";
import { pillTheme } from "../src/ui/components/Pill.theme";

const datasets = Object.fromEntries(["tickets", "pages", "stories", "patterns", "history"]
  .map((key, i) => [key, { slug: `qa_${key}`, source_id: 10 + 2 * i, view_id: 11 + 2 * i }]));
const pattern = { name: "QA", dmsEnvId: 42, qa: { version: 1, datasets } };
const sites = [{ pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: "1", enabled: "yes" }];
const pages = buildQaPages(pattern, {
  app: "qa_test", baseUrl: "/qa", sites, siteLabels: { alphapage: "Alpha" }, datasetPatterns: [{ pattern_type: "datasets", dmsEnvId: 42, base_url: "data" }],
});

// Every value under `key` anywhere in the pages, element-data (and the lexical state inside it) included.
const collect = (key) => {
  const out = [];
  const walk = (v) => {
    if (typeof v === "string" && v.startsWith("{")) {
      try { walk(JSON.parse(v)); } catch { /* not JSON */ }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      Object.entries(v).forEach(([k, x]) => (k === key ? out.push(x) : walk(x)));
    }
  };
  walk(pages);
  return out;
};

const TEXT_KEYS = new Set(Object.keys(textSettingsTheme.styles[0]));

describe("qa pages on the default theme", () => {
  it("name only default text styles", () => {
    // 'button' is Card's own link-button switch, not a theme key.
    const used = [...collect("valueFontStyle"), ...collect("headerFontStyle"), ...collect("styleKey")];
    expect(used.length).toBeGreaterThan(20);
    expect([...new Set(used)].filter((k) => k !== "button" && !TEXT_KEYS.has(k))).toEqual([]);
  });

  it("size sections with the default grid's fractions", () => {
    const sizes = new Set(Object.keys(sectionArrayTheme.styles[0].sizes));
    const used = pages.flatMap((p) => p.sections.map((s) => s.size)).filter(Boolean);
    expect([...new Set(used)].filter((s) => !sizes.has(s))).toEqual([]);
  });

  it("put every group in a default layout-group style", () => {
    const names = new Set(layoutGroupTheme.styles.map((s) => s.name));
    pages.forEach((p) => p.section_groups.forEach((g) => expect(names.has(g.theme)).toBe(true)));
  });

  it("colour pills with default pill styles", () => {
    const names = new Set(pillTheme.styles.map((s) => s.name));
    const used = collect("pillColors").flatMap((m) => Object.values(m));
    expect(used.length).toBeGreaterThan(10);
    expect([...new Set(used)].filter((c) => !names.has(c))).toEqual([]);
  });
});
