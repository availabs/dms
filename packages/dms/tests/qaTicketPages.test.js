/**
 * The `qa` install's ticket pages (phase 3a): the Tickets list and the Ticket page, ported from
 * TransportNY's control-room builder and bound to the install's own tickets dataset.
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaTicketPages.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { buildQaPages } from "../src/patterns/qa/pages";
import { OPEN, CLOSED, OPEN_STATUSES, CLOSED_STATUSES } from "../src/patterns/qa/pages/helpers";

const tickets = { slug: "phase2_tickets", source_id: 43, view_id: 44 };
const datasets = {
  tickets, pages: { slug: "phase2_pages", source_id: 45, view_id: 46 }, stories: { slug: "phase2_stories", source_id: 47, view_id: 48 },
  patterns: { slug: "phase2_patterns", source_id: 49, view_id: 50 }, history: { slug: "phase2_history", source_id: 51, view_id: 52 },
};
const pattern = { name: "Phase2", dmsEnvId: 42, qa: { version: 1, datasets } };
const pageBySlug = (pages, slug) => pages.find((p) => p.url_slug === slug);
const ctx = { app: "qa_test", baseUrl: "/phase2" };
const byType = (page, type) => page.sections.filter((s) => s.element["element-type"] === type);
const dataOf = (s) => JSON.parse(s.element["element-data"]);
const dataSections = (page) => page.sections.filter((s) => s.element["element-type"] !== "lexical");

describe("ticket pages", () => {
  const all = buildQaPages(pattern, ctx);
  const list = pageBySlug(all, "tickets");
  const detail = pageBySlug(all, "ticket");

  it("builds the Tickets list and the hidden Ticket page", () => {
    expect([list.title, list.url_slug, list.index]).toEqual(["Tickets", "tickets", 1]);
    expect([detail.title, detail.url_slug, detail.hide_in_nav]).toEqual(["Ticket", "ticket", true]);
  });

  it("binds every data section on these two pages to the install's own tickets dataset", () => {
    [list, detail].forEach((page) =>
      dataSections(page).forEach((s) => {
        expect(dataOf(s).externalSource).toMatchObject({
          isDms: true, app: "qa_test", type: "phase2_tickets", source_id: 43, view_id: 44,
          env: "qa_test+phase2_tickets", srcEnv: "qa_test+phase2_tickets",
        });
      }));
  });

  it("carries no TransportNY identifiers", () => {
    const all = JSON.stringify([list, detail]);
    ["sitemgmt", "npmrdsv5", "2184923", "2184924", "/datasources"].forEach((id) => expect(all).not.toContain(id));
  });

  it("links within the install", () => {
    const locations = [list, detail].flatMap((page) =>
      dataSections(page).flatMap((s) => (dataOf(s).columns || []).map((c) => c.location).filter(Boolean)));
    expect(locations.length).toBeGreaterThan(0);
    locations.forEach((l) => expect(l.startsWith("/phase2/")).toBe(true));
  });

  it("registers the pages' URL variables", () => {
    expect(list.filters.map((f) => f.searchKey)).toEqual(["status", "severity", "source", "surface"]);
    expect(detail.filters.map((f) => f.searchKey)).toEqual(["id"]);
    [...list.filters, ...detail.filters].forEach((f) => expect(f.useSearchParams).toBe(true));
  });

  it("filters every Ticket-page data section by the id variable", () => {
    dataSections(detail).forEach((s) =>
      expect(dataOf(s).filters.groups).toEqual([expect.objectContaining({ col: "id", searchParamKey: "id", requireResolved: true })]));
  });

  it("gives every section a fixed, unique trackingId and a known group", () => {
    [list, detail].forEach((page) => {
      const ids = page.sections.map((s) => s.trackingId);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      const groups = page.section_groups.map((g) => g.name);
      page.sections.forEach((s) => expect(groups).toContain(s.group));
    });
    expect(JSON.stringify(buildQaPages(pattern, ctx))).toBe(JSON.stringify(buildQaPages(pattern, ctx)));
    expect(all.map((p) => p.url_slug)).toEqual(["overview", "tickets", "ticket", "page"]);
  });

  it("builds open and closed from the status kinds", () => {
    expect(OPEN_STATUSES).toEqual(["Triage", "In progress", "In review", "Needs decision", "Needs data"]);
    expect(CLOSED_STATUSES).toEqual(["Resolved", "Closed"]);
    expect(OPEN).toBe("('Triage','In progress','In review','Needs decision','Needs data')");
    expect(CLOSED).toBe("('Resolved','Closed')");
  });

  it("leaves out the status pill's date stamp, which only the section editor runs", () => {
    expect(JSON.stringify(detail)).not.toContain("setDateOnValue");
  });
});

describe("add-ticket link", () => {
  const titleSizes = (pages) => pageBySlug(pages, "tickets").sections.find((s) => s.trackingId === "qa_tickets_title").size;

  it("links to the Datasets admin's table when a Datasets pattern shares the environment", () => {
    const pages = buildQaPages(pattern, { ...ctx, datasetPatterns: [{ pattern_type: "datasets", dmsEnvId: 42, base_url: "/data/" }] });
    const add = pageBySlug(pages, "tickets").sections.find((s) => s.trackingId === "qa_tickets_add");
    expect(dataOf(add).columns[0].location).toBe("/data/internal_source/43/table");
    expect(titleSizes(pages)).toBe("9");
  });

  it("is left out otherwise", () => {
    const pages = buildQaPages(pattern, { ...ctx, datasetPatterns: [{ pattern_type: "datasets", dmsEnvId: 7, base_url: "data" }] });
    expect(pageBySlug(pages, "tickets").sections.find((s) => s.trackingId === "qa_tickets_add")).toBeUndefined();
    expect(titleSizes(pages)).toBe("12");
  });
});

describe("site labels", () => {
  it("maps surface values when the install sets labels", () => {
    const labelled = { ...pattern, qa: { ...pattern.qa, siteLabels: { tsmo2: "TSMO" } } };
    const list = pageBySlug(buildQaPages(labelled, ctx), "tickets");
    const table = dataOf(list.sections.find((s) => s.trackingId === "qa_tickets_table"));
    expect(table.columns.find((c) => c.normalName === "site").name).toContain("when 'tsmo2' then 'TSMO'");
    const facet = dataOf(list.sections.find((s) => s.trackingId === "qa_tickets_facet_site"));
    expect(JSON.parse(facet.columns[0].meta_lookup)).toEqual({ tsmo2: "TSMO" });
  });

  it("shows raw values when it sets none", () => {
    const list = pageBySlug(buildQaPages(pattern, ctx), "tickets");
    const table = dataOf(list.sections.find((s) => s.trackingId === "qa_tickets_table"));
    expect(table.columns.find((c) => c.customName === "Site").name).toBe("surface");
  });
});

describe("an install without datasets", () => {
  it("keeps placeholder pages", () => {
    const pages = buildQaPages({ name: "QA" }, ctx);
    expect(pages.map((p) => p.url_slug)).toEqual(["overview", "tickets", "ticket"]);
    pages.forEach((p) => expect(byType(p, "lexical")).toHaveLength(p.sections.length));
  });
});
