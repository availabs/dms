/**
 * Unit tests for buildUdaConfig.js — the pure function that produces UDA options
 * from persisted data source state.
 *
 * Run: npm test
 * Watch: npm run test:watch
 */

import { describe, it, expect } from "vitest";

import {
  isCalculatedCol,
  attributeAccessorStr,
  refName,
  applyFn,
  reqName,
  totalName,
  mapFilterGroupCols,
  extractHavingFromFilterGroups,
  extractNormalFiltersFromGroups,
  applyPageFilters,
  buildColumnsWithSettings,
  getColumnsToFetch,
  buildUdaConfig,
  legacyStateToBuildInput,
  computeOutputSourceInfo,
  buildJoin,
  buildJoinSources,
  buildJoinOnClause,
  applyTableAliasToJoin,
} from "../src/patterns/page/components/sections/components/dataWrapper/buildUdaConfig.js";

// ─── Helper: column shorthand ────────────────────────────────────────────────

const col = (name, overrides = {}) => ({ name, show: true, ...overrides });
const srcCol = (name, type = "text", display = "text", overrides = {}) => ({ name, type, display, ...overrides });

// ─── isCalculatedCol ─────────────────────────────────────────────────────────

describe("isCalculatedCol", () => {
  it("returns false for plain columns", () => {
    expect(isCalculatedCol({ name: "county", type: "text", display: "text" })).toBe(false);
  });

  it("detects display: calculated", () => {
    expect(isCalculatedCol({ name: "x", display: "calculated" })).toBe(true);
  });

  it("detects type: calculated", () => {
    expect(isCalculatedCol({ name: "x", type: "calculated" })).toBe(true);
  });

  it("detects origin: calculated-column", () => {
    expect(isCalculatedCol({ name: "x", origin: "calculated-column" })).toBe(true);
  });

  it("detects SQL expression with AS", () => {
    expect(isCalculatedCol({ name: "count(*) as total" })).toBe(true);
  });

  it("case-insensitive AS detection", () => {
    expect(isCalculatedCol({ name: "count(*) AS total" })).toBe(true);
  });
});

// ─── attributeAccessorStr ────────────────────────────────────────────────────

describe("attributeAccessorStr", () => {
  it("DAMA mode: returns plain column name", () => {
    expect(attributeAccessorStr("county", false, false, false)).toBe("county");
  });

  it("DMS mode: wraps in data->>", () => {
    expect(attributeAccessorStr("county", true, false, false)).toBe("data->>'county'");
  });

  it("calculated col: returns expression before AS", () => {
    expect(attributeAccessorStr("count(*) as total", true, true, false)).toBe("count(*)");
  });

  it("system col: returns plain name even in DMS mode", () => {
    expect(attributeAccessorStr("id", true, false, true)).toBe("id");
  });

  it("col already containing data->>: returns as-is", () => {
    expect(attributeAccessorStr("data->>'county' as county", true, false, false)).toBe("data->>'county'");
  });
});

// ─── refName ─────────────────────────────────────────────────────────────────

describe("refName", () => {
  it("DAMA: plain column name", () => {
    expect(refName({ name: "county" }, false)).toBe("county");
  });

  it("DMS: data->> accessor", () => {
    expect(refName({ name: "county" }, true)).toBe("data->>'county'");
  });

  it("calculated column: expression only", () => {
    expect(refName({ name: "sum(val) as total", display: "calculated" }, true)).toBe("sum(val)");
  });

  it("system col in DMS: plain name", () => {
    expect(refName({ name: "id", systemCol: true }, true)).toBe("id");
  });
});

// ─── applyFn ─────────────────────────────────────────────────────────────────

describe("applyFn", () => {
  it("DAMA no fn: plain column", () => {
    expect(applyFn({ name: "county" }, false)).toBe("county");
  });

  it("DMS no fn: column with AS alias", () => {
    expect(applyFn({ name: "county" }, true)).toBe("data->>'county' as county");
  });

  it("fn=sum DAMA: sum(col) as col_sum", () => {
    expect(applyFn({ name: "damage", fn: "sum" }, false)).toBe("sum(damage) as damage_sum");
  });

  it("fn=sum DMS: sum with integer cast", () => {
    expect(applyFn({ name: "damage", fn: "sum" }, true)).toBe(
      "sum((data->>'damage')::integer) as damage_sum",
    );
  });

  it("fn=count: count(col) as col_count", () => {
    expect(applyFn({ name: "event_id", fn: "count" }, false)).toBe(
      "count(event_id) as event_id_count",
    );
  });

  it("fn=list: array_agg with distinct", () => {
    expect(applyFn({ name: "county", fn: "list" }, false)).toBe(
      "array_to_string(array_agg(distinct county), ', ') as county_list",
    );
  });

  it("fn=avg DMS: avg with integer cast", () => {
    expect(applyFn({ name: "score", fn: "avg" }, true)).toBe(
      "avg((data->>'score')::integer) as score_avg",
    );
  });

  it("fn=max: max(col) as col_max", () => {
    expect(applyFn({ name: "year", fn: "max" }, false)).toBe("max(year) as year_max");
  });

  it("calculated col with fn=sum", () => {
    const result = applyFn({ name: "val * 2 as doubled", fn: "sum", display: "calculated" }, false);
    expect(result).toBe("sum(val * 2) as doubled_sum");
  });
});

