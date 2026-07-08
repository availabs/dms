/**
 * Falcor sibling-query cache collision — cache-key discriminator.
 *
 * Two sibling AVL Graph/Spreadsheet sections whose filter/groupBy/join happen
 * to match (same route, different measure; or a byte-identical query) build
 * the same `options` JSON, which becomes their Falcor path
 * (`uda.<env>.viewsById.<id>.options.<optionsStr>...`). Sharing that path
 * silently drops one sibling's data (see
 * planning/tasks/current/falcor-sibling-query-cache-collision.md).
 *
 * Fix: getData takes an optional `sectionId` and folds `trackingId || sectionId`
 * into `options` before it's stringified into the Falcor path — for both the
 * main data fetch and the length fetch (which strips orderBy/meta but inherits
 * whatever else is on `options`). The server ignores the extra key (its query
 * builders destructure only known fields out of `JSON.parse(options)`), so this
 * only changes the cache key, never the SQL.
 *
 * getData takes apiLoad as an injected dependency, so we drive it with a
 * recording stub (DI, not mocking the unit under test).
 */
import { describe, it, expect } from "vitest";

import { getData } from "../src/patterns/page/components/sections/components/dataWrapper/getData.js";

const srcCol = (name, type = "character varying", display = "text", o = {}) => ({ name, type, display, ...o });
const col = (name, o = {}) => ({ name, show: true, ...o });

// Two sections pointed at the same route/filter, differing only in which
// measure column they display — the exact shape of the reported 1071 bug
// (same filter/groupBy, different attribute).
const graphState = (columnName) => ({
  externalSource: {
    source_id: 100,
    view_id: 200,
    isDms: false,
    columns: [srcCol("date"), srcCol(columnName, "numeric", "number")],
  },
  columns: [col("date", { group: true }), col(columnName, { fn: "avg" })],
  filters: null,
  pageFilters: null,
  display: { pageSize: 10 },
  data: [],
});

function makeApiLoad(rows) {
  const calls = [];
  const apiLoad = async (arg) => {
    const child = arg?.children?.[0];
    calls.push({ action: child?.action, filter: child?.filter });
    if (child?.action === "udaLength") return rows.length;
    return rows;
  };
  return { apiLoad, calls };
}

const ROWS = [{ date: "2026-01-01" }];

describe("getData — sectionId cache-key discriminator", () => {
  it("gives two sections with identical filter/groupBy but different sectionId different options strings", async () => {
    const a = makeApiLoad(ROWS);
    const b = makeApiLoad(ROWS);

    await getData({ state: graphState("speed_avg"), apiLoad: a.apiLoad, sectionId: "section-A" });
    await getData({ state: graphState("speed_avg"), apiLoad: b.apiLoad, sectionId: "section-B" });

    const optionsA = a.calls.find((c) => c.action === "uda").filter.options;
    const optionsB = b.calls.find((c) => c.action === "uda").filter.options;
    expect(optionsA).not.toBe(optionsB);

    const lenOptionsA = a.calls.find((c) => c.action === "udaLength").filter.options;
    const lenOptionsB = b.calls.find((c) => c.action === "udaLength").filter.options;
    expect(lenOptionsA).not.toBe(lenOptionsB);
  });

  it("byte-identical queries (same columns) still decorrelate by sectionId alone", async () => {
    const a = makeApiLoad(ROWS);
    const b = makeApiLoad(ROWS);

    await getData({ state: graphState("speed_avg"), apiLoad: a.apiLoad, sectionId: "comp-2" });
    await getData({ state: graphState("speed_avg"), apiLoad: b.apiLoad, sectionId: "comp-3" });

    const optionsA = a.calls.find((c) => c.action === "uda").filter.options;
    const optionsB = b.calls.find((c) => c.action === "uda").filter.options;
    expect(optionsA).not.toBe(optionsB);
  });

  it("same sectionId on both calls reproduces the identical options string (dedup/caching still works)", async () => {
    const a = makeApiLoad(ROWS);
    const b = makeApiLoad(ROWS);

    await getData({ state: graphState("speed_avg"), apiLoad: a.apiLoad, sectionId: "section-A" });
    await getData({ state: graphState("speed_avg"), apiLoad: b.apiLoad, sectionId: "section-A" });

    const optionsA = a.calls.find((c) => c.action === "uda").filter.options;
    const optionsB = b.calls.find((c) => c.action === "uda").filter.options;
    expect(optionsA).toBe(optionsB);
  });

  it("omitting sectionId leaves options unchanged (no regression for callers that don't pass it)", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: graphState("speed_avg"), apiLoad });

    const options = JSON.parse(calls.find((c) => c.action === "uda").filter.options);
    expect(options).not.toHaveProperty("sectionId");
  });

  it("does not add sectionId to the requested attributes list", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: graphState("speed_avg"), apiLoad, sectionId: "section-A" });

    const attributes = calls.find((c) => c.action === "uda").filter.attributes;
    expect(attributes.some((a) => a.includes("sectionId"))).toBe(false);
  });
});
