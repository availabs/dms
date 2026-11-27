/**
 * A page of rows doesn't wait for the count.
 *
 * The count and the rows are two full runs of the same query. getData used to await the count before it asked
 * for rows, to cut the window to the result's end. A paged section's window comes from the pager, so the two
 * now go out together and the rows are cut to the count when both are back. A load of all rows still waits:
 * the count is its window.
 */
import { describe, it, expect } from "vitest";

import { getData } from "../src/patterns/page/components/sections/components/dataWrapper/getData.js";

const state = (display = {}) => ({
  externalSource: { source_id: 100, view_id: 200, isDms: false, columns: [{ name: "name", type: "text", display: "text" }] },
  columns: [{ name: "name", show: true }],
  filters: null,
  pageFilters: null,
  display: { pageSize: 10, usePagination: true, ...display },
  data: [],
});

// The server answers a window past the end with rows that have nothing in them; `total` is the real count.
function makeApiLoad(total) {
  const calls = [];
  let release;
  const countGate = new Promise((r) => { release = r; });
  const apiLoad = async (arg) => {
    const child = arg?.children?.[0];
    calls.push({ action: child?.action, filter: child?.filter });
    if (child?.action === "udaLength") { await countGate; return total; }
    const { fromIndex, toIndex } = child.filter;
    return Array.from({ length: toIndex + 1 - fromIndex }, (v, i) => (fromIndex + i < total ? { name: `row ${fromIndex + i}` } : {}));
  };
  return { apiLoad, calls, release };
}

describe("getData: the count and a page of rows go out together", () => {
  it("asks for the rows while the count is still out", async () => {
    const { apiLoad, calls, release } = makeApiLoad(4);
    const pending = getData({ state: state(), apiLoad });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.map((c) => c.action)).toEqual(["udaLength", "uda"]);
    release();
    const res = await pending;
    expect(res.length).toBe(4);
    expect(res.data.map((r) => r.name)).toEqual(["row 0", "row 1", "row 2", "row 3"]);
  });

  it("asks for the pager's window and cuts it to the result's end", async () => {
    const { apiLoad, calls, release } = makeApiLoad(13);
    release();
    const res = await getData({ state: state(), apiLoad, currentPage: 1 });
    const rows = calls.find((c) => c.action === "uda").filter;
    expect([rows.fromIndex, rows.toIndex]).toEqual([10, 19]);
    expect(res.length).toBe(13);
    expect(res.data.map((r) => r.name)).toEqual(["row 10", "row 11", "row 12"]);
  });

  it("returns no rows for an empty result, and the blank row when the section asks for one", async () => {
    const a = makeApiLoad(0); a.release();
    expect(await getData({ state: state(), apiLoad: a.apiLoad })).toEqual({ length: 0, data: [] });
    const b = makeApiLoad(0); b.release();
    const res = await getData({ state: state({ useBlankRowFallback: true }), apiLoad: b.apiLoad });
    expect(res.length).toBe(1);
    expect(res.data[0]._isBlankFallback).toBe(true);
  });

  it("a page past the end returns no rows and the real count", async () => {
    const { apiLoad, release } = makeApiLoad(4); release();
    expect(await getData({ state: state(), apiLoad, currentPage: 3 })).toEqual({ length: 4, data: [] });
  });

  it("a load of all rows still waits for the count, which is its window", async () => {
    const { apiLoad, calls, release } = makeApiLoad(4);
    const pending = getData({ state: state(), apiLoad, fullDataLoad: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(calls.map((c) => c.action)).toEqual(["udaLength"]);
    release();
    const res = await pending;
    expect(calls.find((c) => c.action === "uda").filter.toIndex).toBe(3);
    expect(res.data).toHaveLength(4);
  });

  it("a count the caller already has is not asked for again", async () => {
    const { apiLoad, calls } = makeApiLoad(13);
    const res = await getData({ state: state(), apiLoad, currentPage: 1, knownLength: 13 });
    expect(calls.map((c) => c.action)).toEqual(["uda"]);
    expect(res.data).toHaveLength(3);
  });
});
