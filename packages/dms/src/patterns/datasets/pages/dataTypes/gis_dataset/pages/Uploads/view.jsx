import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { get } from "lodash-es"
import { DatasetsContext } from "../../../../../context";
import { getExternalEnv } from "../../../../../utils/datasources";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { uploadsTheme } from "./uploads.theme";
import { StatusCell } from "./list";

// One load (DAMA task) of the source and its events — `uda[env].tasks.byId[id]` (+ `.events`), the
// same routes as the task page. (It used to read `dama[env].etlContexts.byEtlContextId`, which
// dms-server doesn't serve.) Events are capped at the first 500.
const EVENT_ATTRS = ["event_id", "type", "created_at"];
const MAX_EVENTS = 500;

export default function Upload({ ctxId, sourceId }) {
  const { datasources, falcor, pageBaseUrl, UI } = React.useContext(DatasetsContext);
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...uploadsTheme, ...(theme?.datasets?.uploads || {}) };
  const { Icon, Table } = UI || {};
  const gridRef = React.useRef();
  const navigate = useNavigate();
  const pgEnv = getExternalEnv(datasources);
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!falcor || !pgEnv || !ctxId) return;
    let cancelled = false;
    (async () => {
      const taskPath = ["uda", pgEnv, "tasks", "byId", +ctxId];
      const lenPath = [...taskPath, "events", "length"];
      const res = await falcor.get([...taskPath, "status"], lenPath);
      const length = Math.min(+get(res, ["json", ...lenPath], 0), MAX_EVENTS);
      if (!cancelled) setStatus(get(res, ["json", ...taskPath, "status"], null));
      if (!length) { if (!cancelled) setEvents([]); return; }

      const evRes = await falcor.get([...taskPath, "events", "byIndex", { from: 0, to: length - 1 }, EVENT_ATTRS]);
      const indexed = get(evRes, ["json", ...taskPath, "events", "byIndex"], {});
      const rows = [];
      for (let i = 0; i < length; i++) if (indexed[i]?.event_id != null) rows.push(indexed[i]);
      if (!cancelled) setEvents(rows);
    })();
    return () => { cancelled = true; };
  }, [falcor, pgEnv, ctxId]);

  return (
    <>
      {t.backLink ? (
        <>
          <a className={t.backLink} onClick={() => navigate(`${pageBaseUrl}/${sourceId}/uploads`)}>
            {Icon && t.backIcon ? <Icon icon={t.backIcon} className={t.backIconClass}/> : null}all uploads
          </a>
          <div className={t.viewTitleRow}>
            <span className={t.viewTitle}>Upload {ctxId}</span>
            <StatusCell status={status} t={t}/>
          </div>
        </>
      ) : null}
      <div className={t.tableWrapper}>
        {events.length ? (
          // UI.Table (`t.tableStyle`)
          <Table data={events} gridRef={gridRef} isEdit={false} activeStyle={t.tableStyle || undefined}
            display={{ disableCellSelection: true }}
            columns={[
              { name: "event_id", display_name: "Id", show: true, type: "ui",
                Comp: ({ value, className }) => <div className={className}><span className={t.tableCell}>{value}</span></div> },
              { name: "type", display_name: "Event Type", show: true, type: "ui",
                Comp: ({ value, className }) => <div className={className}><span className={t.tableCellId}>{value?.split(":").pop()}</span></div> },
              { name: "created_at", display_name: "Timestamp", show: true, type: "ui",
                Comp: ({ value, className }) => <div className={className}><span className={t.tableCell}>{String(value?.value ?? value ?? '').replace("T", " ").slice(0, 19)}</span></div> },
            ]}/>
        ) : (
          <div className={t.noDataMsg}>{"No Events found"}</div>
        )}
      </div>
    </>
  );
}
