import React, { useContext, useEffect, useMemo } from "react";
import { get } from "lodash-es";
import { SymbologyContext } from "../../../";
import { MapEditorContext } from "../../../../context";
import { getAttributes } from "../../../../attributes";
import { getJoinOutputKey, getJoinOutputLabel } from "./constants";
const EMPTY_ARRAY = [];
const FieldShell = ({ children }) => (
  <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
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

function JoinSetup({ config, setLinkedDataConfig }) {
  const { state } = useContext(SymbologyContext);
  const mapEditorContext = useContext(MapEditorContext) || {};
  const { pgEnv, useFalcor } = mapEditorContext;
  const falcorApi = typeof useFalcor === "function" ? useFalcor() : mapEditorContext;
  const falcor = falcorApi?.falcor;
  const falcorCache = falcorApi?.falcorCache || falcor?.getCache?.() || {};

  const activeLayerId = state?.symbology?.activeLayer;
  const sourceId = get(state, `symbology.layers[${activeLayerId}].source_id`);

  useEffect(() => {
    async function fetchSources() {
      const lengthPath = ["uda", pgEnv, "sources", "length"];
      const resp = await falcor.get(lengthPath);
      await falcor.get([
        "uda", pgEnv, "sources", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        ["source_id", "name", "display_name"],
      ]);
    }

    if (falcor && pgEnv) {
      fetchSources();
    }
  }, [falcor, pgEnv]);

  useEffect(() => {
    if (sourceId && falcor && pgEnv) {
      falcor.get(["uda", pgEnv, "sources", "byId", sourceId, "metadata"]);
    }
  }, [falcor, pgEnv, sourceId]);

  useEffect(() => {
    async function fetchViews() {
      const lengthPath = ["uda", pgEnv, "sources", "byId", config.source.sourceId, "views", "length"];
      const resp = await falcor.get(lengthPath);
      await falcor.get([
        "uda", pgEnv, "sources", "byId", config.source.sourceId, "views", "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        ["view_id", "version", "_created_timestamp", "_modified_timestamp"],
      ]);
    }

    if (config.source.sourceId && falcor && pgEnv) {
      fetchViews();
      falcor.get(["uda", pgEnv, "sources", "byId", config.source.sourceId, "metadata"]);
    }
  }, [config.source.sourceId, falcor, pgEnv]);

  const featureColumns = useMemo(() => {
    let columns = get(falcorCache, [
      "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value", "columns",
    ], []);
    if (!columns.length) {
      columns = get(falcorCache, [
        "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value",
      ], []);
    }
    return Array.isArray(columns) ? columns.filter((col) => col?.name !== "wkb_geometry") : EMPTY_ARRAY;
  }, [falcorCache, pgEnv, sourceId]);

  const sources = useMemo(() => {
    return Object.values(get(falcorCache, ["uda", pgEnv, "sources", "byIndex"], {}))
      .map((ref) => getAttributes(get(falcorCache, ref.value, {})))
      .filter((source) => source?.source_id);
  }, [falcorCache, pgEnv]);

  const joinViews = useMemo(() => {
    return Object.values(get(falcorCache, ["uda", pgEnv, "sources", "byId", config.source.sourceId, "views", "byIndex"], {}))
      .map((ref) => getAttributes(get(falcorCache, ref.value, {})))
      .filter((view) => view?.view_id);
  }, [config.source.sourceId, falcorCache, pgEnv]);

  const joinOutputColumns = useMemo(() => {
    return (config.query.columnConfigs || [])
      .map((columnConfig) => {
        const value = getJoinOutputKey(columnConfig);
        if (!value) return null;
        return {
          value,
          label: getJoinOutputLabel(columnConfig),
        };
      })
      .filter(Boolean);
  }, [config.query.columnConfigs]);

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="text-sm font-medium text-slate-700">Join Setup</div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Geometry key column</div>
        <FieldShell>
          <label className="flex w-full">
            <select
              className="w-full bg-transparent text-sm"
              value={config.featureKeyColumn}
              onChange={(e) =>
                setLinkedDataConfig((nextConfig) => {
                  nextConfig.featureKeyColumn = e.target.value;
                })
              }
            >
              <option value="">Select geometry key</option>
              {featureColumns.map((column) => (
                <option key={column.name} value={column.name}>
                  {toOptionLabel(column.display_name, column.name)}
                </option>
              ))}
            </select>
          </label>
        </FieldShell>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Join source</div>
        <FieldShell>
          <label className="flex w-full">
            <select
              className="w-full bg-transparent text-sm"
              value={config.source.sourceId ?? ""}
              onChange={(e) =>
                setLinkedDataConfig((nextConfig) => {
                  nextConfig.source.sourceId = e.target.value ? +e.target.value : null;
                  nextConfig.source.viewId = null;
                  nextConfig.source.env = pgEnv || null;
                  nextConfig.joinColumn = "";
                  nextConfig.query.columns = [];
                  nextConfig.query.groupBy = [];
                  nextConfig.query.columnConfigs = [];
                  nextConfig.query.filterRows = [];
                  nextConfig.query.filterMode = "all";
                  nextConfig.query.filters = {};
                  nextConfig.tileColumns = [];
                })
              }
            >
              <option value="">Select join source</option>
              {sources.map((source) => (
                <option key={source.source_id} value={source.source_id}>
                  {toOptionLabel(source.display_name, source.name, source.source_id)}
                </option>
              ))}
            </select>
          </label>
        </FieldShell>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Join view</div>
        <FieldShell>
          <label className="flex w-full">
            <select
              className="w-full bg-transparent text-sm"
              value={config.source.viewId ?? ""}
              onChange={(e) =>
                setLinkedDataConfig((nextConfig) => {
                  nextConfig.source.viewId = e.target.value ? +e.target.value : null;
                })
              }
            >
              <option value="">Select join view</option>
              {joinViews.map((view) => (
                <option key={view.view_id} value={view.view_id}>
                  {toOptionLabel(view.version, view.view_id)}
                </option>
              ))}
            </select>
          </label>
        </FieldShell>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Join output column</div>
        <FieldShell>
          <label className="flex w-full">
            <select
              className="w-full bg-transparent text-sm"
              value={config.joinColumn}
              onChange={(e) =>
                setLinkedDataConfig((nextConfig) => {
                  nextConfig.joinColumn = e.target.value;
                })
              }
            >
              <option value="">Select join output</option>
              {joinOutputColumns.map((column) => (
                <option key={column.value} value={column.value}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
        </FieldShell>
      </div>
    </div>
  );
}

export default JoinSetup;
