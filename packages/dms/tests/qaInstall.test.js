/**
 * Adding a `qa` install (phase 2): which data environment its datasets go in, what gets created,
 * and the URL check that runs before its pattern row exists. The dataset-name check goes to the server
 * (dms.sourceIdBySlug) and is verified live, not here.
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaInstall.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { pickQaEnvironment, planQaChangeHistory, planQaDatasets, qaPreflight } from "../src/patterns/qa/install";
import { QA_DATASETS, QA_TRACKED_COLUMNS } from "../src/patterns/qa/datasets";

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

describe("planQaChangeHistory", () => {
  const ref = (source_id, view_id) => ({ slug: `qa_${source_id}`, source_id, view_id });
  const datasets = { tickets: ref(10, 11), pages: ref(20, 21), stories: ref(30, 31), patterns: ref(40, 41), history: ref(50, 51) };
  const historyColumns = QA_DATASETS.find((d) => d.key === "history").attributes;
  const fresh = { tickets: {}, pages: {}, stories: {}, history: { config: JSON.stringify({ attributes: historyColumns }) } };

  it("points tickets, pages and stories at the install's history, with their workflow columns", () => {
    const edits = planQaChangeHistory({ datasets, sources: fresh });
    expect(edits.map((e) => [e.key, e.sourceId])).toEqual([["tickets", 10], ["pages", 20], ["stories", 30]]);
    edits.forEach((e) => expect(e.data.change_history).toEqual({
      target: { source_id: 50, view_id: 51 }, columns: QA_TRACKED_COLUMNS[e.key],
    }));
    expect(QA_TRACKED_COLUMNS.tickets).toEqual(["status", "severity", "priority", "category", "assignee", "outcome"]);
  });

  it("keeps a setting a dataset already has (an admin's choice survives a re-run)", () => {
    const sources = { ...fresh, tickets: { change_history: { target: { source_id: 99, view_id: 98 }, columns: "*" } } };
    expect(planQaChangeHistory({ datasets, sources }).map((e) => e.key)).toEqual(["pages", "stories"]);
  });

  it("appends the history columns an older install lacks, keeping its own", () => {
    const old = [...historyColumns.filter((a) => a.name !== "source_id"), { name: "note", type: "text" }];
    const edits = planQaChangeHistory({ datasets, sources: { ...fresh, history: { config: JSON.stringify({ attributes: old }) } } });
    const history = edits.find((e) => e.key === "history");
    expect(history.sourceId).toBe(50);
    expect(JSON.parse(history.data.config).attributes.map((a) => a.name)).toEqual([...old.map((a) => a.name), "source_id"]);
  });

  it("has nothing to do once switched on, and nothing without a history dataset", () => {
    const on = Object.fromEntries(Object.entries(fresh).map(([k, v]) => [k, k === "history" ? v : { change_history: { columns: ["x"] } }]));
    expect(planQaChangeHistory({ datasets, sources: on })).toEqual([]);
    expect(planQaChangeHistory({ datasets: { ...datasets, history: undefined }, sources: fresh })).toEqual([]);
  });
});

describe("qaPreflight URL check", () => {
  const siblings = [{ name: "AlphaPage", base_url: "alphapage", subdomain: "" }, { name: "Everywhere", base_url: "shared", subdomain: "*" }];

  it("refuses a URL another pattern on the site already serves", async () => {
    expect(await qaPreflight({ falcor: null, app: "a", instance: "x", siblings, pattern: { base_url: "/alphapage/" } }))
      .toMatch(/already used by the "AlphaPage" pattern/);
  });

  it("treats a pattern on every sub-domain as clashing on any sub-domain", async () => {
    expect(await qaPreflight({ falcor: null, app: "a", instance: "x", siblings, pattern: { base_url: "shared", subdomain: "docs" } }))
      .toMatch(/"Everywhere"/);
  });
});
