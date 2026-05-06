import React, { useContext, useEffect, useMemo } from "react";
import { get, set } from "lodash-es";
import { SymbologyContext } from "../../../";
import { MapEditorContext } from "../../../../context";
import { StyledControl } from "../ControlWrappers";
import { normalizeLayerClickFilterConfig } from "../../../stateUtils";

const EMPTY_ARRAY = [];

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
    if (!sourceId || !pgEnv) return EMPTY_ARRAY;

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

    return Array.isArray(columns)
      ? columns.filter((col) => col?.name !== "wkb_geometry")
      : EMPTY_ARRAY;
  }, [falcorCache, pgEnv, sourceId]);

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
      nextConfig.mappings.push({ variable: "", field: "" });
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
              <div key={index} className="rounded border border-slate-200 p-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm text-slate-700">Filter mapping {index + 1}</div>
                  <button
                    type="button"
                    className="text-xs text-red-500"
                    onClick={() => removeMapping(index)}
                  >
                    Remove
                  </button>
                </div>

                <div>
                  <div className="mb-1 text-sm text-slate-700">Filter variable</div>
                  <StyledControl>
                    <label className="flex w-full">
                      <input
                        className="w-full bg-transparent py-2"
                        type="text"
                        placeholder="Enter variable name"
                        value={mapping.variable}
                        onChange={(e) => updateMapping(index, "variable", e.target.value)}
                      />
                    </label>
                  </StyledControl>
                  {/* <div className="mt-1 text-xs text-slate-500">
                    Enter the filter name you want to update when this layer is clicked.
                  </div> */}
                  {isDuplicate ? (
                    <div className="mt-1 text-xs text-red-600">
                      This variable name is already used in another mapping on this layer.
                    </div>
                  ) : null}
                </div>

                <div className="mt-3">
                  <div className="mb-1 text-sm text-slate-700">Use layer field</div>
                  <StyledControl>
                    <label className="flex w-full">
                      <div className="flex w-full items-center">
                        <select
                          className="w-full py-2 bg-transparent"
                          value={mapping.field}
                          onChange={(e) => updateMapping(index, "field", e.target.value)}
                        >
                          <option value="">Select field</option>
                          {sourceColumns.map((column) => (
                            <option key={column.name} value={column.name}>
                              {column.display_name || column.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </StyledControl>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="text-sm text-blue-600"
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
