import React from "react";
import { useNavigate } from "react-router";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { uploadsTheme } from "./uploads.theme";

const ListUploads = ({ uploads = [], sourceId = null }) => {
  const navigate = useNavigate();
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
              "Initial Event Id",
              "Latest Event Id",
              "Last Updated",
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
                onClick={() =>
                  navigate(`/source/${sourceId}/uploads/${d?.etl_context_id}`)
                }
              >
                <dd key={`${i}_1`} className={t.tableCell}>{d?.etl_context_id}</dd>
                <dd key={`${i}_2`} className={t.tableCell}>{d?.etl_status}</dd>
                <dd key={`${i}_3`} className={t.tableCell}>{d?.initial_event_id}</dd>
                <dd key={`${i}_4`} className={t.tableCell}>{d?.latest_event_id}</dd>
                <dd key={`${i}_5`} className={t.tableCell}>{d?._modified_timestamp?.value}</dd>
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
