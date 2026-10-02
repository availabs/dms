/**
 * Track-on-publish (phase 4): publishing a page in a sub-site a QA install covers adds it to the
 * install's pages dataset. The module is shared by the page editor's Publish and
 * `dms page publish`, so it's tested here with fake reads and writes.
 *
 * See planning/tasks/current/qa-pattern-type.md, "Phase 4".
 *
 * Run: npx vitest run packages/dms/tests/qaTracking.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { trackPublishedPage, trackedPageRow, coveredSites, slugAllowed, coversPattern } from "../src/patterns/qa/tracking";

const refs = (n) => ({
  patterns: { slug: `${n}_patterns`, source_id: 1, view_id: 2 },
  pages: { slug: `${n}_pages`, source_id: 3, view_id: 4 },
});
const install = (name, rows, existingKeys = []) => ({ name, qa: { datasets: refs(name.toLowerCase()) }, rows, existingKeys });

// Fake I/O over a set of installs: each dataset slug resolves to its install's rows.
function io(installs) {
  const reads = [];
  const created = [];
  const bySlug = Object.fromEntries(installs.flatMap((i) => [
    [i.qa.datasets.patterns.slug, i.rows],
    [i.qa.datasets.pages.slug, i.existingKeys.map((page_key) => ({ page_key }))],
  ]));
  return {
    reads, created,
    loadRows: async (ref, columns) => { reads.push([ref.slug, columns]); return bySlug[ref.slug] || []; },
    createRow: async (ref, data) => { created.push([ref.slug, data]); return { id: 1 }; },
  };
}
const ALPHA = { pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: "1", enabled: "yes" };
const page = { url_slug: "page_2", title: "Page 2" };
const keys = [5, "AlphaPage", "alphapage"]; // id, name, instance
const now = "2026-10-01T00:00:00.000Z";

describe("trackPublishedPage", () => {
  it("adds the page to the install that covers its pattern, at the first stage", async () => {
    const qa = install("QA", [ALPHA]);
    const f = io([qa]);
    const tracked = await trackPublishedPage({ page, patternKeys: keys, qaInstalls: [qa], url: "/alphapage/page_2", now, ...f });
    expect(tracked).toEqual([{ install: "QA", page_key: "alphapage:page_2" }]);
    expect(f.created).toEqual([["qa_pages", {
      page_key: "alphapage:page_2", surface: "alphapage", surface_label: "AlphaPage", name: "Page 2", route: "/page_2",
      url: "/alphapage/page_2", build: "Published", stage: "Proposed", updated: now,
    }]]);
  });

  it("matches a covered site by the pattern's name, row id or instance", async () => {
    for (const pattern of ["AlphaPage", "5", "alphapage"]) {
      const qa = install("QA", [{ ...ALPHA, pattern }]);
      const f = io([qa]);
      expect(await trackPublishedPage({ page, patternKeys: keys, qaInstalls: [qa], now, ...f })).toHaveLength(1);
    }
  });

  it("leaves a page that already has a row, so a re-publish keeps its stage", async () => {
    const qa = install("QA", [ALPHA], ["alphapage:page_2"]);
    const f = io([qa]);
    expect(await trackPublishedPage({ page, patternKeys: keys, qaInstalls: [qa], now, ...f })).toEqual([]);
    expect(f.created).toEqual([]);
  });

  it("skips a site that's switched off, another pattern's site, and a page outside include_slugs", async () => {
    const cases = [
      [{ ...ALPHA, enabled: "no" }],
      [{ ...ALPHA, pattern: "betapage" }],
      [{ ...ALPHA, include_slugs: "page_1, blank" }],
    ];
    for (const rows of cases) {
      const qa = install("QA", rows);
      const f = io([qa]);
      expect(await trackPublishedPage({ page, patternKeys: keys, qaInstalls: [qa], now, ...f })).toEqual([]);
      expect(f.created).toEqual([]);
    }
  });

  it("skips an install whose settings this user can't read, without reading anything", async () => {
    const f = io([]);
    expect(await trackPublishedPage({ page, patternKeys: keys, qaInstalls: [{ name: "Stub" }], now, ...f })).toEqual([]);
    expect(f.reads).toEqual([]);
  });

  it("adds the page to every install that covers it", async () => {
    const a = install("A", [ALPHA]);
    const b = install("B", [ALPHA], ["alphapage:page_2"]);
    const c = install("C", [{ ...ALPHA, surface: "alpha" }]);
    const f = io([a, b, c]);
    const tracked = await trackPublishedPage({ page, patternKeys: keys, qaInstalls: [a, b, c], now, ...f });
    expect(tracked).toEqual([{ install: "A", page_key: "alphapage:page_2" }, { install: "C", page_key: "alpha:page_2" }]);
  });

  it("does nothing for a page without a slug", async () => {
    const qa = install("QA", [ALPHA]);
    const f = io([qa]);
    expect(await trackPublishedPage({ page: { title: "x" }, patternKeys: keys, qaInstalls: [qa], now, ...f })).toEqual([]);
    expect(f.reads).toEqual([]);
  });
});

describe("the parts", () => {
  it("keys a nested page by its full slug and leaves out an unknown url", () => {
    const row = trackedPageRow({ site: ALPHA, page: { url_slug: "page_1/child" }, now });
    expect(row).toMatchObject({ page_key: "alphapage:page_1/child", route: "/page_1/child", name: "page_1/child" });
    expect(row).not.toHaveProperty("url");
  });

  it("reads include_slugs as a trimmed, comma-separated allowlist; empty allows every page", () => {
    expect(slugAllowed({ include_slugs: " a , b " }, "b")).toBe(true);
    expect(slugAllowed({ include_slugs: "a,b" }, "c")).toBe(false);
    expect(slugAllowed({ include_slugs: "" }, "c")).toBe(true);
  });

  it("compares pattern keys as strings and ignores missing ones", () => {
    expect(coversPattern({ pattern: "5" }, [5, undefined, null])).toBe(true);
    expect(coversPattern({ pattern: "undefined" }, [undefined])).toBe(false);
  });

  it("keeps enabled covered sites with a surface, in sort order", () => {
    expect(coveredSites([{ surface: "b", sort_order: "2", enabled: "yes" }, { surface: "a", sort_order: "1", enabled: "yes" }, { surface: "", enabled: "yes" }])
      .map((s) => s.surface)).toEqual(["a", "b"]);
  });
});