// ─── reqName ─────────────────────────────────────────────────────────────────

describe("reqName", () => {
  it("returns null for null input", () => {
    expect(reqName(null, false)).toBeNull();
  });

  it("delegates to applyFn", () => {
    expect(reqName({ name: "county" }, true)).toBe("data->>'county' as county");
  });
});

// ─── totalName ───────────────────────────────────────────────────────────────

describe("totalName", () => {
  it("builds SUM CASE WHEN expression", () => {
    const result = totalName({ name: "damage" }, false);
    expect(result).toContain("SUM(CASE WHEN");
    expect(result).toContain("damage");
    expect(result).toContain("as damage_total");
  });

  it("DMS mode uses data->> accessor", () => {
    const result = totalName({ name: "damage" }, true);
    expect(result).toContain("data->>'damage'");
    expect(result).toContain("as damage_total");
  });
});

// ─── mapFilterGroupCols ──────────────────────────────────────────────────────

describe("mapFilterGroupCols", () => {
  const lookup = (name) => {
    const cols = {
      county: { name: "county", type: "text" },
      hazards: { name: "hazards", type: "multiselect" },
      level: { name: "level", type: "multiselect" },
    };
    return cols[name];
  };

  it("returns null/empty input unchanged", () => {
    expect(mapFilterGroupCols(null, lookup, false)).toBeNull();
    expect(mapFilterGroupCols({}, lookup, false)).toEqual({});
  });

  it("maps leaf col name to ref in DAMA mode", () => {
    const node = { col: "county", op: "filter", value: ["Albany"] };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.col).toBe("county");
    expect(result.value).toEqual(["Albany"]);
  });

  it("maps leaf col name to data->> in DMS mode", () => {
    const node = { col: "county", op: "filter", value: ["Albany"] };
    const result = mapFilterGroupCols(node, lookup, true);
    expect(result.col).toBe("data->>'county'");
  });

  it("wraps like values with %", () => {
    const node = { col: "county", op: "like", value: "Alb" };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.value).toBe("%Alb%");
  });

  it("converts multiselect filter to array_contains", () => {
    const node = { col: "hazards", op: "filter", value: ["Flood", "Hurricane"] };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.op).toBe("array_contains");
    expect(result.value).toEqual(["Flood", "Hurricane"]);
  });

  it("converts multiselect exclude to array_not_contains", () => {
    const node = { col: "hazards", op: "exclude", value: ["Flood"] };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.op).toBe("array_not_contains");
    expect(result.value).toEqual(["Flood"]);
  });

  it("unwraps {value, label} objects in multiselect values", () => {
    const node = {
      col: "hazards",
      op: "filter",
      value: [{ value: "Flood", label: "Flood" }, "Hurricane"],
    };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.op).toBe("array_contains");
    expect(result.value).toEqual(["Flood", "Hurricane"]);
  });

  it("keeps filter op for multiselect with null sentinel", () => {
    const node = { col: "hazards", op: "filter", value: ["Flood", "null"] };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.op).toBe("filter");
  });

  it("keeps filter op for multiselect with not null sentinel", () => {
    const node = { col: "hazards", op: "filter", value: ["not null"] };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.op).toBe("filter");
  });

  it("recurses into nested groups", () => {
    const tree = {
      op: "AND",
      groups: [
        { col: "county", op: "filter", value: ["Albany"] },
        {
          op: "OR",
          groups: [
            { col: "hazards", op: "filter", value: ["Flood"] },
            { col: "level", op: "exclude", value: ["Federal"] },
          ],
        },
      ],
    };
    const result = mapFilterGroupCols(tree, lookup, false);
    expect(result.groups[0].col).toBe("county");
    expect(result.groups[1].groups[0].op).toBe("array_contains");
    expect(result.groups[1].groups[1].op).toBe("array_not_contains");
  });

  it("leaves unknown columns unchanged", () => {
    const node = { col: "unknown_col", op: "filter", value: ["x"] };
    const result = mapFilterGroupCols(node, lookup, false);
    expect(result.col).toBe("unknown_col");
  });
});

