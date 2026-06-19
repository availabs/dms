import React, { useEffect, useMemo } from "react";
import { get } from "lodash-es"
import { DatasetsContext } from "../../../../../context";
import { getExternalEnv } from "../../../../../utils/datasources";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { uploadsTheme } from "./uploads.theme";

export default function Upload({ ctxId }) {
  const { datasources, falcor, falcorCache } = React.useContext(DatasetsContext);
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...uploadsTheme, ...(theme?.datasets?.uploads || {}) };
  const pgEnv = getExternalEnv(datasources);

  useEffect(() => {
    async function getCtxById() {
      await falcor.get(["dama", pgEnv, "etlContexts", "byEtlContextId", ctxId]);
    }
    getCtxById();
  }, [falcor, pgEnv, ctxId]);

  const ctx = useMemo(() => {
    return get(falcorCache, [
      "dama",
      pgEnv,
      "etlContexts",
      "byEtlContextId",
      ctxId,
      "value",
    ]);
  }, [falcorCache]);

  return (
    <div className={t.tableWrapper}>
      {ctx && ctx?.events && ctx?.events?.length ? (
        <>
          <div className={t.tableHeaderRow}>
            {["Id", "Event Type", "Timestamp"].map((key) => (
              <dt key={key} className={t.tableHeaderCell}>
                {key}
              </dt>
            ))}
          </div>
          <dl className={t.tableList}>
            {(ctx?.events || []).map((d, i) => (
              <div
                key={`${i}_0`}
                className={t.tableRow}
              >
                <dd key={`${i}_1`} className={t.tableCell}>{d?.event_id}</dd>
                <dd key={`${i}_2`} className={t.tableCell}>{d?.type?.split(":").pop()}</dd>
                <dd key={`${i}_3`} className={t.tableCell}>{d._created_timestamp}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className={t.noDataMsg}>{"No Events found"}</div>
      )}
    </div>
  );
}
