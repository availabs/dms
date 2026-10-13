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
  const { pageBaseUrl } = React.useContext(DatasetsContext) || {};
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...uploadsTheme, ...(theme?.datasets?.uploads || {}) };
  return (
    <div className={t.tableWrapper}>
      {uploads && uploads.length ? (
        <>
          <div className={t.tableHeaderRow}>
            {[
              "Id",
              "Status",
              "Type",
              "Queued",
              "Completed",
            ].map((key) => (
              <dt key={key} className={t.tableHeaderCell}>
                {key}
              </dt>
            ))}
          </div>
          <dl className={t.tableList}>
            {(uploads || []).map((d, i) => (
              <div
                key={`${i}_0`}
                className={t.tableRow}
                // was `/source/…` without the pattern's base url (pageBaseUrl = <baseUrl>/source)
                onClick={() =>
                  navigate(`${pageBaseUrl}/${sourceId}/uploads/${d?.task_id}`)
                }
              >
                {/* a load is a DAMA task (uda tasks routes) — see index.jsx */}
                <dd key={`${i}_1`} className={t.tableCellId}>{d?.task_id}</dd>
                <dd key={`${i}_2`} className={t.tableCell}><StatusCell status={d?.status} t={t}/></dd>
                <dd key={`${i}_3`} className={t.tableCell}>{d?.worker_path}</dd>
                <dd key={`${i}_4`} className={t.tableCell}>{fmtTs(d?.queued_at)}</dd>
                <dd key={`${i}_5`} className={t.tableCell}>{fmtTs(d?.completed_at)}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className={t.noDataMsg}>{"No Uploads found"}</div>
      )}
    </div>
  );
};

export default ListUploads;