// ─── extractHavingFromFilterGroups ───────────────────────────────────────────

describe("extractHavingFromFilterGroups", () => {
  it("returns empty having for plain condition", () => {
    const node = { col: "county", op: "filter", value: ["Albany"] };
    const { filterGroups, having } = extractHavingFromFilterGroups(node);
    expect(having).toEqual([]);
    expect(filterGroups).toEqual(node);
  });

  it("extracts havingExpr from leaf", () => {
    const node = { col: "x", op: "gt", value: 10, havingExpr: "sum(x) > 10" };
    const { filterGroups, having } = extractHavingFromFilterGroups(node);
    expect(having).toEqual(["sum(x) > 10"]);
    expect(filterGroups).toBeNull();
  });

  it("extracts having from nested groups", () => {
    const tree = {
      op: "AND",
      groups: [
        { col: "county", op: "filter", value: ["Albany"] },
        { col: "damage", op: "gt", value: 100, havingExpr: "sum(damage) > 100" },
      ],
    };
    const { filterGroups, having } = extractHavingFromFilterGroups(tree);
    expect(having).toEqual(["sum(damage) > 100"]);
    expect(filterGroups.groups).toHaveLength(1);
    expect(filterGroups.groups[0].col).toBe("county");
  });
});

// ─── extractNormalFiltersFromGroups ──────────────────────────────────────────

describe("extractNormalFiltersFromGroups", () => {
  it("returns empty for plain condition", () => {
    const node = { col: "county", op: "filter", value: ["Albany"] };
    const { cleaned, normalFilters } = extractNormalFiltersFromGroups(node);
    expect(normalFilters).toEqual([]);
    expect(cleaned).toEqual(node);
  });

  it("extracts isNormalFilter leaf", () => {
    const node = { col: "county", op: "filter", value: ["Albany"], isNormalFilter: true };
    const { cleaned, normalFilters } = extractNormalFiltersFromGroups(node);
    expect(normalFilters).toHaveLength(1);
    expect(normalFilters[0].column).toBe("county");
    expect(normalFilters[0].values).toEqual(["Albany"]);
    expect(cleaned).toBeNull();
  });

  it("scalar value gets wrapped in array", () => {
    const node = { col: "x", op: "gt", value: 5, isNormalFilter: true };
    const { normalFilters } = extractNormalFiltersFromGroups(node);
    expect(normalFilters[0].values).toEqual([5]);
  });
});

// ─── applyPageFilters ────────────────────────────────────────────────────────

describe("applyPageFilters", () => {
  it("returns tree unchanged when no pageFilters", () => {
    const tree = { col: "county", op: "filter", value: [] };
    expect(applyPageFilters(tree, null)).toEqual(tree);
    expect(applyPageFilters(tree, {})).toEqual(tree);
  });

  it("applies page filter to usePageFilters leaf", () => {
    const tree = { col: "county", op: "filter", value: [], usePageFilters: true };
    const result = applyPageFilters(tree, { county: ["Albany", "Greene"] });
    expect(result.value).toEqual(["Albany", "Greene"]);
  });

  it("uses searchParamKey over col name", () => {
    const tree = {
      col: "county_fips",
      op: "filter",
      value: [],
      usePageFilters: true,
      searchParamKey: "geoid",
    };
    const result = applyPageFilters(tree, { geoid: "36001" });
    expect(result.value).toEqual(["36001"]);
  });

  it("leaves non-usePageFilters nodes alone", () => {
    const tree = { col: "county", op: "filter", value: ["Albany"] };
    const result = applyPageFilters(tree, { county: ["Greene"] });
    expect(result.value).toEqual(["Albany"]);
  });

  it("recurses into groups", () => {
    const tree = {
      op: "AND",
      groups: [
        { col: "county", op: "filter", value: [], usePageFilters: true },
        { col: "type", op: "filter", value: ["Flood"] },
      ],
    };
    const result = applyPageFilters(tree, { county: ["Albany"] });
    expect(result.groups[0].value).toEqual(["Albany"]);
    expect(result.groups[1].value).toEqual(["Flood"]);
  });
});

// ─── buildColumnsWithSettings ────────────────────────────────────────────────

