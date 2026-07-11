/**
 * Regression test for external-source-editable-crud.md's "id undefined" bug fix.
 *
 * getData.js decides which column to request/alias as a row's `.id` (needed by
 * dataWrapper's update/delete/live-edit, which all key rows by `row.id`). DMS split
 * tables always have a real `id` column; external (DAMA) sources can have a primary
 * key on any column, so an editable external source now asks for a literal "id"
 * attribute too (mirroring the isDms request) and lets the server resolve it live
 * (uda.controller.js's resolveIdAttribute) rather than the client tracking the PK
 * column name itself.
 *
 * This test exists specifically to prove that change is additive — isDms behavior,
 * and non-editable external behavior, are both byte-identical to before the fix.
 */
import { describe, it, expect } from "vitest";

import { getData } from "../src/patterns/page/components/sections/components/dataWrapper/getData.js";

const srcCol = (name, type = "character varying", display = "text", o = {}) => ({ name, type, display, ...o });
const col = (name, o = {}) => ({ name, show: true, ...o });

const ROWS = [{ title: "Row 1" }, { title: "Row 2" }];

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

// A plain (non-grouped, paginated) listing state — the shape a Card/Spreadsheet
// section actually uses, as opposed to optionsState's grouped Filter-control shape.
const listState = ({ isDms = false, isEditable = false, join } = {}) => ({
  externalSource: {
    source_id: 100,
    view_id: 200,
    isDms,
    isEditable,
    columns: [srcCol("title")],
  },
  columns: [col("title")],
  filters: null,
  pageFilters: null,
  display: { pageSize: 10, usePagination: true },
  data: [],
  join: join || { sources: {} },
});

const dataAttributes = (calls) => calls.find((c) => c.action === "uda")?.filter?.attributes || [];
const dataOrderBy = (calls) => JSON.parse(calls.find((c) => c.action === "uda")?.filter?.options || "{}").orderBy || {};

// A complete join, mirroring buildUdaConfig.test.js's fixture — used to prove the
// editable-external + join combination is left alone (documented follow-on gap),
// not silently broken.
const completeJoin = () => ({
  sources: {
    ds: {},
    table2: {
      source: 2,
      view: 202,
      mergeStrategy: "join",
      type: "left",
      joinColumns: [{ dsColumn: "id", joinSourceColumn: "related_id" }],
      sourceInfo: {
        env: "dama_other",
        columns: [srcCol("related_id", "integer", "number")],
      },
    },
  },
});

describe("getData — id column resolution (isDms unaffected by external-editable support)", () => {
  it("isDms: requests a literal 'id' attribute and orders by it — unchanged behavior", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: listState({ isDms: true }), apiLoad });

    expect(dataAttributes(calls)).toContain("id");
    expect(Object.keys(dataOrderBy(calls))).toContain("id");
  });

  it("isDms + join: requests 'ds.id as id' and orders by 'ds.id' — unchanged behavior", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: listState({ isDms: true, join: completeJoin() }), apiLoad });

    expect(dataAttributes(calls)).toContain("ds.id as id");
    expect(Object.keys(dataOrderBy(calls))).toContain("ds.id");
  });

  it("external + isEditable: requests a literal 'id' attribute (server resolves the real PK)", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: listState({ isDms: false, isEditable: true }), apiLoad });

    expect(dataAttributes(calls)).toContain("id");
    expect(Object.keys(dataOrderBy(calls))).toContain("id");
  });

  it("external + NOT editable: never requests 'id' — unchanged pre-existing behavior", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: listState({ isDms: false, isEditable: false }), apiLoad });

    expect(dataAttributes(calls)).not.toContain("id");
    expect(Object.keys(dataOrderBy(calls))).not.toContain("id");
  });

  it("external + isEditable + join present: no 'id' requested (documented follow-on gap, not a crash)", async () => {
    const { apiLoad, calls } = makeApiLoad(ROWS);
    await getData({ state: listState({ isDms: false, isEditable: true, join: completeJoin() }), apiLoad });

    expect(dataAttributes(calls)).not.toContain("id");
    expect(dataAttributes(calls)).not.toContain("ds.id as id");
  });
});
