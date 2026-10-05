/**
 * The `qa` install's derived values (phase 4): what TransportNY's sync wrote between datasets,
 * read live through joins instead. Each joined section is compiled through the real query builder,
 * since the failure modes are in the compiled SQL (an ambiguous `data` or `id` between the two
 * tables, a filter column the server can't resolve), not in the page config.
 *
 * See planning/tasks/current/qa-pattern-type.md, "Phase 4".
 *
 * Run: npx vitest run packages/dms/tests/qaDerivedValues.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { buildQaPages } from "../src/patterns/qa/pages";
import { OPEN_STATUSES, CLOSED_STATUSES } from "../src/patterns/qa/pages/helpers";
import { buildUdaConfig } from "../src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig";

const datasets = {
  tickets: { slug: "qa_tickets", source_id: 127, view_id: 128 },
  pages: { slug: "qa_pages", source_id: 129, view_id: 130 },
  stories: { slug: "qa_stories", source_id: 131, view_id: 132 },
  patterns: { slug: "qa_patterns", source_id: 133, view_id: 134 },
  history: { slug: "qa_history", source_id: 135, view_id: 136 },
};
const pattern = { name: "QA", dmsEnvId: 42, qa: { version: 1, datasets } };
const sites = [{ pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: "1", enabled: "yes" }];
const pages = (siteLabels) => buildQaPages(pattern, { app: "qa_test", baseUrl: "/qa", sites, siteLabels });
const dataOf = (s) => JSON.parse(s.element["element-data"]);
const sectionOf = (all, trackingId) => all.flatMap((p) => p.sections).find((s) => s.trackingId === trackingId);
const joinedSections = (all) => all.flatMap((p) => p.sections)
  .filter((s) => s.element["element-type"] !== "lexical" && Object.keys(dataOf(s).join?.sources || {}).length);

// Every URL-driven filter gets a value, as on a live page with its parameters set.
const pageFiltersFor = (state) => Object.fromEntries((state.filters.groups || [])
  .filter((g) => g.usePageFilters).map((g) => [g.searchParamKey, ["x"]]));
const compile = (s) => {
  const state = dataOf(s);
  return buildUdaConfig({ ...state, pageFilters: pageFiltersFor(state) });
};
const leaves = (node) => (node?.groups ? node.groups.flatMap(leaves) : node ? [node] : []);
// SQL reads that name no table: ambiguous under a join (both tables have `data` and `id`).
const BARE_DATA = /(?<![\w.])data->>/;
const BARE_ID = /(?<![\w.])id\)/;

describe("live open counts on the Overview", () => {
  const all = pages();
  const table = sectionOf(all, "qa_overview_alphapage_pages");
  const { options, columnsToFetch } = compile(table);

  it("left-joins the install's tickets on page_key and groups by page", () => {
    expect(options.join.sources.t).toEqual({ view_id: 128, env: "qa_test+qa_tickets" });
    expect(options.join.on).toEqual([expect.objectContaining({ type: "left", table: "t", on: "ds.data->>'page_key' = t.data->>'page_key'" })]);
    expect(options.groupBy).toContain("ds.data->>'page_key'");
  });

  it("counts every open status, whatever the severity, and no closed one", () => {
    const open = columnsToFetch.find((c) => c.normalName === "open_n").reqName;
    OPEN_STATUSES.forEach((s) => expect(open).toContain(`'${s}'`));
    CLOSED_STATUSES.forEach((s) => expect(open).not.toContain(`'${s}'`));
    expect(open).not.toContain("severity");
  });

  it("filters to the site on the pages table's own column", () => {
    expect(leaves(options.filterGroups)).toEqual([expect.objectContaining({ col: "ds.data->>'surface'", value: ["alphapage"] })]);
  });
});

describe("a ticket's page name and stage, live", () => {
  const all = pages();

  it("joins the install's pages on page_key in the ticket header and the tickets table", () => {
    ["qa_ticket_header", "qa_tickets_table"].forEach((id) => {
      const { options } = compile(sectionOf(all, id));
      expect(options.join.sources.p).toEqual({ view_id: 130, env: "qa_test+qa_pages" });
      expect(options.join.on[0].on).toBe("ds.data->>'page_key' = p.data->>'page_key'");
    });
  });

  it("reads the page's own name and stage, not the ticket's copies", () => {
    const attrs = compile(sectionOf(all, "qa_ticket_header")).columnsToFetch.map((c) => c.reqName).join(" ");
    expect(attrs).toContain("p.data->>'name'");
    expect(attrs).toContain("p.data->>'stage'");
    expect(attrs).not.toMatch(/page_name|page_stage/);
    // the route the ticket was filed from stays the ticket's own
    expect(attrs).toContain("ds.data->>'page_route'");
  });

  it("never leaves the Details rail's target page blank", () => {
    const rail = dataOf(sectionOf(all, "qa_ticket_rail"));
    expect(rail.columns.find((c) => c.normalName === "target_page").name).toContain("else (data->>'page_name')");
  });
});

describe("every joined section", () => {
  [undefined, { alphapage: "AlphaPage" }].forEach((siteLabels) => {
    const joined = joinedSections(pages(siteLabels));

    it(`is one of the expected sections${siteLabels ? " (with site labels)" : ""}`, () => {
      expect(joined.map((s) => s.trackingId).sort()).toEqual(["qa_overview_alphapage_pages", "qa_ticket_header", "qa_tickets_table"]);
    });

    it("is read-only: a live-edit save would write its alias-prefixed names as fields", () => {
      joined.forEach((s) => {
        const d = dataOf(s);
        expect(d.display.liveEdit || d.display.allowEditInView).toBeFalsy();
        d.columns.forEach((c) => expect(c.allowEditInView).toBeFalsy());
      });
    });

    it("compiles every read and filter to a named table", () => {
      joined.forEach((s) => {
        const { options, columnsToFetch } = compile(s);
        columnsToFetch.forEach((c) => {
          expect(c.reqName).not.toMatch(BARE_DATA);
          expect(c.reqName).not.toMatch(BARE_ID);
        });
        Object.keys(options.orderBy).forEach((k) => expect(k).not.toMatch(BARE_ID));
        // a filter column resolves to an accessor (`ds.data->>'x'`), or is the row id itself
        leaves(options.filterGroups).forEach((l) => expect(l.col).toMatch(/^(\w+\.data->>'\w+'|ds\.id)$/));
      });
    });
  });

  it("keeps the tickets table's URL filters on their URL keys", () => {
    const table = dataOf(sectionOf(pages(), "qa_tickets_table"));
    expect(table.filters.groups.map((g) => [g.col, g.searchParamKey])).toEqual([
      ["ds.status", "status"], ["ds.severity", "severity"], ["ds.source", "source"], ["ds.surface", "surface"],
    ]);
  });
});
