import React, { useContext, useEffect, useMemo } from "react";
import { get, set } from "lodash-es";
import { SymbologyContext } from "../../../";
import { MapEditorContext } from "../../../../context";
import { normalizeLayerClickFilterConfig } from "../../../stateUtils";
import { formatJoinOptionLabel, getJoinOutputKey, getJoinOutputLabel } from "../LinkedDataControl/constants";

const EMPTY_ARRAY = [];
const FieldShell = ({ children, className = "" }) => (
  <div className={`rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm ${className}`}>
    {children}
  </div>
);
const getJoinedColumnOptions = (state, activeLayerId) => {
  const joinConfig =
    get(state, `symbology.layers[${activeLayerId}].join`) ??
    get(state, `symbology.layers[${activeLayerId}]['linked-data']`, {});
  const columnConfigs = Array.isArray(joinConfig?.query?.columnConfigs)
    ? joinConfig.query.columnConfigs
    : [];

  return columnConfigs
    .map((columnConfig) => {
      const name = getJoinOutputKey(columnConfig);
      if (!name) return null;
      return {
        name,
        display_name: getJoinOutputLabel(columnConfig),
        _joined: true,
      };
    })
    .filter(Boolean);
};

function ClickFilterControl() {
  const { state, setState } = useContext(SymbologyContext);
  const mapEditorContext = useContext(MapEditorContext) || {};
  const { pgEnv, useFalcor } = mapEditorContext;
  const falcorApi = typeof useFalcor === "function" ? useFalcor() : mapEditorContext;
  const falcor = falcorApi?.falcor;
  const falcorCache = falcorApi?.falcorCache || falcor?.getCache?.() || {};

  const activeLayerId = state?.symbology?.activeLayer;
  const sourceId = get(state, `symbology.layers[${activeLayerId}].source_id`);
  const clickFilterPath = `symbology.layers[${activeLayerId}]['click-filter']`;

  useEffect(() => {
    if (sourceId && falcor && pgEnv) {
      falcor.get(["uda", pgEnv, "sources", "byId", sourceId, "metadata"]);
    }
  }, [falcor, pgEnv, sourceId]);

  const sourceColumns = useMemo(() => {
    let filteredColumns = EMPTY_ARRAY;

    if (sourceId && pgEnv) {
      let columns = get(falcorCache, [
        "uda",
        pgEnv,
        "sources",
        "byId",
        sourceId,
        "metadata",
        "value",
        "columns",
      ], []);

      if (columns.length === 0) {
        columns = get(falcorCache, [
          "uda",
          pgEnv,
          "sources",
          "byId",
          sourceId,
          "metadata",
          "value",
        ], []);
      }

      filteredColumns = Array.isArray(columns)
        ? columns.filter((col) => col?.name !== "wkb_geometry")
        : EMPTY_ARRAY;
    }

    const joinedColumns = getJoinedColumnOptions(state, activeLayerId);
    const existingNames = new Set(filteredColumns.map((column) => column?.name));

    return [
      ...filteredColumns,
      ...joinedColumns.filter((column) => !existingNames.has(column.name)),
    ];
  }, [falcorCache, pgEnv, sourceId, state, activeLayerId]);

  const currentConfig = useMemo(() => {
    return normalizeLayerClickFilterConfig(get(state, clickFilterPath, {}));
  }, [state, clickFilterPath]);

  const setClickFilterConfig = (updater) => {
    setState((draft) => {
      const nextConfig = normalizeLayerClickFilterConfig(get(draft, clickFilterPath, {}));
      updater(nextConfig);
      set(draft, clickFilterPath, nextConfig);
    });
  };

  const updateMapping = (index, key, value) => {
    setClickFilterConfig((nextConfig) => {
      nextConfig.mappings[index][key] = value;
    });
  };

  const addMapping = () => {
    setClickFilterConfig((nextConfig) => {
      nextConfig.mappings.push({
        variable: "",
        field: "",
        useSearchParams: false,
        redirectOnClick: false,
      });
    });
  };

  const removeMapping = (index) => {
    setClickFilterConfig((nextConfig) => {
      nextConfig.mappings.splice(index, 1);
    });
  };

  const duplicateVariableIndexes = useMemo(() => {
    const seen = new Map();
    const duplicates = new Set();

    currentConfig.mappings.forEach((mapping, index) => {
      const normalized = mapping.variable.trim().toLowerCase();
      if (!normalized) return;

      if (seen.has(normalized)) {
        duplicates.add(index);
        duplicates.add(seen.get(normalized));
      } else {
        seen.set(normalized, index);
      }
    });

    return duplicates;
  }, [currentConfig.mappings]);

  return (
    <div className="mx-4 mt-3 border-t border-slate-200 pt-3">
      <div className="w-full text-slate-500 text-[14px] tracking-wide">
        Layer Click Filter
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-700">Enable layer as filter</div>
        <input
          type="checkbox"
          checked={currentConfig.enabled}
          onChange={(e) =>
            setClickFilterConfig((nextConfig) => {
              nextConfig.enabled = e.target.checked;
              if (e.target.checked && !nextConfig.mappings.length) {
                nextConfig.mappings.push({ variable: "", field: "" });
              }
            })
          }
        />
      </div>

      {currentConfig.enabled ? (
        <div className="mt-3 space-y-3">
          {currentConfig.mappings.map((mapping, index) => {
            const isDuplicate = duplicateVariableIndexes.has(index);

            return (
              <div key={index} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-700">Filter mapping {index + 1}</div>
                  <button
                    type="button"
                    className="text-xs text-red-500 hover:text-red-600"
                    onClick={() => removeMapping(index)}
                  >
                    Remove
                  </button>
                </div>

                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Filter variable</div>
                  <FieldShell className="px-0 py-0">
                    <label className="flex w-full">
                      <input
                        className="w-full rounded-md bg-transparent px-3 py-2 text-sm"
                        type="text"
                        placeholder="Enter variable name"
                        value={mapping.variable}
                        onChange={(e) => updateMapping(index, "variable", e.target.value)}
                      />
                    </label>
                  </FieldShell>
                  {isDuplicate ? (
                    <div className="mt-1 text-xs text-red-600">
                      This variable name is already used in another mapping on this layer.
                    </div>
                  ) : null}
                </div>

                <div className="mt-3">
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Use layer field</div>
                  <FieldShell className="px-0 py-0">
                    <label className="flex w-full">
                      <div className="flex w-full items-center">
                        <select
                          className="w-full rounded-md bg-transparent px-3 py-2 text-sm"
                          value={mapping.field}
                          onChange={(e) => updateMapping(index, "field", e.target.value)}
                        >
                          <option value="">Select field</option>
                          {sourceColumns.map((column) => (
                            <option key={column.name} value={column.name}>
                              {formatJoinOptionLabel(column.display_name || column.name, column._joined)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </FieldShell>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-700">Redirect on click</div>
                  <input
                    type="checkbox"
                    checked={Boolean(mapping.redirectOnClick)}
                    onChange={(e) => updateMapping(index, "redirectOnClick", e.target.checked)}
                  />
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="inline-flex rounded-md bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-600 hover:bg-blue-100"
            onClick={addMapping}
          >
            Add filter variable
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default ClickFilterControl;
