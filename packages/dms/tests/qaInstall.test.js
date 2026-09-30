/**
 * Adding a `qa` install (phase 2): which data environment its datasets go in, what gets created,
 * the URL check that runs before its pattern row exists, and the Tickets page binding to the
 * install's own tickets dataset. The dataset-name check goes to the server
 * (dms.sourceIdBySlug) and is verified live, not here.
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaInstall.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { pickQaEnvironment, planQaDatasets, qaPreflight } from "../src/patterns/qa/install";
import { QA_DATASETS } from "../src/patterns/qa/datasets";
import { buildQaPages } from "../src/patterns/qa/pages";

const env = (id, name = "default") => ({ id, type: `site|${name}:dmsenv`, name });

describe("pickQaEnvironment", () => {
  it("uses the site's Datasets pattern's environment", () => {
    const envs = [env(10, "first"), env(11, "data_env")];
    const patterns = [{ pattern_type: "page" }, { pattern_type: "datasets", dmsEnvId: 11 }];
    expect(pickQaEnvironment({ patterns, dmsEnvs: envs }).id).toBe(11);
  });

  it("falls back to the site's first environment", () => {
    expect(pickQaEnvironment({ patterns: [{ pattern_type: "page" }], dmsEnvs: [env(10), env(11)] }).id).toBe(10);
  });

  it("returns null when the site has none, so the install creates a default one", () => {
    expect(pickQaEnvironment({ patterns: [{ pattern_type: "datasets", dmsEnvId: 5 }], dmsEnvs: [] })).toBeNull();
  });
});

describe("planQaDatasets", () => {
  const plan = planQaDatasets({ app: "qa_test", envInstance: "default", instance: "phase2", installName: "Phase2" });

  it("plans every dataset, named <install>_<key>, in the environment", () => {
    expect(plan.map((s) => s.slug)).toEqual(QA_DATASETS.map((d) => `phase2_${d.key}`));
    expect(plan[0]).toMatchObject({
      sourceType: "default|phase2_tickets:source",
      viewType: "phase2_tickets|v1:view",
      viewRef: "qa_test+phase2_tickets|view",
      envSourceRef: "qa_test+default|source",
    });
  });

  it("creates internal-table sources carrying the dataset's columns", () => {
    plan.forEach((step, i) => {
      expect(step.source.type).toBe("internal_table");
      expect(step.source.name).toBe(`Phase2 — ${QA_DATASETS[i].name}`);
      expect(JSON.parse(step.source.config).attributes).toEqual(QA_DATASETS[i].attributes);
    });
  });

  it("adopts a dataset an interrupted run already created, and creates the rest", () => {
    const resumed = planQaDatasets({
      app: "qa_test", envInstance: "default", instance: "phase2", installName: "Phase2",
      existing: { phase2_tickets: 78, phase2_pages: 80 },
    });
    expect(resumed.filter((s) => s.adoptSourceId).map((s) => [s.key, s.adoptSourceId])).toEqual([["tickets", 78], ["pages", 80]]);
    expect(resumed.filter((s) => !s.adoptSourceId).map((s) => s.key)).toEqual(["stories", "patterns", "history"]);
  });

  it("skips datasets the install already has", () => {
    const again = planQaDatasets({
      app: "qa_test", envInstance: "default", instance: "phase2", installName: "Phase2",
      have: { tickets: { slug: "phase2_tickets", source_id: 1, view_id: 2 } },
    });
    expect(again.map((s) => s.key)).toEqual(QA_DATASETS.map((d) => d.key).filter((k) => k !== "tickets"));
  });
});

describe("qaPreflight URL check", () => {
  const siblings = [{ name: "AlphaPage", base_url: "alphapage", subdomain: "" }, { name: "Everywhere", base_url: "shared", subdomain: "*" }];

  it("refuses a URL another pattern on the site already serves", async () => {
    expect(await qaPreflight({ falcor: null, app: "a", instance: "x", siblings, pattern: { base_url: "/alphapage/" } }))
      .toMatch(/already used by the "AlphaPage" pattern/);
  });

  it("treats a pattern on every sub-domain as clashing on any sub-domain", async () => {
    expect(await qaPreflight({ falcor: null, app: "a", instance: "x", siblings, pattern: { base_url: "shared", subdomain: "tsmo" } }))
      .toMatch(/"Everywhere"/);
  });
});

describe("Tickets page binding", () => {
  const tickets = { slug: "phase2_tickets", source_id: 101, view_id: 102 };
  const pattern = { name: "Phase2", qa: { datasets: { tickets } } };

  it("keeps the placeholder when the install has no datasets", () => {
    const [ticketsPage] = buildQaPages({ name: "QA" }, "qa_test");
    expect(ticketsPage.sections.map((s) => s.element["element-type"])).toEqual(["lexical"]);
  });

  it("binds a Spreadsheet to the install's own tickets dataset", () => {
    const [ticketsPage] = buildQaPages(pattern, "qa_test");
    const list = ticketsPage.sections.find((s) => s.element["element-type"] === "Spreadsheet");
    const data = JSON.parse(list.element["element-data"]);
    expect(data.externalSource).toMatchObject({
      isDms: true, app: "qa_test", type: "phase2_tickets", source_id: 101, view_id: 102, env: "qa_test+phase2_tickets",
    });
    expect(data.display).toMatchObject({ allowAdddNew: true, allowEditInView: true });
    expect(list.trackingId).toBe("qa_tickets_list");
    expect(list).not.toHaveProperty("id");
  });
});