describe("buildColumnsWithSettings", () => {
  it("enriches columns with refName/reqName/totalName", () => {
    const columns = [col("county"), col("damage")];
    const sourceColumns = [srcCol("county"), srcCol("damage", "numeric", "number")];
    const result = buildColumnsWithSettings(columns, sourceColumns, false);

    expect(result).toHaveLength(2);
    expect(result[0].refName).toBe("county");
    expect(result[0].reqName).toBe("county");
    expect(result[0].totalName).toContain("county_total");
    expect(result[1].refName).toBe("damage");
  });

  it("DMS mode: refName uses data->>", () => {
    const columns = [col("county")];
    const sourceColumns = [srcCol("county")];
    const result = buildColumnsWithSettings(columns, sourceColumns, true);

    expect(result[0].refName).toBe("data->>'county'");
    expect(result[0].reqName).toBe("data->>'county' as county");
  });

  it("filters out actionType and formula columns", () => {
    const columns = [
      col("county"),
      col("action", { actionType: "delete" }),
      col("calc", { type: "formula" }),
    ];
    const sourceColumns = [srcCol("county")];
    const result = buildColumnsWithSettings(columns, sourceColumns, false);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("county");
  });

  it("merges source column metadata into user column", () => {
    const columns = [col("county", { customName: "County Name" })];
    const sourceColumns = [srcCol("county", "character varying", "text")];
    const result = buildColumnsWithSettings(columns, sourceColumns, false);

    expect(result[0].type).toBe("character varying");
    expect(result[0].display).toBe("text");
    expect(result[0].customName).toBe("County Name");
  });

  it("handles aggregated columns", () => {
    const columns = [col("damage", { fn: "sum" })];
    const sourceColumns = [srcCol("damage", "numeric", "number")];
    const result = buildColumnsWithSettings(columns, sourceColumns, false);

    expect(result[0].reqName).toBe("sum(damage) as damage_sum");
  });
});

// ─── getColumnsToFetch ───────────────────────────────────────────────────────

describe("getColumnsToFetch", () => {
  it("returns shown, non-formula, non-static columns", () => {
    const columns = [
      { name: "a", show: true, reqName: "a" },
      { name: "b", show: false, reqName: "b" },
      { name: "c", show: true, type: "formula", reqName: "c" },
      { name: "d", show: true, origin: "static", reqName: "d" },
      { name: "e", show: true, reqName: "e" },
    ];
    const result = getColumnsToFetch(columns, columns);
    expect(result.map((c) => c.name)).toEqual(["a", "e"]);
  });

  it("includes formula variable columns not already fetched", () => {
    const columns = [
      { name: "a", show: true, reqName: "a" },
      { name: "b", show: false, reqName: "b" },
      { name: "calc", show: true, type: "formula", variables: [{ name: "b" }] },
    ];
    const enriched = [
      { name: "a", show: true, reqName: "a" },
      { name: "b", show: false, reqName: "b" },
      { name: "calc", show: true, type: "formula", variables: [{ name: "b" }] },
    ];
    const result = getColumnsToFetch(enriched, columns);
    expect(result.map((c) => c.name)).toContain("b");
  });
});

// ─── buildUdaConfig (full builder) ───────────────────────────────────────────

