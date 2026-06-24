/**
 * Change A — option-list loads (Filter controls) skip the length round-trip.
 *
 * A Filter control only enumerates a column's distinct values: no pagination,
 * nothing displays a total. getData should NOT issue a `udaLength` request for
 * these — it fetches up to a ceiling (display.optionsLimit, default 1000) and
 * takes length = data.length. Paginated sections must STILL fetch length, and
 * sections that don't opt in are unchanged (backward compatible).
 *
 * getData takes apiLoad as an injected dependency, so we drive it with a
 * recording stub (DI, not mocking the unit under test).
 */
import { describe, it, expect } from "vitest";

import { getData } from "../src/patterns/page/components/sections/components/dataWrapper/getData.js";

const srcCol = (name, type = "character varying", display = "text", o = {}) => ({ name, type, display, ...o });
const col = (name, o = {}) => ({ name, show: true, ...o });

// A grouped single-column distinct-value state — what a Filter control produces.
const optionsState = (displayOverrides = {}) => ({
  externalSource: {
    source_id: 100,
    view_id: 200,
    isDms: false,
    columns: [srcCol("region_name")],
  },
  columns: [col("region_name", { group: true })],
  filters: null,
  pageFilters: null,
  display: { pageSize: 10, usePagination: false, ...displayOverrides },
  data: [],
});

// Records each apiLoad call's action; returns a length for udaLength and rows for data.
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

const REGIONS = [{ region_name: "Region 1" }, { region_name: "Region 2" }, { region_name: "Region 3" }];

describe("getData — optionsOnly (Change A: skip length for option lists)", () => {
  it("does NOT issue a udaLength request when optionsOnly + grouped + not paginated", async () => {
    const { apiLoad, calls } = makeApiLoad(REGIONS);
    const res = await getData({ state: optionsState(), apiLoad, optionsOnly: true });

    expect(calls.some((c) => c.action === "udaLength")).toBe(false);
    expect(res.length).toBe(REGIONS.length); // length recovered from the fetched rows
    expect(res.data).toHaveLength(REGIONS.length);
  });

  it("bounds the fetch with the options ceiling (toIndex = optionsLimit - 1, fromIndex 0)", async () => {
    const { apiLoad, calls } = makeApiLoad(REGIONS);
    await getData({ state: optionsState({ optionsLimit: 250 }), apiLoad, optionsOnly: true });

    const dataCall = calls.find((c) => c.action === "uda");
    expect(dataCall.filter.fromIndex).toBe(0);
    expect(dataCall.filter.toIndex).toBe(249);
  });

  it("STILL issues udaLength for a paginated grouped section (pagination guard)", async () => {
    const { apiLoad, calls } = makeApiLoad(REGIONS);
    await getData({ state: optionsState({ usePagination: true }), apiLoad, optionsOnly: true });

    expect(calls.some((c) => c.action === "udaLength")).toBe(true);
  });

  it("STILL issues udaLength when optionsOnly is not set (backward compatible)", async () => {
    const { apiLoad, calls } = makeApiLoad(REGIONS);
    await getData({ state: optionsState(), apiLoad });

    expect(calls.some((c) => c.action === "udaLength")).toBe(true);
  });
});
