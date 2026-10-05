/**
 * The QA install's Configure tab (phase 5): which patterns an install covers, under what short
 * key and label, and the published pages switching one on adds. Its logic is pure
 * (patterns/qa/configure.js), so it's tested here without a browser.
 *
 * See planning/tasks/current/qa-pattern-type.md, "Phase 5".
 *
 * Run: npx vitest run packages/dms/tests/qaConfigure.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import {
  coverablePatterns, configureEntries, coveredSiteRow, configureWrites, usedKeys, keyLocked,
  coveredElsewhere, configureErrors, needsBackfill, backfillRows, patternKeysOf, saveConfigure,
} from "../src/patterns/qa/configure";
import { siteLabelsFrom } from "../src/patterns/qa/tracking";

const pat = (id, name, instance, pattern_type = "page", extra = {}) => ({ id, name, type: `qa_test|${instance}:pattern`, pattern_type, base_url: `/${instance}`, ...extra });
const ALPHA = pat(10, "AlphaPage", "alphapage");
const BETA = pat(11, "BetaPage", "betapage");
const DATA = pat(12, "Datasets", "datasets", "datasets");
const ADMIN = pat(13, "Admin", "admin", "admin", { base_url: "/list" });
const QA = pat(14, "QA", "qa", "qa");
const STUB = { id: "no-access", name: "Private", type: "qa_test|private:pattern", pattern_type: "page", no_access: true };
const SITE = [ALPHA, BETA, DATA, ADMIN, QA, STUB];

const row = (extra) => ({ id: 1, pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: 1, enabled: "yes", include_slugs: "", ...extra });

describe("coverablePatterns", () => {
  it("offers every type but admin and qa, and leaves out no-access stubs", () => {
    expect(coverablePatterns(SITE).map((p) => p.name)).toEqual(["AlphaPage", "BetaPage", "Datasets"]);
  });
});

describe("configureEntries", () => {
  it("matches each pattern to its row by instance, name or id; a pattern with none starts off", () => {
    const rows = [row(), row({ id: 2, pattern: "BetaPage", surface: "beta", surface_label: "Beta", enabled: "no" }), row({ id: 3, pattern: "12", surface: "data" })];
    const { entries, others } = configureEntries(SITE, rows);
    expect(entries.map((e) => [e.pattern.name, e.row?.id ?? null, e.enabled, e.surface])).toEqual([
      ["AlphaPage", 1, true, "alphapage"], ["BetaPage", 2, false, "beta"], ["Datasets", 3, true, "data"],
    ]);
    expect(others).toEqual([]);
  });

  it("starts a new entry with the instance as key and the name as label", () => {
    const { entries } = configureEntries([BETA], []);
    expect(entries[0]).toMatchObject({ row: null, enabled: false, surface: "betapage", surface_label: "BetaPage", include_slugs: "" });
  });

  it("returns rows that match no coverable pattern as others, untouched", () => {
    const orphan = row({ id: 9, pattern: "gone", surface: "gone" });
    const { others } = configureEntries(SITE, [row(), orphan]);
    expect(others).toEqual([orphan]);
  });
});

describe("configureWrites", () => {
  it("creates a row for a newly switched-on pattern, named by instance, after the last order", () => {
    const { entries } = configureEntries([ALPHA, BETA], [row({ app: "qa_test", base_url: "/alphapage", subdomain: "" })]);
    entries[1].enabled = true;
    const writes = configureWrites(entries, { app: "qa_test" });
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toEqual({
      app: "qa_test", pattern: "betapage", surface: "betapage", surface_label: "BetaPage", sort_order: 2,
      enabled: "yes", subdomain: "", base_url: "/betapage", include_slugs: "",
    });
  });

  it("updates an existing row only when a field changed, and keeps how it names its pattern", () => {
    const { entries } = configureEntries([ALPHA], [row({ pattern: "AlphaPage", app: "qa_test", base_url: "/alphapage", subdomain: "" })]);
    expect(configureWrites(entries, { app: "qa_test" })).toEqual([]);
    entries[0].surface_label = "Alpha";
    const [w] = configureWrites(entries, { app: "qa_test" });
    expect(w.data).toMatchObject({ id: 1, pattern: "AlphaPage", surface_label: "Alpha" });
  });

  it("writes enabled 'no' when a site is switched off, and nothing for one never on", () => {
    const { entries } = configureEntries([ALPHA, BETA], [row({ app: "qa_test", base_url: "/alphapage", subdomain: "" })]);
    entries[0].enabled = false;
    const writes = configureWrites(entries, { app: "qa_test" });
    expect(writes.map((w) => [w.data.id, w.data.enabled])).toEqual([[1, "no"]]);
  });
});

describe("usedKeys / keyLocked", () => {
  it("collects the keys pages and tickets use, from surface or the page key", () => {
    const used = usedKeys([{ surface: "alphapage", page_key: "alphapage:page_1" }], [{ page_key: "beta:page_1" }]);
    expect([...used].sort()).toEqual(["alphapage", "beta"]);
  });

  it("locks a saved key in use, never a new entry's", () => {
    const used = new Set(["alphapage"]);
    const { entries } = configureEntries([ALPHA, BETA], [row()]);
    expect(entries.map((e) => keyLocked(e, used))).toEqual([true, false]);
  });
});

describe("coveredElsewhere", () => {
  it("names the other install that covers a pattern with an enabled row", () => {
    const installs = [{ name: "Ops", rows: [row({ pattern: "11", surface: "beta" })] }, { name: "Old", rows: [row({ enabled: "no" })] }];
    expect(coveredElsewhere(SITE, installs)).toEqual({ 11: "Ops" });
  });
});

describe("configureErrors", () => {
  const entriesFor = (rows, patterns = [ALPHA, BETA]) => configureEntries(patterns, rows).entries;

  it("refuses switching on a pattern another install covers, and names it", () => {
    const entries = entriesFor([]);
    entries[1].enabled = true;
    expect(configureErrors(entries, { elsewhere: { 11: "Ops" } })).toEqual({ 11: "already covered by the Ops install" });
  });

  it("refuses an empty, malformed or duplicate key", () => {
    const entries = entriesFor([row()]);
    entries[1].enabled = true;
    entries[1].surface = "alphapage";
    expect(configureErrors(entries)[11]).toMatch(/also AlphaPage's/);
    entries[1].surface = "Beta:Page";
    expect(configureErrors(entries)[11]).toMatch(/lowercase/);
    entries[1].surface = " ";
    expect(configureErrors(entries)[11]).toBe("needs a short key");
  });

  it("refuses a key another covered-sites row already holds", () => {
    const entries = entriesFor([]);
    entries[0].enabled = true;
    entries[0].surface = "gone";
    expect(configureErrors(entries, { others: [row({ id: 9, pattern: "gone", surface: "gone" })] })[10]).toMatch(/taken/);
  });

  it("doesn't block on an old row's unchanged key or an off entry", () => {
    const entries = entriesFor([row({ surface: "Legacy-Key" })]);
    expect(configureErrors(entries)).toEqual({});
  });
});

describe("needsBackfill", () => {
  it("is true when switched on or the page limit changed, while on", () => {
    const { entries } = configureEntries([ALPHA, BETA], [row()]);
    expect(entries.map(needsBackfill)).toEqual([false, false]);
    entries[1].enabled = true;
    entries[0].include_slugs = "page_1";
    expect(entries.map(needsBackfill)).toEqual([true, true]);
    entries[0].enabled = false;
    expect(needsBackfill(entries[0])).toBe(false);
  });
});

describe("backfillRows", () => {
  const site = { surface: "alphapage", surface_label: "AlphaPage", include_slugs: "" };
  const now = "2026-10-02T00:00:00.000Z";
  const pages = [
    { url_slug: "page_1", title: "Page 1", published: "" },
    { url_slug: "page_2", title: "Page 2", published: "draft" },
    { url_slug: "page_3", title: "Page 3" },
    { url_slug: "page_4", title: "Page 4", published: "published" },
  ];

  it("adds published pages with no row yet, at the first stage", () => {
    const rows = backfillRows({ site, pages, existing: [{ page_key: "alphapage:page_4" }], urlFor: (p) => `/alphapage/${p.url_slug}`, now });
    expect(rows).toEqual([{
      page_key: "alphapage:page_1", surface: "alphapage", surface_label: "AlphaPage", name: "Page 1",
      route: "/page_1", url: "/alphapage/page_1", build: "Published", stage: "Proposed", updated: now,
    }]);
  });

  it("respects the page limit", () => {
    const rows = backfillRows({ site: { ...site, include_slugs: "page_4" }, pages, existing: [], now });
    expect(rows.map((r) => r.page_key)).toEqual(["alphapage:page_4"]);
  });
});

describe("siteLabelsFrom / patternKeysOf", () => {
  it("labels every row's key, switched-off sites too, falling back to the key", () => {
    expect(siteLabelsFrom([row(), row({ surface: "beta", surface_label: "", enabled: "no" })])).toEqual({ alphapage: "AlphaPage", beta: "beta" });
  });

  it("gives a pattern's id, name and instance", () => {
    expect(patternKeysOf(ALPHA)).toEqual([10, "AlphaPage", "alphapage"]);
  });
});

describe("saveConfigure", () => {
  const datasets = { patterns: { slug: "qa_patterns", source_id: 1, view_id: 2 }, pages: { slug: "qa_pages", source_id: 3, view_id: 4 } };
  const pagesOf = {
    alphapage: [{ url_slug: "page_1", title: "Page 1", published: "" }, { url_slug: "draft", title: "Draft", published: "draft" }],
    betapage: [{ url_slug: "page_1", title: "Page 1", published: "" }, { url_slug: "page_2", title: "Page 2", published: "" }],
  };
  const io = (existing = []) => {
    const log = [];
    return {
      log,
      loadRows: async (ref) => (ref.slug === "qa_pages" ? existing.map((page_key) => ({ page_key })) : []),
      createRow: async (ref, data) => { log.push(["create", ref.slug, data]); },
      updateRow: async (ref, data) => { log.push(["update", ref.slug, data]); },
      loadPages: async (p) => pagesOf[p.base_url.slice(1)] || [],
      urlFor: (p, page) => `${p.base_url}/${page.url_slug}`,
    };
  };
  const now = "2026-10-02T00:00:00.000Z";

  it("switching a site on writes its row, then adds its published pages that have no row", async () => {
    const f = io(["betapage:page_1"]);
    const { entries } = configureEntries([ALPHA, BETA], [row({ app: "qa_test", base_url: "/alphapage", subdomain: "" })]);
    entries[1].enabled = true;
    const result = await saveConfigure({ entries, datasets, app: "qa_test", now, ...f });
    expect(f.log.map(([op, slug, d]) => [op, slug, d.page_key || d.surface])).toEqual([
      ["create", "qa_patterns", "betapage"],
      ["create", "qa_pages", "betapage:page_2"],
    ]);
    expect(f.log[1][2]).toMatchObject({ url: "/betapage/page_2", stage: "Proposed", updated: now });
    expect(result).toEqual({ saved: 1, added: [{ pattern: "BetaPage", pages: 1 }] });
  });

  it("a second save with nothing changed writes nothing", async () => {
    const f = io();
    const { entries } = configureEntries([ALPHA], [row({ app: "qa_test", base_url: "/alphapage", subdomain: "" })]);
    expect(await saveConfigure({ entries, datasets, app: "qa_test", now, ...f })).toEqual({ saved: 0, added: [] });
    expect(f.log).toEqual([]);
  });

  it("switching a site off updates its row and adds nothing", async () => {
    const f = io();
    const { entries } = configureEntries([ALPHA], [row({ app: "qa_test", base_url: "/alphapage", subdomain: "" })]);
    entries[0].enabled = false;
    await saveConfigure({ entries, datasets, app: "qa_test", now, ...f });
    expect(f.log.map(([op, , d]) => [op, d.id, d.enabled])).toEqual([["update", 1, "no"]]);
  });
});
