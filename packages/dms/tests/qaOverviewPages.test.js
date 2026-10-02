/**
 * The `qa` install's Overview (its home page) and Page QA pages (phase 3b), ported from
 * TransportNY's control-room builders and bound to the install's own datasets.
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaOverviewPages.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { buildQaPages, coveredSites } from "../src/patterns/qa/pages";
import { PAGE_STAGES } from "../src/patterns/qa/ticketRecord";
import { QA_DATASETS } from "../src/patterns/qa/datasets";
import { CLOSED_STATUSES } from "../src/patterns/qa/pages/helpers";

const datasets = {
  tickets: { slug: "phase2_tickets", source_id: 43, view_id: 44 },
  pages: { slug: "phase2_pages", source_id: 45, view_id: 46 },
  stories: { slug: "phase2_stories", source_id: 47, view_id: 48 },
  patterns: { slug: "phase2_patterns", source_id: 49, view_id: 50 },
  history: { slug: "phase2_history", source_id: 51, view_id: 52 },
};
const pattern = { name: "Phase2", dmsEnvId: 42, qa: { version: 1, datasets } };
const sites = [
  { pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: "1", enabled: "yes" },
  { pattern: "betapage", surface: "betapage", surface_label: "BetaPage", sort_order: "2", enabled: "yes" },
];
const ctx = { app: "qa_test", baseUrl: "/phase2", sites };
const pageBySlug = (slug, c = ctx) => buildQaPages(pattern, c).find((p) => p.url_slug === slug);
const dataOf = (s) => JSON.parse(s.element["element-data"]);
const dataSections = (page) => page.sections.filter((s) => s.element["element-type"] !== "lexical");
const sourceSlugs = (page) => [...new Set(dataSections(page).map((s) => dataOf(s).externalSource.type))].sort();

describe("coveredSites", () => {
  it("keeps enabled rows with a surface, in sort order", () => {
    const rows = [
      { surface: "b", sort_order: "2", enabled: "yes" },
      { surface: "off", sort_order: "0", enabled: "no" },
      { surface: "a", sort_order: "1", enabled: "yes" },
      { surface: "", sort_order: "3", enabled: "yes" },
    ];
    expect(coveredSites(rows).map((r) => r.surface)).toEqual(["a", "b"]);
  });

  it("reads the columns the covered-sites dataset has", () => {
    const columns = QA_DATASETS.find((d) => d.key === "patterns").attributes.map((a) => a.name);
    ["pattern", "surface", "surface_label", "sort_order", "enabled"].forEach((c) => expect(columns).toContain(c));
  });
});

describe("Overview", () => {
  const overview = pageBySlug("overview");

  it("is the install's home page", () => {
    expect([overview.title, overview.index, overview.hide_in_nav]).toEqual(["Overview", 0, undefined]);
  });

  it("reads only the install's pages and tickets datasets", () => {
    expect(sourceSlugs(overview)).toEqual(["phase2_pages", "phase2_tickets"]);
  });

  it("counts pages per stage in one card, one live cell per stage", () => {
    const card = dataOf(overview.sections.find((s) => s.trackingId === "qa_overview_stages"));
    expect(card.columns.map((c) => c.display_name)).toEqual(PAGE_STAGES);
    card.columns.forEach((c, i) => expect(c.name).toContain(`= '${PAGE_STAGES[i]}'`));
    expect(card.display.cellsGridSize).toBe(PAGE_STAGES.length);
  });

  it("counts in SQL, not numbers baked into the page", () => {
    const counts = ["qa_overview_page_counts", "qa_overview_ticket_counts"].map((id) => dataOf(overview.sections.find((s) => s.trackingId === id)));
    counts.forEach((d) => expect(d.columns[0].name).toContain("count(*)"));
  });

  it("builds one card group per covered site, each section filtered by that site", () => {
    sites.forEach((site) => {
      const g = `overview_site_${site.surface}`;
      expect(overview.section_groups.map((x) => x.name)).toContain(g);
      const inGroup = overview.sections.filter((s) => s.group === g);
      expect(inGroup).toHaveLength(4);
      inGroup.forEach((s) => {
        const d = dataOf(s);
        // the pages table joins the tickets, so its filter column is alias-prefixed
        const surface = s.trackingId.endsWith("_pages") ? "ds.surface" : "surface";
        expect(d.filters.groups).toContainEqual({ col: surface, op: "filter", value: [site.surface] });
      });
    });
  });

  it("leaves out the site cards until the sites have loaded", () => {
    const loading = pageBySlug("overview", { ...ctx, sites: null });
    expect(loading.section_groups.map((g) => g.name).filter((n) => n.startsWith("overview_site_"))).toEqual([]);
  });

  it("sorts each site's pages by stage without a stored stage_order, and links to Page QA", () => {
    const table = dataOf(overview.sections.find((s) => s.trackingId === "qa_overview_alphapage_pages"));
    expect(table.columns[0]).toMatchObject({ normalName: "stage_rank", sort: "asc" });
    expect(table.columns.find((c) => c.customName === "Page")).toMatchObject({ location: "/phase2/page?key=", searchParamsCol: "ds.page_key" });
    const all = JSON.stringify(overview);
    ["stage_order", "open_bugs", "design?key", "sitemgmt", "npmrdsv5"].forEach((x) => expect(all).not.toContain(x));
  });
});

describe("Page QA", () => {
  const page = pageBySlug("page");

  it("is a hidden page with a right-hand rail and the key variable", () => {
    expect([page.url_slug, page.hide_in_nav, page.sidebar]).toEqual(["page", true, "right"]);
    expect(page.filters.map((f) => f.searchKey)).toEqual(["key"]);
    expect(page.section_groups.find((g) => g.name === "page_main").railHost).toBe(true);
    expect(page.section_groups.find((g) => g.name === "page_status").position).toBe("sidebar");
    expect(page.section_groups.find((g) => g.name === "page_add_ticket")).toMatchObject({ isModal: true, modalParamKey: "addticket" });
  });

  it("reads the install's pages, stories and tickets", () => {
    expect(sourceSlugs(page)).toEqual(["phase2_pages", "phase2_stories", "phase2_tickets"]);
  });

  it("keys every data section but the modal's on ?key=", () => {
    dataSections(page).filter((s) => !["qa_page_add_ticket", "qa_page_tickets_title"].includes(s.trackingId)).forEach((s) =>
      expect(dataOf(s).filters.groups).toContainEqual(expect.objectContaining({ col: "page_key", searchParamKey: "key", requireResolved: true })));
  });

  it("files new tickets from the modal with create-time defaults", () => {
    const form = dataOf(page.sections.find((s) => s.trackingId === "qa_page_add_ticket"));
    expect(form.display).toMatchObject({ allowAdddNew: true, closeModalOnAdd: "addticket" });
    const byName = Object.fromEntries(form.columns.map((c) => [c.name, c]));
    expect(byName.status.defaultValue).toBe("Triage");
    expect(byName.ticket_id).toMatchObject({ autoNumber: true, autoNumberStart: 101 });
    expect(byName.surface.defaultFrom).toEqual({ column: "page_key", split: ":", index: 0 });
    expect(byName.page_key).toMatchObject({ usePageParams: true, pageParamKey: "key", editable: false });
  });

  it("leaves out the Design toggle, and links tickets within the install", () => {
    const all = JSON.stringify(page);
    ["design?key", "toggleOn", "sitemgmt", "npmrdsv5"].forEach((x) => expect(all).not.toContain(x));
    const tickets = dataOf(page.sections.find((s) => s.trackingId === "qa_page_tickets"));
    expect(tickets.columns.find((c) => c.normalName === "num").location).toBe("/phase2/ticket?id=");
  });

  it("offers the page stages in the stage control", () => {
    const stage = dataOf(page.sections.find((s) => s.trackingId === "qa_page_stage")).columns.find((c) => c.name === "stage");
    expect(stage.options.map((o) => o.value)).toEqual(PAGE_STAGES);
  });

  it("stamps resolved_date from the tickets table, and refreshes the rail after a status or stage pick", () => {
    const section = (id) => dataOf(page.sections.find((s) => s.trackingId === id));
    const tickets = section("qa_page_tickets");
    expect(tickets.columns.find((c) => c.name === "status").setDateOnValue).toEqual({ field: "resolved_date", values: CLOSED_STATUSES });
    // the stored date is loaded (zero width) so Resolved → Closed keeps it
    expect(tickets.columns.find((c) => c.name === "resolved_date")).toMatchObject({ show: true, size: 0 });
    expect(tickets.display._functions.providers).toEqual([{ functionId: "save_publish", enabled: true, paramKey: "tickets_v" }]);
    expect(section("qa_page_work").display._functions.subscribers).toEqual([{ functionId: "data_refresh", enabled: true, paramKey: "tickets_v" }]);
    expect(section("qa_page_stage").display._functions.providers).toEqual([{ functionId: "save_publish", enabled: true, paramKey: "page_v" }]);
    expect(section("qa_page_progress").display._functions.subscribers).toEqual([{ functionId: "data_refresh", enabled: true, paramKey: "page_v" }]);
  });
});

describe("page stages", () => {
  it("match the pages dataset's stage options", () => {
    const stage = QA_DATASETS.find((d) => d.key === "pages").attributes.find((a) => a.name === "stage");
    expect(stage.options.map((o) => o.value)).toEqual(PAGE_STAGES);
  });
});
