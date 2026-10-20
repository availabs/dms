import React from "react";
import { useNavigate } from "react-router";
import { DatasetsContext } from "../../../../../context";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { uploadsTheme } from "./uploads.theme";
import { udaTaskPageTheme } from "../../../../Tasks/UdaTaskPage.theme";

// Status as the task status pill (same keys as the task list / task page) when `statusPill` is set.
export const StatusCell = ({ status, t }) => {
  const { theme } = React.useContext(ThemeContext) || {};
  if (!t.statusPill) return status ?? null;
  const s = { ...udaTaskPageTheme, ...(theme?.datasets?.udaTaskPage || {}) };
  const colors = { done: s.statusDone, error: s.statusError, running: s.statusRunning, queued: s.statusQueued };
  return status ? <span className={`${s.statusBadge} ${colors[status] || s.statusDefault}`}>{status}</span> : null;
};

// uda timestamps arrive as atoms or ISO strings → "YYYY-MM-DD HH:MM"
const fmtTs = (v) => {
  const raw = v && typeof v === "object" ? v.value : v;
  return raw ? String(raw).replace("T", " ").slice(0, 16) : "—";
};

const ListUploads = ({ uploads = [], sourceId = null }) => {
  const navigate = useNavigate();
  const { pageBaseUrl, UI } = React.useContext(DatasetsContext) || {};
  const { Table } = UI || {};
  const gridRef = React.useRef();
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...uploadsTheme, ...(theme?.datasets?.uploads || {}) };
  return (
    <div className={t.tableWrapper}>
      {uploads && uploads.length ? (
        // UI.Table (`t.tableStyle`); a load is a DAMA task (uda tasks routes) — see index.jsx
        <Table data={uploads} gridRef={gridRef} isEdit={false} activeStyle={t.tableStyle || undefined}
          display={{ disableCellSelection: true }}
          onRowMouseClick={(d) => navigate(`${pageBaseUrl}/${sourceId}/uploads/${d?.task_id}`)}
          columns={[
            { name: "task_id", display_name: "Id", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.tableCellId}>{value}</span></div> },
            { name: "status", display_name: "Status", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.tableCell}><StatusCell status={value} t={t}/></span></div> },
            { name: "worker_path", display_name: "Type", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.tableCell}>{value}</span></div> },
            { name: "queued_at", display_name: "Queued", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.tableCell}>{fmtTs(value)}</span></div> },
            { name: "completed_at", display_name: "Completed", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.tableCell}>{fmtTs(value)}</span></div> },
          ]}/>
      ) : (
        <div className={t.noDataMsg}>{"No Uploads found"}</div>
      )}
    </div>
  );
};

export default ListUploads;
