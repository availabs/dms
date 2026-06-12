import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { get } from "lodash-es";
import { MapEditorContext } from "../../../../context";
import DraggableList from "../../../../../../ui/components/DraggableList";
import Pill from "../../../../../../ui/components/Pill";
import Icons from "../../../../../../ui/icons";
import {
  JOIN_AGG_OPS,
  getJoinOutputKey,
  getJoinOutputLabel,
  getJoinOutputNameFromExpr,
} from "./constants";

const EMPTY_ARRAY = [];
const FieldShell = ({ children, className = "" }) => (
  <div className={`rounded-md border border-slate-200 bg-white px-2.5 py-1.5 ${className}`}>
    {children}
  </div>
);
const toOptionLabel = (...values) => {
  for (const value of values) {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (value && typeof value === "object" && "value" in value) {
      const nestedValue = value.value;
      if (typeof nestedValue === "string" || typeof nestedValue === "number") {
        return String(nestedValue);
      }
    }
  }
  return "";
};
const quoteAlias = (value) => `"${String(value).replace(/"/g, "")}"`;

const makeFilterRow = () => ({ column: "", operator: "in", valuesText: "" });
const getJoinFilterMode = (filterMode) => (filterMode === "any" ? "any" : "all");

const toSelectExpr = (columnConfig) => {
  if (!columnConfig?.name) return "";
  const outputKey = getJoinOutputKey(columnConfig);
  if (columnConfig.fn === "count") return `count(1)::int as ${quoteAlias(outputKey)}`;
  if (columnConfig.fn) return `${columnConfig.fn}(${columnConfig.name})::numeric as ${quoteAlias(outputKey)}`;
  if (outputKey && outputKey !== columnConfig.name) return `${columnConfig.name} as ${quoteAlias(outputKey)}`;
  return columnConfig.name;
};

