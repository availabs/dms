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

// the Ticket page header band: four joined Cards
const HEADER_ROWS = ["qa_ticket_crumb", "qa_ticket_badges", "qa_ticket_title", "qa_ticket_target"];

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
    // path links stay inside the install; query-only links are the filter bar's same-page shortcuts
    const paths = locations.filter((l) => !l.startsWith("?"));
    expect(paths.length).toBeGreaterThan(0);
    paths.forEach((l) => expect(l.startsWith("/phase2/")).toBe(true));
    const shortcuts = locations.filter((l) => l.startsWith("?"));
    expect(shortcuts).toEqual(["?status=", "?status=Triage|||In progress|||In review|||Needs decision|||Needs data", "?status=Resolved|||Closed"]);
  });

  it("registers the pages' URL variables", () => {
    expect(list.filters.map((f) => f.searchKey)).toEqual(["status", "severity", "source", "surface", "q"]);
    expect(detail.filters.map((f) => f.searchKey)).toEqual(["id"]);
    [...list.filters, ...detail.filters].forEach((f) => expect(f.useSearchParams).toBe(true));
  });

  it("filters every Ticket-page data section by the id variable", () => {
    dataSections(detail).forEach((s) =>
      // the header rows join the pages, so their id column is alias-prefixed
      expect(dataOf(s).filters.groups).toEqual([expect.objectContaining({
        col: s.trackingId.startsWith("qa_ticket_") && HEADER_ROWS.includes(s.trackingId) ? "ds.id" : "id", searchParamKey: "id", requireResolved: true,
      })]));
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

  it("stamps resolved_date from the rail's status pill and refreshes the header after a rail pick", () => {
    const rail = dataOf(detail.sections.find((s) => s.trackingId === "qa_ticket_rail"));
    expect(rail.columns.find((c) => c.name === "status").setDateOnValue).toEqual({ field: "resolved_date", values: CLOSED_STATUSES });
    expect(rail.columns.some((c) => c.name === "resolved_date")).toBe(true);
    expect(rail.display._functions.providers).toEqual([{ functionId: "save_publish", enabled: true, paramKey: "ticket_v" }]);
    // every header row refetches after a rail pick, so the badges and the stage match
    HEADER_ROWS.forEach((id) => {
      const header = dataOf(detail.sections.find((s) => s.trackingId === id));
      expect(header.display._functions.subscribers).toEqual([{ functionId: "data_refresh", enabled: true, paramKey: "ticket_v" }]);
    });
    const badges = dataOf(detail.sections.find((s) => s.trackingId === "qa_ticket_badges"));
    expect(badges.columns.find((c) => c.name === "ds.status").setDateOnValue).toBeUndefined();
  });
});

describe("add-ticket link", () => {
  // the header Card's last cell: a link when there's somewhere to add tickets, else an empty cell
  const addCell = (pages) => dataOf(pageBySlug(pages, "tickets").sections.find((s) => s.trackingId === "qa_tickets_header"))
    .columns.find((c) => c.name === "h_add");

  it("links to the Datasets admin's table when a Datasets pattern shares the environment", () => {
    const pages = buildQaPages(pattern, { ...ctx, datasetPatterns: [{ pattern_type: "datasets", dmsEnvId: 42, base_url: "/data/" }] });
    expect(addCell(pages)).toEqual(expect.objectContaining({ isLink: true, location: "/data/internal_source/43/table" }));
  });

  it("is left out otherwise", () => {
    const pages = buildQaPages(pattern, { ...ctx, datasetPatterns: [{ pattern_type: "datasets", dmsEnvId: 7, base_url: "data" }] });
    expect(addCell(pages).isLink).toBeUndefined();
    expect(addCell(pages).staticValue).toBe("");
  });
});

describe("site labels", () => {
  it("maps surface values to the covered-sites rows' labels", () => {
    const list = pageBySlug(buildQaPages(pattern, { ...ctx, siteLabels: { alphapage: "Alpha" } }), "tickets");
    const table = dataOf(list.sections.find((s) => s.trackingId === "qa_tickets_table"));
    expect(table.columns.find((c) => c.normalName === "site").name).toContain("when 'alphapage' then 'Alpha'");
    // the Site chip shows the label while ?surface= keeps the raw key
    const filters = dataOf(list.sections.find((s) => s.trackingId === "qa_tickets_filters"));
    expect(filters.columns.find((c) => c.name === "surface").optionLabels).toEqual({ alphapage: "Alpha" });
  });

  it("shows raw values when there are none", () => {
    const list = pageBySlug(buildQaPages(pattern, ctx), "tickets");
    const table = dataOf(list.sections.find((s) => s.trackingId === "qa_tickets_table"));
    expect(table.columns.find((c) => c.customName === "Site").name).toBe("ds.surface");
  });
});

describe("an install without datasets", () => {
  it("keeps placeholder pages", () => {
    const pages = buildQaPages({ name: "QA" }, ctx);
    expect(pages.map((p) => p.url_slug)).toEqual(["overview", "tickets", "ticket"]);
    pages.forEach((p) => expect(byType(p, "lexical")).toHaveLength(p.sections.length));
  });
});