describe("buildUdaConfig", () => {
  const basicDamaInput = () => ({
    externalSource: {
      source_id: 100,
      view_id: 200,
      isDms: false,
      columns: [
        srcCol("event_id", "integer", "number"),
        srcCol("county", "character varying", "text"),
        srcCol("damage", "numeric", "number"),
        srcCol("event_type", "character varying", "text"),
      ],
    },
    columns: [
      col("event_id"),
      col("county"),
      col("damage"),
      col("event_type"),
    ],
    filters: null,
    pageFilters: null,
  });

  const basicDmsInput = () => ({
    externalSource: {
      source_id: 100,
      view_id: 200,
      isDms: true,
      columns: [
        srcCol("name", "text", "text"),
        srcCol("hazards", "text", "text"),
        srcCol("county", "text", "text"),
      ],
    },
    columns: [
      col("name"),
      col("hazards", { type: "multiselect" }),
      col("county"),
    ],
    filters: null,
    pageFilters: null,
  });

  it("basic DAMA: returns attributes for all shown columns", () => {
    const { attributes } = buildUdaConfig(basicDamaInput());
    expect(attributes).toHaveLength(4);
    expect(attributes).toContain("event_id");
    expect(attributes).toContain("county");
  });

  it("basic DMS: attributes use data->> AS alias format", () => {
    const { attributes } = buildUdaConfig(basicDmsInput());
    expect(attributes).toContain("data->>'name' as name");
    expect(attributes).toContain("data->>'county' as county");
  });

  it("groupBy: derives from columns with group=true", () => {
    const input = basicDamaInput();
    input.columns[1].group = true; // county
    const { options } = buildUdaConfig(input);
    expect(options.groupBy).toContain("county");
  });

  it("orderBy: derives from columns with sort", () => {
    const input = basicDamaInput();
    input.columns[1].sort = "asc nulls last"; // county
    const { options } = buildUdaConfig(input);
    expect(Object.values(options.orderBy)).toContain("asc nulls last");
  });

  it("fn: derives from columns with aggregate fn", () => {
    const input = basicDamaInput();
    input.columns[1].group = true; // county — group by
    input.columns[2].fn = "sum"; // damage — sum
    const { options, attributes } = buildUdaConfig(input);
    expect(options.fn).toBeUndefined(); // fn is not in options — it's in columns
    // The aggregated column appears in attributes with _sum suffix
    expect(attributes.some((a) => a.includes("damage_sum"))).toBe(true);
  });

  it("meta: derives from columns with meta_lookup", () => {
    const input = basicDamaInput();
    input.columns[1].display = "meta-variable";
    input.columns[1].meta_lookup = "county_name";
    const { options } = buildUdaConfig(input);
    expect(options.meta).toEqual({ county: "county_name" });
  });

  it("filterGroups: maps column names and passes through", () => {
    const input = basicDamaInput();
    input.filters = {
      op: "AND",
      groups: [{ col: "county", op: "filter", value: ["Albany"] }],
    };
    const { options } = buildUdaConfig(input);
    expect(options.filterGroups.groups[0].col).toBe("county");
    expect(options.filterGroups.groups[0].value).toEqual(["Albany"]);
  });

  it("filterGroups DMS: maps col to data->> accessor", () => {
    const input = basicDmsInput();
    input.filters = {
      op: "AND",
      groups: [{ col: "county", op: "filter", value: ["Albany"] }],
    };
    const { options } = buildUdaConfig(input);
    expect(options.filterGroups.groups[0].col).toBe("data->>'county'");
  });

  it("multiselect filter: converts to array_contains", () => {
    const input = basicDmsInput();
    input.filters = {
      op: "AND",
      groups: [{ col: "hazards", op: "filter", value: ["Flood", "Hurricane"] }],
    };
    const { options } = buildUdaConfig(input);
    expect(options.filterGroups.groups[0].op).toBe("array_contains");
    expect(options.filterGroups.groups[0].value).toEqual(["Flood", "Hurricane"]);
  });

  it("multiselect exclude: converts to array_not_contains", () => {
    const input = basicDmsInput();
    input.filters = {
      op: "AND",
      groups: [{ col: "hazards", op: "exclude", value: ["Flood"] }],
    };
    const { options } = buildUdaConfig(input);
    expect(options.filterGroups.groups[0].op).toBe("array_not_contains");
  });

  it("pageFilters: applies values to usePageFilters conditions", () => {
    const input = basicDamaInput();
    input.filters = {
      op: "AND",
      groups: [{ col: "county", op: "filter", value: [], usePageFilters: true }],
    };
    input.pageFilters = { county: ["Greene"] };
    const { options } = buildUdaConfig(input);
    expect(options.filterGroups.groups[0].value).toEqual(["Greene"]);
  });

  it("filterGroups with join: applies table alias to filter columns", () => {
    const input = basicDamaInput();
    input.externalSource.source_id = 1;
    input.externalSource.isDms = false;
    input.externalSource.columns = [
      srcCol("id", "integer", "number", { source_id: 1 }),
      srcCol("county_name", "text", "text", { source_id: 1 }),
    ];
    input.columns = [
      col("id", { source_id: 1 }),
      col("county_name", { source_id: 1 }),
      col("related_id", { source_id: 2 }),
      col("city_name", { source_id: 2 }),
    ];
    input.join = {
      sources: {
        ds: { },
        table2: {
          source: 2,
          view: 202,
          sourceInfo: {
            env: "dama_other",
            columns: [
              srcCol("related_id", "integer", "number"),
              srcCol("city_name", "text", "text"),
            ],
          },
        },
      },
      type: "left",
      operator: "=",
      on: "ds.id = table2.related_id",
    };
    input.filters = {
      op: "AND",
      groups: [
        { col: "county_name", source_id: 1, op: "filter", value: ["Albany"] },
        { col: "city_name", source_id: 2, op: "filter", value: ["Troy"] },
      ],
    };

    const { options } = buildUdaConfig(input);
    expect(options.filterGroups.groups[0].col).toBe("county_name");
    expect(options.filterGroups.groups[1].col).toBe("city_name");
  });

  it("hidden columns are excluded from attributes", () => {
    const input = basicDamaInput();
    input.columns[2].show = false; // damage
    const { attributes } = buildUdaConfig(input);
    expect(attributes).not.toContain("damage");
    expect(attributes).toHaveLength(3);
  });

  it("excludeNA: adds null exclusion", () => {
    const input = basicDamaInput();
    input.columns[2].excludeNA = true; // damage
    input.columns[2].filters = [];
    const { options } = buildUdaConfig(input);
    expect(options.exclude).toHaveProperty("damage");
    expect(options.exclude.damage).toContain("null");
  });

  it("serverFn: derives from columns with serverFn config", () => {
    const input = basicDamaInput();
    input.columns[1].serverFn = "lookup";
    input.columns[1].joinKey = "county_fips";
    input.columns[1].valueKey = "county_name";
    const { options } = buildUdaConfig(input);
    expect(options.serverFn.county.serverFn).toBe("lookup");
    expect(options.serverFn.county.joinKey).toBe("county_fips");
  });

  it("empty input: handles gracefully", () => {
    const input = {
      externalSource: { isDms: false, columns: [] },
      columns: [],
      filters: null,
    };
    const { options, attributes } = buildUdaConfig(input);
    expect(attributes).toEqual([]);
    expect(options.groupBy).toEqual([]);
    expect(options.filterGroups).toEqual({});
  });
});