const buildJoinQueryFilters = (filterRows) => {
  const filter = {};

  (filterRows || []).forEach((row) => {
    if (!row?.column) return;
    const values = String(row.valuesText || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (values.length) {
      filter[row.column] = values;
    }
  });

  return Object.keys(filter).length ? { filter } : {};
};

const buildColumnSummary = (columnConfig, index) => {
  if (columnConfig?.name) return getJoinOutputLabel(columnConfig);
  return `Output column ${index + 1}`;
};

const getDefaultExpanded = (columnConfig) => !columnConfig?.name;
const isGroupedColumnConfig = (columnConfig) => !columnConfig?.fn || !!columnConfig.group;
const getAggregateIcon = (fn) => {
  if (fn === "count") return Icons.TallyMark;
  if (fn === "sum") return Icons.Sum;
  if (fn === "avg") return Icons.Avg;
  if (fn === "min" || fn === "max") return Icons.TallyMark;
  return null;
};
const ManagerActionPill = ({ color, text, ...rest }) => (
  <Pill color={color} text={text} {...rest} />
);

function JoinQueryBuilder({ config, setLinkedDataConfig }) {
  const mapEditorContext = useContext(MapEditorContext) || {};
  const { pgEnv, useFalcor } = mapEditorContext;
  const falcorApi = typeof useFalcor === "function" ? useFalcor() : mapEditorContext;
  const falcor = falcorApi?.falcor;
  const falcorCache = falcorApi?.falcorCache || falcor?.getCache?.() || {};

  useEffect(() => {
    if (config.source.sourceId && falcor && pgEnv) {
      falcor.get(["uda", pgEnv, "sources", "byId", config.source.sourceId, "metadata"]);
    }
  }, [config.source.sourceId, falcor, pgEnv]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const joinColumns = useMemo(() => {
    let columns = get(falcorCache, [
      "uda", pgEnv, "sources", "byId", config.source.sourceId, "metadata", "value", "columns",
    ], []);
    if (!columns.length) {
      columns = get(falcorCache, [
        "uda", pgEnv, "sources", "byId", config.source.sourceId, "metadata", "value",
      ], []);
    }
    return Array.isArray(columns) ? columns.filter((col) => col?.name !== "wkb_geometry") : EMPTY_ARRAY;
  }, [config.source.sourceId, falcorCache, pgEnv]);

  const outputColumns = useMemo(() => {
    return (config.query.columns || []).map(getJoinOutputNameFromExpr).filter(Boolean);
  }, [config.query.columns]);
  const [expandedColumns, setExpandedColumns] = useState({});
  const [expandedFilters, setExpandedFilters] = useState({});
  const [columnSearch, setColumnSearch] = useState("");
  const [pendingColumnNames, setPendingColumnNames] = useState([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef(null);

  const columnConfigs = config.query.columnConfigs || EMPTY_ARRAY;
  const filterRows = config.query.filterRows || EMPTY_ARRAY;
  const filterMode = getJoinFilterMode(config.query.filterMode);

  const syncJoinQuery = (
    nextColumnConfigs,
    nextFilterRows = filterRows,
    nextTileColumns = config.tileColumns,
    nextFilterMode = filterMode
  ) => {
    const cleanColumnConfigs = nextColumnConfigs.filter((columnConfig) => columnConfig?.name);
    const groupBy = cleanColumnConfigs
      .filter((columnConfig) => isGroupedColumnConfig(columnConfig))
      .map((columnConfig) => columnConfig.name);
    const columns = cleanColumnConfigs.map(toSelectExpr).filter(Boolean);
    const availableOutputColumns = columns.map(getJoinOutputNameFromExpr);

    setLinkedDataConfig((nextConfig) => {
      nextConfig.query.columnConfigs = nextColumnConfigs;
      nextConfig.query.filterRows = nextFilterRows;
      nextConfig.query.filterMode = getJoinFilterMode(nextFilterMode);
      nextConfig.query.groupBy = groupBy;
      nextConfig.query.columns = columns;
      nextConfig.query.filters = buildJoinQueryFilters(nextFilterRows);
      nextConfig.tileColumns = nextTileColumns.filter((column) => availableOutputColumns.includes(column));
      if (nextConfig.joinColumn && !availableOutputColumns.includes(nextConfig.joinColumn)) {
        nextConfig.joinColumn = "";
      }
    });
  };

  const updateColumnConfig = (index, key, value) => {
    const nextColumnConfigs = columnConfigs.map((columnConfig, columnIndex) =>
      columnIndex === index ? { ...columnConfig, [key]: value } : columnConfig
    );
    syncJoinQuery(nextColumnConfigs);
  };

  const removeColumnConfig = (index) => {
    const nextColumnConfigs = columnConfigs.filter((_, columnIndex) => columnIndex !== index);
    syncJoinQuery(nextColumnConfigs);
    setExpandedColumns((prev) =>
      Object.keys(prev).reduce((acc, key) => {
        const numericKey = Number(key);
        if (numericKey < index) acc[numericKey] = prev[key];
        if (numericKey > index) acc[numericKey - 1] = prev[key];
        return acc;
      }, {})
    );
  };

  const addSelectedColumn = () => {
    if (!pendingColumnNames.length) return;
    const nextColumnConfigs = [
      ...columnConfigs,
      ...pendingColumnNames
        .filter(Boolean)
        .map((name) => ({ name, alias: "", fn: "", group: false })),
    ];
    syncJoinQuery(nextColumnConfigs);
    setExpandedColumns((prev) =>
      pendingColumnNames.reduce((acc, _, offset) => ({
        ...acc,
        [columnConfigs.length + offset]: true,
      }), prev)
    );
    setPendingColumnNames([]);
    setColumnSearch("");
    setIsPickerOpen(false);
  };

  const expandAllColumns = () => {
    setExpandedColumns(
      columnConfigs.reduce((acc, _, index) => ({
        ...acc,
        [index]: true,
      }), {})
    );
  };

  const collapseAllColumns = () => {
    setExpandedColumns(
      columnConfigs.reduce((acc, _, index) => ({
        ...acc,
        [index]: false,
      }), {})
    );
  };

  const removeAllColumns = () => {
    syncJoinQuery([]);
    setExpandedColumns({});
  };

  const reorderColumnConfigs = (updatedItems) => {
    const nextColumnConfigs = updatedItems.map(({ columnConfig }) => columnConfig);
    syncJoinQuery(nextColumnConfigs);
    setExpandedColumns((prev) =>
      nextColumnConfigs.reduce((acc, _, index) => {
        acc[index] = prev[index] ?? getDefaultExpanded(nextColumnConfigs[index]);
        return acc;
      }, {})
    );
  };

  const addAllColumns = () => {
    const nextColumnConfigs = [
      ...columnConfigs.filter((columnConfig) => columnConfig.name),
      ...joinColumns
        .filter((column) => column?.name)
        .map((column) => ({ name: column.name, alias: "", fn: "", group: false })),
    ];
    syncJoinQuery(nextColumnConfigs);
    setExpandedColumns({});
    setPendingColumnNames([]);
    setColumnSearch("");
    setIsPickerOpen(false);
  };

  const toggleColumnExpanded = (index) => {
    setExpandedColumns((prev) => ({
      ...prev,
      [index]: !(prev[index] ?? getDefaultExpanded(columnConfigs[index])),
    }));
  };

  const togglePicker = useCallback(() => {
    setIsPickerOpen((prev) => !prev);
  }, []);

  const updateFilterRow = (index, key, value) => {
    const nextFilterRows = filterRows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [key]: value } : row
    );
    syncJoinQuery(columnConfigs, nextFilterRows);
  };

  const updateFilterMode = (nextMode) => {
    syncJoinQuery(columnConfigs, filterRows, config.tileColumns, nextMode);
  };

  const addFilterRow = () => {
    syncJoinQuery(columnConfigs, [...filterRows, makeFilterRow()]);
  };

  const removeFilterRow = (index) => {
    syncJoinQuery(columnConfigs, filterRows.filter((_, rowIndex) => rowIndex !== index));
    setExpandedFilters((prev) =>
      Object.keys(prev).reduce((acc, key) => {
        const numericKey = Number(key);
        if (numericKey < index) acc[numericKey] = prev[key];
        if (numericKey > index) acc[numericKey - 1] = prev[key];
        return acc;
      }, {})
    );
  };

  const toggleFilterExpanded = (index) => {
    setExpandedFilters((prev) => ({
      ...prev,
      [index]: !(prev[index] ?? true),
    }));
  };

  const availableColumns = useMemo(() => joinColumns.filter((column) => {
    const label = toOptionLabel(column.display_name, column.name).toLowerCase();
    const query = columnSearch.trim().toLowerCase();
    return !query || label.includes(query) || String(column.name || "").toLowerCase().includes(query);
  }), [joinColumns, columnSearch]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="text-sm font-medium text-slate-700">Join Columns</div>

      <div className="space-y-2">
        <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <div ref={pickerRef} className="rounded-md bg-blue-50 p-2">
            <div className="rounded-md border border-slate-300 bg-white shadow-sm">
              <div className="flex items-center">
                <input
                  className="w-full rounded-md bg-transparent px-3 py-2 text-sm outline-none"
                  placeholder="Search columns"
                  value={columnSearch}
                  onFocus={() => setIsPickerOpen(true)}
                  onChange={(e) => {
                    setColumnSearch(e.target.value);
                    if (!isPickerOpen) setIsPickerOpen(true);
                  }}
                />
                <button
                  type="button"
                  className="px-3 text-slate-400"
                  onClick={togglePicker}
                >
                  <Icons.CaretDown className={`size-4 transition-transform ${isPickerOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>

            {isPickerOpen ? (
              <>
                <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-sm">
                  {availableColumns.length ? availableColumns.map((column) => {
                    const label = toOptionLabel(column.display_name, column.name);
                    const isSelected = pendingColumnNames.includes(column.name);
                    return (
                      <button
                        key={column.name}
                        type="button"
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                          isSelected ? "bg-blue-100 text-slate-900" : "text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => {
                          setPendingColumnNames((prev) => [...prev, column.name]);
                        }}
                      >
                        <span>{label}</span>
                      </button>
                    );
                  }) : (
                    <div className="px-3 py-2 text-sm text-slate-400">No matching columns</div>
                  )}
                </div>
              </>
            ) : null}

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {pendingColumnNames.map((columnName, pendingIndex) => (
                <div key={`${columnName}_${pendingIndex}`} className="flex items-center gap-1 rounded-md bg-blue-500/15 px-1.5 py-0.5 text-xs text-blue-700">
                  <span>{columnName}</span>
                  <button
                    type="button"
                    className="inline-flex"
                    onClick={() => setPendingColumnNames((prev) => prev.filter((_, index) => index !== pendingIndex))}
                  >
                    <Icons.XMark className="size-3" />
                  </button>
                </div>
              ))}
              <div className={pendingColumnNames.length ? "" : "opacity-40 pointer-events-none"}>
                <ManagerActionPill color="green" text="Add" onClick={addSelectedColumn} />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            <ManagerActionPill
              color="gray"
              text={columnConfigs.length && columnConfigs.every((columnConfig, index) => expandedColumns[index] ?? getDefaultExpanded(columnConfig)) ? "Collapse All" : "Expand All"}
              onClick={() => {
                const everyExpanded = columnConfigs.length && columnConfigs.every((columnConfig, index) => expandedColumns[index] ?? getDefaultExpanded(columnConfig));
                if (everyExpanded) {
                  collapseAllColumns();
                } else {
                  expandAllColumns();
                }
              }}
            />
            <ManagerActionPill color="blue" text="Show All" onClick={addAllColumns} />
            <ManagerActionPill color="orange" text="Remove All" onClick={removeAllColumns} />
          </div>
        </div>

        {columnConfigs.length ? (
          <DraggableList
            dataItems={columnConfigs.map((columnConfig, index) => ({ id: `${columnConfig.name || "column"}_${index}`, columnConfig, index }))}
            onChange={reorderColumnConfigs}
            renderItem={({ item }) => {
              const { columnConfig, index } = item;
              const isExpanded = expandedColumns[index] ?? getDefaultExpanded(columnConfig);
              const isGrouped = isGroupedColumnConfig(columnConfig);
              const AggregateIcon = getAggregateIcon(columnConfig.fn);
              return (
                <div className="rounded-md border border-slate-400 bg-white overflow-hidden mb-0.5">
                  <div className="flex items-center justify-between px-2 py-1 gap-1">
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Icons.Reorder className="size-4 text-gray-400 shrink-0 cursor-grab" />
                      <span className="text-sm truncate">{buildColumnSummary(columnConfig, index)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {AggregateIcon ? <AggregateIcon className="size-4 text-blue-500" /> : null}
                      <button
                        type="button"
                        className={`p-0.5 rounded hover:bg-gray-100 ${isGrouped ? "text-blue-500" : "text-gray-300"}`}
                        onClick={() => {
                          if (!columnConfig.fn) return;
                          updateColumnConfig(index, "group", !columnConfig.group);
                        }}
                        title={!columnConfig.fn ? "Grouped automatically for raw columns" : (isGrouped ? "Grouping By" : "Group By")}
                      >
                        <Icons.Group className="size-4" />
                      </button>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                        onClick={() => toggleColumnExpanded(index)}
                        title="Settings"
                      >
                        <Icons.CaretDown className={`size-4 transition-transform ${isExpanded ? "" : "-rotate-90"}`} />
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="px-3 py-2 border-t bg-gray-50 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600 min-w-11">Name</label>
                        <FieldShell className="flex-1 px-0 py-0">
                          <input
                            className="w-full rounded-md bg-transparent px-2 py-1 text-sm leading-5"
                            type="text"
                            placeholder={getJoinOutputLabel(columnConfig) || "Output name"}
                            value={columnConfig.alias || ""}
                            onChange={(e) => updateColumnConfig(index, "alias", e.target.value)}
                          />
                        </FieldShell>
                      </div>
                      <div className="flex items-center gap-1">
                        <label className="text-xs text-gray-600 min-w-11">Fn</label>
                        <FieldShell className="flex-1 px-0 py-0">
                          <label className="flex w-full">
                            <select
                              className="w-full rounded-md bg-transparent px-2 py-1 text-sm leading-5"
                              value={columnConfig.fn}
                              onChange={(e) => updateColumnConfig(index, "fn", e.target.value)}
                            >
                              {JOIN_AGG_OPS.map((aggOp) => (
                                <option key={aggOp || "none"} value={aggOp}>
                                  {aggOp || "none"}
                                </option>
                              ))}
                            </select>
                          </label>
                        </FieldShell>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 pt-1">
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <button
                            type="button"
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              isGrouped ? "bg-blue-500" : "bg-slate-200"
                            }`}
                            onClick={() => {
                              if (!columnConfig.fn) return;
                              updateColumnConfig(index, "group", !columnConfig.group);
                            }}
                            title={!columnConfig.fn ? "Grouped automatically for raw columns" : "Group"}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                isGrouped ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                          Group
                        </label>
                        <label className="flex items-center gap-2 text-xs text-gray-600">
                          <button
                            type="button"
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              toSelectExpr(columnConfig) && config.tileColumns.includes(getJoinOutputNameFromExpr(toSelectExpr(columnConfig)))
                                ? "bg-blue-500"
                                : "bg-slate-200"
                            }`}
                            onClick={() => {
                              const outputName = getJoinOutputNameFromExpr(toSelectExpr(columnConfig));
                              if (!outputName) return;
                              setLinkedDataConfig((nextConfig) => {
                                const currentTileColumns = new Set(nextConfig.tileColumns);
                                if (currentTileColumns.has(outputName)) {
                                  currentTileColumns.delete(outputName);
                                } else {
                                  currentTileColumns.add(outputName);
                                }
                                nextConfig.tileColumns = Array.from(currentTileColumns);
                              });
                            }}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                toSelectExpr(columnConfig) && config.tileColumns.includes(getJoinOutputNameFromExpr(toSelectExpr(columnConfig)))
                                  ? "translate-x-4"
                                  : "translate-x-0.5"
                              }`}
                            />
                          </button>
                          Use in tile output
                        </label>
                      </div>
                      <div className="flex gap-1 pt-1">
                        <ManagerActionPill color="orange" text="Remove" onClick={() => removeColumnConfig(index)} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
        ) : null}
      </div>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <div className="text-sm font-medium text-slate-700">Filters</div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-[auto_minmax(0,112px)_1fr] items-start gap-2 text-sm text-slate-500">
            <span className="pt-2 text-xs font-medium uppercase tracking-wide text-slate-500">Match</span>
            <FieldShell className="min-w-0 px-0 py-0">
              <label className="flex w-full">
                <select
                  className="w-full rounded-md bg-transparent px-3 py-2 text-sm font-medium text-slate-900"
                  value={filterMode}
                  onChange={(e) => updateFilterMode(e.target.value)}
                >
                  <option value="all">All</option>
                  <option value="any">Any</option>
                </select>
              </label>
            </FieldShell>
            <span className="pt-2 text-sm leading-5 text-slate-500">of the following</span>
          </div>

          <div className="mt-3 space-y-3">
            {filterRows.map((row, index) => (
              <div key={index} className="rounded-md border border-dashed border-sky-300 bg-white overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-700">Condition {index + 1}</div>
                    <div className="truncate text-xs text-slate-500">
                      {row.column || "No column"} {row.valuesText ? `• ${row.valuesText}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      className="text-xs text-red-500"
                      onClick={() => removeFilterRow(index)}
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-gray-100 text-gray-500"
                      onClick={() => toggleFilterExpanded(index)}
                      title="Settings"
                    >
                      <Icons.CaretDown className={`size-4 transition-transform ${(expandedFilters[index] ?? true) ? "" : "-rotate-90"}`} />
                    </button>
                  </div>
                </div>

                {(expandedFilters[index] ?? true) ? (
                  <div className="space-y-3 border-t border-sky-100 p-3">
                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500">Column</div>
                      <FieldShell className="px-0 py-0">
                        <label className="flex w-full">
                          <select
                            className="w-full rounded-md bg-transparent px-3 py-2 text-sm"
                            value={row.column}
                            onChange={(e) => updateFilterRow(index, "column", e.target.value)}
                          >
                            <option value="">Please select a column...</option>
                            {joinColumns.map((column) => (
                              <option key={column.name} value={column.name}>
                                {toOptionLabel(column.display_name, column.name)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </FieldShell>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500">Operation</div>
                      <FieldShell className="px-0 py-0">
                        <label className="flex w-full">
                          <select
                            className="w-full rounded-md bg-transparent px-3 py-2 text-sm"
                            value={row.operator || "in"}
                            onChange={(e) => updateFilterRow(index, "operator", e.target.value)}
                          >
                            <option value="in">contains</option>
                          </select>
                        </label>
                      </FieldShell>
                    </div>

                    <div>
                      <div className="mb-1 text-xs font-medium text-slate-500">Value</div>
                      <FieldShell className="px-0 py-0">
                        <label className="flex w-full">
                          <input
                            className="w-full rounded-md bg-transparent px-3 py-2 text-sm"
                            type="text"
                            placeholder="select..."
                            value={row.valuesText}
                            onChange={(e) => updateFilterRow(index, "valuesText", e.target.value)}
                          />
                        </label>
                      </FieldShell>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <ManagerActionPill color="blue" text="+ Condition" onClick={addFilterRow} />
          </div>
        </div>
      </div>

    </div>
  );
}

export default JoinQueryBuilder;
