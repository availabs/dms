/**
 * The `qa` install's feature switches (patterns/qa/features.js): the Delivery QA and Help desk
 * groups over the shared tickets core, stored on the install row as an allow-list (`qa.features`),
 * and what each switch removes from the pages, track-on-publish and Configure's backfill.
 *
 * See planning/tasks/current/qa-pattern-type.md, §5 step 1.
 *
 * Run: npx vitest run packages/dms/tests/qaFeatures.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import {
  FEATURE_GROUPS, LEGACY_FEATURES, storedFeatures, installFeatures, hasFeature,
  setFeature, setGroup, groupState, featureBlocked, describeFeatureEdits,
} from "../src/patterns/qa/features";
import { buildQaPages, findQaPage } from "../src/patterns/qa/pages";
import { trackPublishedPage } from "../src/patterns/qa/tracking";
import { saveConfigure } from "../src/patterns/qa/configure";
import { installQa, newInstallQa } from "../src/patterns/qa/install";
import { QA_DATASETS, QA_TRACKED_COLUMNS } from "../src/patterns/qa/datasets";

const DELIVERY = ["page_inventory", "page_stages", "stories"];

describe("installFeatures", () => {
  it("reads an install from before switches (no list) as the Delivery QA set", () => {
    expect(LEGACY_FEATURES).toEqual(DELIVERY);
    expect([...installFeatures({ qa: { datasets: {} } })]).toEqual(DELIVERY);
    expect([...installFeatures(undefined)]).toEqual(DELIVERY);
  });

  it("reads an empty list as nothing on, the shared core only", () => {
    expect([...installFeatures({ qa: { features: [] } })]).toEqual([]);
  });

  it("drops unknown keys, and a feature whose prerequisite is off", () => {
    const on = installFeatures({ qa: { features: ["page_stages", "stories", "bogus"] } });
    expect([...on]).toEqual([]);
    expect(hasFeature({ qa: { features: ["page_inventory", "stories"] } }, "stories")).toBe(true);
    expect(hasFeature({ qa: { features: ["page_inventory", "stories"] } }, "page_stages")).toBe(false);
  });

  it("returns the stored list as it is, legacy included", () => {
    expect(storedFeatures({ qa: { features: ["stories"] } })).toEqual(["stories"]);
    expect(storedFeatures({})).toBe(LEGACY_FEATURES);
  });

  it("has a Help desk group with nothing to switch yet", () => {
    expect(FEATURE_GROUPS.map((g) => g.key)).toEqual(["delivery_qa", "help_desk"]);
    expect(FEATURE_GROUPS.find((g) => g.key === "help_desk").features).toEqual([]);
  });
});

describe("the switches", () => {
  it("switches one feature on and off, keeping display order", () => {
    expect(setFeature(["page_inventory"], "stories", true)).toEqual(["page_inventory", "stories"]);
    expect(setFeature(["page_inventory", "stories", "page_stages"], "page_stages", false)).toEqual(["page_inventory", "stories"]);
  });

  it("switching a prerequisite off switches off what needs it", () => {
    expect(setFeature(DELIVERY, "page_inventory", false)).toEqual([]);
  });

  it("won't switch a feature on while its prerequisite is off, and says why", () => {
    expect(setFeature([], "page_stages", true)).toEqual([]);
    expect(featureBlocked([], "page_stages")).toBe("needs Page inventory");
    expect(featureBlocked(["page_inventory"], "page_stages")).toBe("");
    expect(featureBlocked([], "page_inventory")).toBe("");
  });

  it("ignores an unknown key", () => {
    expect(setFeature(["page_inventory"], "bogus", true)).toEqual(["page_inventory"]);
  });

  it("switches a whole group, and reports it on while any of its features is", () => {
    expect(setGroup([], "delivery_qa", true)).toEqual(DELIVERY);
    expect(setGroup(DELIVERY, "delivery_qa", false)).toEqual([]);
    expect(groupState(["page_inventory"], "delivery_qa")).toEqual({ on: true, count: 1, total: 3 });
    expect(groupState([], "delivery_qa")).toEqual({ on: false, count: 0, total: 3 });
  });

  it("describes a change for the save bar: a whole group, or each feature", () => {
    expect(describeFeatureEdits([], DELIVERY)).toEqual(["Delivery QA switched off"]);
    expect(describeFeatureEdits(DELIVERY, [])).toEqual(["Delivery QA switched on"]);
    expect(describeFeatureEdits(["page_inventory", "stories"], DELIVERY)).toEqual(["Page stages switched off"]);
    expect(describeFeatureEdits(DELIVERY, DELIVERY)).toEqual([]);
  });

  it("starts a new install with nothing on, a fresh object each time", () => {
    const a = newInstallQa();
    expect(a).toEqual({ version: 1, features: [] });
    expect(newInstallQa().features).not.toBe(a.features);
  });
});

// ── what each switch removes from the pages ──

const datasets = {
  tickets: { slug: "sw_tickets", source_id: 43, view_id: 44 },
  pages: { slug: "sw_pages", source_id: 45, view_id: 46 },
  stories: { slug: "sw_stories", source_id: 47, view_id: 48 },
  patterns: { slug: "sw_patterns", source_id: 49, view_id: 50 },
  history: { slug: "sw_history", source_id: 51, view_id: 52 },
};
const sites = [{ pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: "1", enabled: "yes" }];
const ctx = { app: "qa_test", baseUrl: "/sw", sites };
const install = (features) => ({ name: "Sw", dmsEnvId: 42, qa: { version: 1, datasets, ...(features ? { features } : {}) } });
const pagesFor = (features, c = ctx) => buildQaPages(install(features), c);
const page = (features, slug, c) => pagesFor(features, c).find((p) => p.url_slug === slug);
const ids = (p) => p.sections.map((s) => s.trackingId);
const sectionById = (p, id) => p.sections.find((s) => s.trackingId === id);
const dataOf = (s) => JSON.parse(s.element["element-data"]);
const colNames = (s) => dataOf(s).columns.map((c) => c.name);

describe("pages without a page inventory", () => {
  it("leave out Page QA, so its URL lands on the Overview", () => {
    const pages = pagesFor([]);
    expect(pages.map((p) => p.url_slug)).toEqual(["overview", "tickets", "ticket"]);
    expect(findQaPage(pages, "page").url_slug).toBe("overview");
  });

  it("an install from before switches keeps every page", () => {
    expect(pagesFor(undefined).map((p) => p.url_slug)).toEqual(["overview", "tickets", "ticket", "page"]);
  });

  it("give the Overview no page figures, stages or page tables; a site is its name and tickets bar", () => {
    const o = page([], "overview");
    expect(ids(o)).toEqual([
      "qa_overview_crumb", "qa_overview_title", "qa_overview_ticket_counts",
      "qa_overview_alphapage_title", "qa_overview_alphapage_tickets",
      "qa_overview_activity", "qa_overview_activity_filters", "qa_overview_activity_list",
    ]);
    expect(sectionById(o, "qa_overview_title").size).toBe("2/3");
    const siteGroup = o.section_groups.find((g) => g.name === "overview_site_alphapage");
    expect(siteGroup.collapsible).toBeUndefined();
    expect(o.section_groups.map((g) => g.name)).not.toContain("overview_stages");
  });

  it("read no section from the pages or stories dataset", () => {
    for (const p of pagesFor([])) {
      for (const s of p.sections.filter((x) => x.element["element-type"] !== "lexical")) {
        expect([datasets.pages.slug, datasets.stories.slug]).not.toContain(dataOf(s).externalSource.type);
      }
    }
  });

  it("link nowhere to Page QA", () => {
    for (const p of pagesFor([])) expect(JSON.stringify(p)).not.toContain("/page?key=");
  });

  it("drop the ticket header's open-page link and stage meter, keeping the target as text", () => {
    const t = page([], "ticket");
    expect(colNames(sectionById(t, "qa_ticket_crumb")).some((n) => n.includes("open_url"))).toBe(false);
    const target = dataOf(sectionById(t, "qa_ticket_target"));
    expect(target.columns.map((c) => c.name)).not.toContain("p.stage");
    expect(target.display.cellsGridSize).toBe(4);
  });

  it("say what switching a site on does when none is covered", () => {
    const o = page([], "overview", { ...ctx, sites: [] });
    const note = dataOf(sectionById(o, "qa_overview_no_sites"));
    expect(note.columns.find((c) => c.name === "ns_body").staticValue).toContain("Report an issue");
    expect(o.section_groups.find((g) => g.name === "overview_stages").displayName).toBe("Sites");
  });
});

describe("pages with a page inventory but no stages", () => {
  const f = ["page_inventory", "stories"];

  it("give the Overview a pages figure alone, no stages card and no stage bar", () => {
    const o = page(f, "overview");
    expect(ids(o)).not.toContain("qa_overview_stages");
    const counts = dataOf(sectionById(o, "qa_overview_page_counts"));
    expect(counts.columns.map((c) => c.normalName)).toEqual(["n_pages"]);
    expect(counts.display.cellsGridSize).toBe(1);
    expect(colNames(sectionById(o, "qa_overview_alphapage_title"))).not.toContain("count(*)::text as bar_total");
  });

  it("list a site's pages by name, without a Stage column", () => {
    const table = dataOf(sectionById(page(f, "overview"), "qa_overview_alphapage_pages"));
    const names = table.columns.map((c) => c.name);
    expect(names).not.toContain("ds.stage");
    expect(names.some((n) => n.includes("stage_rank"))).toBe(false);
    expect(table.columns.find((c) => c.name === "ds.name").sort).toBe("asc");
  });

  it("open Page QA's rail with its title, without the stage list", () => {
    const p = page(f, "page");
    expect(ids(p)).not.toContain("qa_page_stage");
    expect(ids(p)[ids(p).indexOf("qa_page_status_title") + 1]).toBe("qa_page_facts");
  });

  it("keep the ticket's page a link, without the stage meter", () => {
    const target = dataOf(sectionById(page(f, "ticket"), "qa_ticket_target"));
    expect(target.columns.find((c) => c.normalName === "target_disp").isLink).toBe(true);
    expect(target.columns.map((c) => c.name)).not.toContain("p.stage");
  });
});

describe("pages without stories", () => {
  it("leave Page QA's stories out", () => {
    const p = page(["page_inventory", "page_stages"], "page");
    expect(ids(p).filter((id) => id.startsWith("qa_page_stories"))).toEqual([]);
    expect(ids(p)).toContain("qa_page_stage");
  });
});

describe("Cards of static cells", () => {
  it("carry a hidden count, so they show over an empty dataset", () => {
    const o = page([], "overview", { ...ctx, sites: [] });
    const install0 = install([]);
    const noHistory = buildQaPages({ ...install0, qa: { ...install0.qa, datasets: { ...datasets, history: undefined } } }, ctx)
      .find((p) => p.url_slug === "overview");
    for (const s of [sectionById(o, "qa_overview_crumb"), sectionById(o, "qa_overview_title"), sectionById(o, "qa_overview_no_sites"), sectionById(noHistory, "qa_overview_activity")]) {
      const one = dataOf(s).columns.find((c) => c.normalName === "one_row");
      expect(one).toMatchObject({ selectOnly: true, fn: "exempt" });
    }
  });
});

describe("the ticket's page name", () => {
  it("falls back to the name the ticket was filed with before the raw key", () => {
    const table = dataOf(sectionById(page([], "tickets"), "qa_tickets_table"));
    const disp = table.columns.find((c) => c.normalName === "page_disp").name;
    expect(disp.indexOf("p.data->>'name'")).toBeLessThan(disp.indexOf("data->>'page_name'"));
    expect(disp.indexOf("data->>'page_name'")).toBeLessThan(disp.lastIndexOf("data->>'page_key'"));
  });
});

// ── track-on-publish and Configure's backfill ──

const fakeRows = (rowsByRef) => async (ref) => rowsByRef[ref.slug] || [];

describe("track-on-publish", () => {
  const covered = [{ pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", sort_order: "1", enabled: "yes" }];

  it("skips an install with its page inventory off, reading nothing", async () => {
    const reads = [];
    const created = [];
    const tracked = await trackPublishedPage({
      page: { url_slug: "home", title: "Home" }, patternKeys: ["alphapage"],
      qaInstalls: [install([]), install(["page_inventory"])].map((p, i) => ({ ...p, name: `i${i}` })),
      loadRows: async (ref, cols) => { reads.push(ref.slug); return ref.slug === datasets.patterns.slug ? covered : []; },
      createRow: async (ref, row) => created.push(row),
    });
    expect(tracked).toEqual([{ install: "i1", page_key: "alphapage:home" }]);
    expect(created).toHaveLength(1);
  });
});

describe("saveConfigure and the page inventory", () => {
  const pattern = { id: 5, name: "AlphaPage", type: "qa_test|alphapage:pattern", pattern_type: "page" };
  const savedEntry = {
    pattern, enabled: true, surface: "alphapage", surface_label: "AlphaPage", include_slugs: "", sort_order: 1,
    row: { id: 9, pattern: "alphapage", surface: "alphapage", surface_label: "AlphaPage", enabled: "yes", include_slugs: "", sort_order: "1" },
  };
  const run = async (options, entries = [savedEntry]) => {
    const created = [];
    const result = await saveConfigure({
      entries, datasets, app: "qa_test", now: "2026-10-13T00:00:00Z",
      loadRows: fakeRows({}), createRow: async (ref, data) => created.push({ ref: ref.slug, data }), updateRow: async () => {},
      loadPages: async () => [{ url_slug: "home", title: "Home", published: "published" }],
      ...options,
    });
    return { created: created.filter((c) => c.ref === datasets.pages.slug), result };
  };

  it("adds every covered site's pages when the inventory is just switched on", async () => {
    const { created, result } = await run({ trackPages: true, backfillAll: true });
    expect(created.map((c) => c.data.page_key)).toEqual(["alphapage:home"]);
    expect(result.added).toEqual([{ pattern: "AlphaPage", pages: 1 }]);
  });

  it("leaves an unchanged site alone otherwise", async () => {
    expect((await run({})).created).toEqual([]);
  });

  it("adds no pages with the inventory off, even for a site just switched on", async () => {
    const justOn = { ...savedEntry, row: undefined };
    expect((await run({ trackPages: false }, [justOn])).created).toEqual([]);
    expect((await run({}, [justOn])).created).toHaveLength(1);
  });
});

// ── installQa keeps the install's switches ──

// An in-memory falcor over DMS rows: reads by id and dataset name, creates, and edits that replace
// each top-level key they name (as dms.data.edit does).
function fakeFalcor(rows) {
  const store = new Map(Object.entries(rows).map(([id, r]) => [+id, r]));
  let next = 900;
  return {
    store,
    invalidate: async () => {},
    get: async (path) => {
      if (path[1] === "sourceIdBySlug") return { json: { dms: { sourceIdBySlug: { [path[2]]: {} } } } };
      const [, , app, , id] = path;
      const r = store.get(+id);
      return { json: { dms: { data: { [app]: { byId: { [id]: r ? { id, type: r.type, data: r.data } : undefined } } } } } };
    },
    call: async (path, args) => {
      const [, a, b] = args;
      if (path[2] === "edit") {
        const r = store.get(+a);
        r.data = { ...r.data, ...b };
        return {};
      }
      const id = next++;
      store.set(id, { type: a, data: b });
      return { json: { dms: { data: { byId: { [id]: {} } } } } };
    },
  };
}

describe("installQa", () => {
  // every dataset already set up, and its change history on, except (optionally) one missing
  const rowsFor = (qa, missing) => {
    const rows = {
      7: { type: "qa_test|sw:pattern", data: { name: "Sw", dmsEnvId: 42, authPermissions: "{}", qa } },
      42: { type: "qa_test|env:dmsenv", data: { name: "env", sources: [] } },
    };
    for (const d of QA_DATASETS) {
      if (d.key === missing) continue;
      const ref = datasets[d.key];
      rows[ref.source_id] = {
        type: `env|${ref.slug}:source`,
        data: d.key === "history"
          ? { config: JSON.stringify({ attributes: QA_DATASETS.find((x) => x.key === "history").attributes }) }
          : QA_TRACKED_COLUMNS[d.key] ? { change_history: { target: {} } } : {},
      };
    }
    return rows;
  };
  const run = (qa, missing) => {
    const falcor = fakeFalcor(rowsFor(qa, missing));
    const have = Object.fromEntries(Object.entries(datasets).filter(([k]) => k !== missing));
    return installQa({ falcor, app: "qa_test", siteId: 1, siteInstance: "qa_test", patternId: 7, instance: "sw", installName: "Sw", patterns: [] })
      .then(() => ({ falcor, have }));
  };

  it("keeps the install's switches when it re-runs", async () => {
    const { falcor } = await run({ version: 1, datasets, features: ["page_inventory"] });
    expect(falcor.store.get(7).data.qa).toMatchObject({ version: 1, features: ["page_inventory"] });
  });

  it("keeps them through the write after each dataset it creates", async () => {
    const { falcor } = await run({ version: 1, datasets: { ...datasets, history: undefined }, features: [] }, "history");
    const qa = falcor.store.get(7).data.qa;
    expect(qa.features).toEqual([]);
    expect(qa.datasets.history).toBeTruthy();
  });

  it("leaves an install from before switches without a list", async () => {
    const { falcor } = await run({ version: 1, datasets });
    expect("features" in falcor.store.get(7).data.qa).toBe(false);
  });
});