// ─── legacyStateToBuildInput ─────────────────────────────────────────────────

describe("legacyStateToBuildInput", () => {
  it("maps sourceInfo to externalSource", () => {
    const state = {
      sourceInfo: { source_id: 100, view_id: 200, isDms: false, columns: [] },
      columns: [],
      dataRequest: {},
      display: {},
    };
    const result = legacyStateToBuildInput(state);
    expect(result.externalSource).toBe(state.sourceInfo);
  });

  it("maps dataRequest.filterGroups to filters", () => {
    const fg = { op: "AND", groups: [{ col: "x", op: "filter", value: ["a"] }] };
    const state = {
      sourceInfo: {},
      columns: [],
      dataRequest: { filterGroups: fg },
      display: {},
    };
    const result = legacyStateToBuildInput(state);
    expect(result.filters).toEqual(fg);
  });

  it("injects filterRelation as op when filterGroups has no op", () => {
    const state = {
      sourceInfo: {},
      columns: [],
      dataRequest: { filterGroups: { groups: [{ col: "x", op: "filter", value: ["a"] }] } },
      display: { filterRelation: "OR" },
    };
    const result = legacyStateToBuildInput(state);
    expect(result.filters.op).toBe("OR");
  });

  it("preserves existing filterGroups op over filterRelation", () => {
    const state = {
      sourceInfo: {},
      columns: [],
      dataRequest: { filterGroups: { op: "AND", groups: [] } },
      display: { filterRelation: "OR" },
    };
    const result = legacyStateToBuildInput(state);
    expect(result.filters.op).toBe("AND");
  });

  it("passes through pageFilters", () => {
    const state = { sourceInfo: {}, columns: [], dataRequest: {}, display: {} };
    const pf = { county: ["Albany"] };
    const result = legacyStateToBuildInput(state, pf);
    expect(result.pageFilters).toEqual(pf);
  });
});

// ─── computeOutputSourceInfo ────────────────────────────────────────────────

