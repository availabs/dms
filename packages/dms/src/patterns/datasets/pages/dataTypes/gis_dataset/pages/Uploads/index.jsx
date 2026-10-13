import React, { useEffect, useState } from "react";
import { get } from "lodash-es"

import { DatasetsContext } from "../../../../../context";
import { getExternalEnv } from "../../../../../utils/datasources";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { uploadsTheme } from "./uploads.theme";

import ListUploads from "./list";
import Upload from "./view";

// Registered as the `uploads` page of gis_dataset / csv_dataset (2026-10-07 — the GIS publish flow
// already navigated to /source/:id/uploads/:ctx, which used to fall through to the Overview).
// /uploads lists the loads of this source; /uploads/:ctx shows one load's events.
//
// Data: a load is a DAMA task (the publish returns its task id as `etl_context_id`). This page used
// to read the legacy DAMA-server routes `dama[env].etlContextsbyDamaSourceId` /
// `dama[env].etlContexts.byEtlContextId`, which dms-server does not serve (they returned empty
// atoms) — it now reads the same `uda[env].tasks` routes as the Tasks list / task page.
const TASK_ATTRS = ["task_id", "status", "worker_path", "queued_at", "completed_at"];

const UploadsPage = ({ source, params = {} }) => {
  const { datasources, falcor } = React.useContext(DatasetsContext);
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...uploadsTheme, ...(theme?.datasets?.uploads || {}) };
  const pgEnv = getExternalEnv(datasources);
  // the source route's trailing segment is `view_id`; on this page it carries the task (ETL context) id
  const ctxId = params.view_id;
  const sourceId = Number(source?.source_id);
  const [uploads, setUploads] = useState([]);

  // hooks run before any early return (the old early return skipped this effect → hook-order error)
  useEffect(() => {
    if (ctxId || !sourceId || !pgEnv || !falcor) return;
    let cancelled = false;
    (async () => {
      const lengthPath = ["uda", pgEnv, "tasks", "forSource", sourceId, "length"];
      const lenRes = await falcor.get(lengthPath);
      const length = +get(lenRes, ["json", ...lengthPath], 0);
      if (!length) { if (!cancelled) setUploads([]); return; }

      const res = await falcor.get(["uda", pgEnv, "tasks", "forSource", sourceId, "byIndex", { from: 0, to: length - 1 }, TASK_ATTRS]);
      // byIndex holds refs to tasks.byId — follow them (cold cache returns the bare ref; see UdaTaskList)
      const indexed = get(res, ["json", "uda", pgEnv, "tasks", "forSource", sourceId, "byIndex"], {});
      const byId = get(res, ["json", "uda", pgEnv, "tasks", "byId"], {});
      const rows = [];
      for (let i = 0; i < length; i++) {
        let row = indexed[i];
        if (row && row.$type === "ref" && Array.isArray(row.value)) row = byId[row.value[row.value.length - 1]];
        if (row && row.task_id != null) rows.push(row);
      }
      if (!cancelled) setUploads(rows);
    })();
    return () => { cancelled = true; };
  }, [falcor, pgEnv, sourceId, ctxId]);

  const body = ctxId ? (
    <Upload ctxId={ctxId} sourceId={sourceId} />
  ) : (
    <>
      <div className={t.indexHeader}>
        <div className={t.indexHeaderLabel}>Upload Views</div>
        {t.indexHeaderHint ? <div className={t.indexHeaderHint}>one row per load (ETL task) of this source</div> : null}
      </div>
      <ListUploads uploads={uploads} sourceId={sourceId}/>
    </>
  );
  return t.page ? <div className={t.page}>{body}</div> : body;
};

export default UploadsPage;