describe("computeOutputSourceInfo", () => {
  const makeArgs = (overrides = {}) => ({
    columnsToFetch: [],
    columnsWithSettings: [],
    externalSource: { isDms: false, columns: [] },
    options: {},
    attributes: [],
    columns: [],
    ...overrides,
  });

  it("passthrough columns preserve type", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "county", type: "text", display: "text", show: true },
        { name: "pop", type: "integer", display: "number", show: true },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns).toHaveLength(2);
    expect(result.columns[0]).toMatchObject({ name: "county", type: "text", source: "passthrough" });
    expect(result.columns[1]).toMatchObject({ name: "pop", type: "integer", source: "passthrough" });
  });

  it("aggregated columns become number type", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "value", type: "numeric", display: "number", fn: "sum", show: true },
        { name: "county", type: "text", display: "text", fn: "count", show: true },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns[0]).toMatchObject({ name: "value", type: "number", source: "aggregation", fn: "sum" });
    expect(result.columns[1]).toMatchObject({ name: "county", type: "number", source: "aggregation", fn: "count" });
  });

  it("meta_lookup columns become text type", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "county_fips", type: "integer", display: "text", meta_lookup: "county_name", show: true },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns[0]).toMatchObject({ name: "county_fips", type: "text", source: "meta_lookup", meta_lookup: "county_name" });
  });

  it("formula columns included from columns array", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "value", type: "numeric", display: "number", show: true },
      ],
      columns: [
        { name: "value", type: "numeric", show: true },
        { name: "doubled", type: "formula", show: true, formula: "value * 2" },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns).toHaveLength(2);
    expect(result.columns[1]).toMatchObject({ name: "doubled", source: "formula", type: "number" });
  });

  it("hidden formula columns excluded", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "value", type: "numeric", display: "number", show: true },
      ],
      columns: [
        { name: "hidden_formula", type: "formula", show: false, formula: "value + 1" },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns).toHaveLength(1);
  });

  it("calculated columns have source: calculated", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "derived", type: "text", display: "text", origin: "calculated-column", show: true },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns[0]).toMatchObject({ source: "calculated" });
  });

  it("serverFn columns have source: serverFn", () => {
    const args = makeArgs({
      columnsToFetch: [
        { name: "joined", type: "text", display: "text", serverFn: { joinKey: "k" }, show: true },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns[0]).toMatchObject({ source: "serverFn" });
  });

  it("isGrouped true when columns have group", () => {
    const args = makeArgs({
      columnsWithSettings: [
        { name: "county", group: true },
        { name: "value", group: false },
      ],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.isGrouped).toBe(true);
  });

  it("isGrouped false when no columns grouped", () => {
    const args = makeArgs({
      columnsWithSettings: [{ name: "county" }, { name: "value" }],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.isGrouped).toBe(false);
  });

  it("asUdaConfig is null for pure passthrough", () => {
    const args = makeArgs({
      columnsToFetch: [{ name: "county", type: "text", show: true }],
      columnsWithSettings: [{ name: "county" }],
      options: {},
    });
    const result = computeOutputSourceInfo(args);
    expect(result.asUdaConfig).toBeNull();
  });

  it("asUdaConfig populated when transforms exist (grouping)", () => {
    const src = { isDms: false, columns: [{ name: "county", type: "text" }] };
    const opts = { groupBy: ["county"], filter: {} };
    const attrs = ["county"];
    const args = makeArgs({
      columnsToFetch: [{ name: "county", type: "text", show: true }],
      columnsWithSettings: [{ name: "county", group: true }],
      externalSource: src,
      options: opts,
      attributes: attrs,
    });
    const result = computeOutputSourceInfo(args);
    expect(result.asUdaConfig).toEqual({ options: opts, attributes: attrs, sourceInfo: src });
  });

  it("asUdaConfig populated when transforms exist (filters)", () => {
    const opts = { filter: {}, filterGroups: { op: "AND", groups: [{ col: "x", op: "filter", value: [1] }] } };
    const args = makeArgs({
      columnsToFetch: [{ name: "x", type: "text", show: true }],
      options: opts,
    });
    const result = computeOutputSourceInfo(args);
    expect(result.asUdaConfig).not.toBeNull();
  });

  it("asUdaConfig populated when transforms exist (fn)", () => {
    const args = makeArgs({
      columnsToFetch: [{ name: "value", type: "numeric", fn: "sum", show: true }],
      columnsWithSettings: [{ name: "value", fn: "sum" }],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.asUdaConfig).not.toBeNull();
  });

  it("uses normalName when present", () => {
    const args = makeArgs({
      columnsToFetch: [{ name: "county", normalName: "county_original", type: "text", show: true }],
    });
    const result = computeOutputSourceInfo(args);
    expect(result.columns[0].name).toBe("county_original");
    expect(result.columns[0].originalName).toBe("county");
  });
});

// ─── buildUdaConfig returns outputSourceInfo ────────────────────────────────

describe("buildUdaConfig outputSourceInfo integration", () => {
  it("includes outputSourceInfo in return value", () => {
    const result = buildUdaConfig({
      externalSource: { isDms: false, columns: [srcCol("county"), srcCol("value", "numeric", "number")] },
      columns: [col("county", { group: true }), col("value", { fn: "sum" })],
      filters: {},
    });
    expect(result.outputSourceInfo).toBeDefined();
    expect(result.outputSourceInfo.columns).toHaveLength(2);
    expect(result.outputSourceInfo.isGrouped).toBe(true);
    expect(result.outputSourceInfo.asUdaConfig).not.toBeNull();
  });

  it("passthrough config has null asUdaConfig", () => {
    const result = buildUdaConfig({
      externalSource: { isDms: false, columns: [srcCol("county")] },
      columns: [col("county")],
      filters: {},
    });
    expect(result.outputSourceInfo.asUdaConfig).toBeNull();
  });
});

// ─── buildJoinSources ────────────────────────────────────────────────────────

describe("buildJoinSources", () => {
  const externalSource = {
    source_id: 1,
    view_id: 101,
    env: "dama",
    columns: [],
  };

  it("builds sources object from join config", () => {
    const join = {
      sources: {
        ds: { },
        table2: {
          source: 2,
          view: 202,
          sourceInfo: { env: "dama_other" },
        },
      },
    };
    const result = buildJoinSources({ join, externalSource });
    expect(result).toEqual({
      table2: { view_id: 202, env: "dama_other" },
    });
  });
});

// ─── buildJoinOnClause ───────────────────────────────────────────────────────

describe("buildJoinOnClause", () => {
  const externalSource = {
    source_id: 1,
    view_id: 101,
    env: "dama",
    columns: [],
  };

  it("builds a basic ON clause with default left join and = operator", () => {
    const join = {
      sources: {
        ds: {  },
        table2: {
            source: 2,
            type: "left",
            joinColumns: [{ dsColumn: "id", joinSourceColumn: "foreign_id" }]
        },
      },
    };
    const result = buildJoinOnClause({ join, externalSource });
    expect(result).toEqual([{
      type: "left",
      mergeStrategy: "join",
      table: "table2",
      on: "ds.id = table2.foreign_id",
    }]);
  });
});

// ─── buildJoin ───────────────────────────────────────────────────────────────

describe("buildJoin", () => {
  const externalSource = {
    source_id: 1,
    view_id: 101,
    env: "dama",
    columns: [],
  };

  it("builds a complete join object", () => {
    const join = {
      sources: {
        ds: { },
        table2: {
          source: 2,
          view: 202,
          sourceInfo: { env: "dama_other" },
          type: "left",
          joinColumns: [{ dsColumn: "id", joinSourceColumn: "foreign_id" }],
        },
      },
    };
    const result = buildJoin({ join, externalSource });
    expect(result).toEqual({
      sources: {
        table2: { view_id: 202, env: "dama_other" },
      },
      on: [
        {
          type: "left",
          mergeStrategy: "join",
          table: "table2",
          on: "ds.id = table2.foreign_id",
        },
      ],
    });
  });
});

// ─── applyTableAliasToJoin ───────────────────────────────────────────────────

describe("applyTableAliasToJoin", () => {
  const sourceIdToAlias = {
    1: "ds",
    2: "table2",
  };

  it("applies 'ds' alias to columns from externalSource", () => {
    const filterTree = {
      col: "columnA",
      source_id: 1,
      op: "filter",
      value: ["val1"],
    };
    const result = applyTableAliasToJoin(filterTree, sourceIdToAlias);
    expect(result.col).toBe("ds.columnA");
  });

  it("applies 'table2' alias to columns from table2 source", () => {
    const filterTree = {
      col: "columnB",
      source_id: 2,
      op: "filter",
      value: ["val2"],
    };
    const result = applyTableAliasToJoin(filterTree, sourceIdToAlias);
    expect(result.col).toBe("table2.columnB");
  });

  it("handles nested filter groups", () => {
    const filterTree = {
      op: "AND",
      groups: [
        { col: "columnA", source_id: 1, op: "filter", value: ["val1"] },
        {
          op: "OR",
          groups: [
            { col: "columnB", source_id: 2, op: "filter", value: ["val2"] },
            { col: "columnC", source_id: 1, op: "gt", value: 10 },
          ],
        },
      ],
    };
    const result = applyTableAliasToJoin(filterTree, sourceIdToAlias);
    expect(result.groups[0].col).toBe("ds.columnA");
    expect(result.groups[1].groups[0].col).toBe("table2.columnB");
    expect(result.groups[1].groups[1].col).toBe("ds.columnC");
  });

  it("applies alias to searchParamKey if present", () => {
    const filterTree = {
      col: "columnA",
      source_id: 1,
      op: "filter",
      value: ["val1"],
      searchParamKey: "searchA",
    };
    const result = applyTableAliasToJoin(filterTree, sourceIdToAlias);
    expect(result.searchParamKey).toBe("ds.searchA");
    expect(result.col).toBe("ds.columnA"); // col should also be aliased
  });

  it("returns null filterTree unchanged", () => {
    const result = applyTableAliasToJoin(null, sourceIdToAlias);
    expect(result).toBeNull();
  });
});

describe("union support", () => {
    it("recognizes union merge strategy", () => {
        const join = {
            sources: {
                ds: {  },
                table2: {
                    source: 2,
                    mergeStrategy: 'union',
                    view: 202
                }
            }
        };
        const externalSource = { source_id: 1 };
        const result = buildJoin({ join, externalSource });
        expect(result.on).toEqual([
            {
                type: "left",
                mergeStrategy: "union",
                table: "table2",
                on: ""
            }
        ]);
    });
});
